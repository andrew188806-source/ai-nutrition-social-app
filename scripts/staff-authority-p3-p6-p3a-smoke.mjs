#!/usr/bin/env node
// Pure P3A contract smoke. Disposable PostgreSQL validation is a separate required gate.
import crypto from "node:crypto";
import fs from "node:fs";

const MIGRATION = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const sql = fs.readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const checks = [], failures = [];
function check(name, pass, detail) { const x = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) }; checks.push(x); if (!x.pass) failures.push(x); console.log(`${x.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); }
const management = [
  "admin.management.read", "admin.management.permissions.read", "admin.management.staff.read",
  "admin.management.staff.account.write", "admin.management.staff.bundle.write",
  "admin.management.staff.permission.write", "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write"
];
const current = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"];
const validPermission = (key) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(key) && !key.includes("*") && !key.includes("%");
const validWindow = (from, until) => until === null || until > from;
const validDelegation = (x) => validPermission(x.permission) && x.scope === "global"
  && ["active", "revoked"].includes(x.status) && validWindow(x.from, x.until)
  && (x.grant || x.revoke) && (!x.temporary || x.grant)
  && (x.status === "active" ? x.revokedAt === null : x.revokedAt !== null);
const receipts = new Map();
function receipt(actor, request, payload) { const key = `${actor}:${request}`; if (receipts.has(key)) return false; receipts.set(key, payload); return true; }

check("A migration transaction is complete", /^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/.test(sql));
check("B eight management keys are exact", management.every((key) => sql.includes(`'${key}'`)));
check("C every management key is PLANNED", (sql.match(/'active', 'planned', 'SECURITY_AUTH'/g) ?? []).length === 8 && !/admin\.management[^\n]*'current'/.test(sql));
check("D existing three current keys remain application vocabulary", current.every((key) => fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8").includes(`\"${key}\"`)));
check("E only bounded P3B/P3C writer keys may enter current application vocabulary", management.every((key) => ["admin.management.staff.account.write", "admin.management.staff.delegation.write"].includes(key) || !fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8").includes(`\"${key}\"`)));
check("F exact permission key is accepted", validPermission("admin_restaurant_branch.status.write"));
check("G wildcard is rejected", !validPermission("admin_restaurant_branch.*"));
check("H unknown permission is FK-governed", /staff_permission_delegations_permission_fkey[\s\S]*staff_permission_catalog/.test(sql));
check("I GLOBAL scope is accepted", validDelegation({ permission: current[2], scope: "global", status: "active", from: 1, until: null, grant: true, revoke: false, temporary: false, revokedAt: null }));
check("J non-GLOBAL scope is rejected", !validDelegation({ permission: current[2], scope: "restaurant", status: "active", from: 1, until: null, grant: true, revoke: false, temporary: false, revokedAt: null }));
check("K invalid window is rejected", !validDelegation({ permission: current[2], scope: "global", status: "active", from: 2, until: 2, grant: true, revoke: false, temporary: false, revokedAt: null }));
check("L active delegation shape is accepted", validDelegation({ permission: current[2], scope: "global", status: "active", from: 1, until: 2, grant: false, revoke: true, temporary: false, revokedAt: null }));
check("M revoked delegation shape is accepted", validDelegation({ permission: current[2], scope: "global", status: "revoked", from: 1, until: 2, grant: true, revoke: true, temporary: true, revokedAt: 2 }));
check("N empty grant/revoke capability is rejected", !validDelegation({ permission: current[2], scope: "global", status: "active", from: 1, until: null, grant: false, revoke: false, temporary: false, revokedAt: null }));
check("O temporary capability does not exist without grant", !validDelegation({ permission: current[2], scope: "global", status: "active", from: 1, until: null, grant: false, revoke: true, temporary: true, revokedAt: null }));
check("P revoked delegation is terminal", /staff_permission_delegation_revoked_terminal/.test(sql));
check("Q exact receipt identity inserts once", receipt("actor-a", "request-a", { operation: "staff_account_link" }));
check("R duplicate exact receipt identity is rejected", !receipt("actor-a", "request-a", { operation: "staff_account_link" }));
check("S distinct request identity is accepted", receipt("actor-a", "request-b", { operation: "staff_account_link" }));
check("T audit insert is restricted to sealed writers", /staff_management_audit_writer_insert[\s\S]*staff_console_admission_authority with check \(true\)/.test(sql));
check("U authenticated and service_role direct table paths are revoked", (sql.match(/from public, anon, authenticated, authenticator, service_role;/g) ?? []).length >= 3);
check("V granular roles are sealed", (sql.match(/create role staff_[a-z_]+ nologin noinherit nobypassrls;/g) ?? []).length === 6);
check("W no delegation, receipt, or audit rows are seeded", !/insert into admin_internal\.staff_(?:permission_delegations|management_operation_receipts|management_audit_log)/.test(sql));
check("X application vocabulary is exact through bounded P3C", ["196b6ad67dd9398b81d1e5ae9dc2a1951e5477db4aa664a9fad79eb0e308513d", "a19c9415b127792dfe394a9563ad8a0dc8ed0b65923327496540d095eab20b3c", "657b13cdd67ad0b0b72b202a16fef4a34d1da695962e33e706815037282c0df6"].includes(sha("apps/admin-web/auth/admin-current-permission-vocabulary.ts")));
check("Y P2A resolver remains frozen", sha("supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql") === "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d");

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3a-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((x) => x.name), databaseUsed: false, networkUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
