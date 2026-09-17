#!/usr/bin/env node
// P3-P6-P3A static authority and repository-boundary guard.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import { P3B_SUCCESSOR_PATHS, isBoundedP3BSuccessor } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";

const ROOT = process.cwd();
const PREDECESSOR = "922f1c6b89220723ac3cef118d8e172c67f64865";
const SUBJECT = "Add staff management authority foundation";
const MIGRATION = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const OWN = new Set([
  MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p3a-guard.mjs",
  "scripts/staff-authority-p3-p6-p3a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3a-mutations.mjs"
]);
const P3B_HEAD = "5590b3dd287247ea3b26983cb393339b0affa63c";
const P3B_SUBJECT = "Add staff account management operators";
const P3B_MIGRATION = "supabase/migrations/20260914020000_staff_management_p3_p6_p3b_account_operator.sql";
const P3B_PATHS = new Set([
  P3B_MIGRATION, "package.json", "apps/admin-web/auth/admin-current-permission-vocabulary.ts",
  "scripts/staff-authority-p3-p6-p3b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3b-mutations.mjs"
]);
const SUCCESSOR_AWARENESS = new Set([
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-b-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
]);
const REGRESSION_FIXTURES = new Set([
  "scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs"
]);
const ALLOWED = new Set([...OWN, ...SUCCESSOR_AWARENESS, ...REGRESSION_FIXTURES, ...P3B_PATHS, ...P3B_SUCCESSOR_PATHS]);
const MANAGEMENT_KEYS = [
  "admin.management.read",
  "admin.management.permissions.read",
  "admin.management.staff.read",
  "admin.management.staff.account.write",
  "admin.management.staff.bundle.write",
  "admin.management.staff.permission.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write"
].sort();
const SEALED_ROLES = [
  "staff_management_reader", "staff_account_write_authority",
  "staff_bundle_assignment_authority", "staff_direct_grant_authority",
  "staff_delegation_write_authority", "staff_console_admission_authority"
];
const FROZEN = new Map([
  ["supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql", "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf"],
  ["supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql", "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4"],
  ["supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "c4f3877f889582a3af14533f530135beced7ba68a7d11f82e23f2b4ea996e835"],
  ["supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d"],
  ["supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql", "12b70090b757d32df79fbb3bbeda206f16a4458f3b1d091bf9476c59b16a410e"],
  ["supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql", "cd9aabb50c82b1308542a178cbf436116e620573a2371dc16b7811d0f5431658"],
  ["supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql", "26e757ff7b26471179c5e626094795bc30aa436087fcaa8244f5870ac3bf0a76"],
  ["apps/admin-web/auth/admin-current-permission-vocabulary.ts", "196b6ad67dd9398b81d1e5ae9dc2a1951e5477db4aa664a9fad79eb0e308513d"],
  ["apps/admin-web/auth/admin-context.ts", "b7f1f4a71e706f89d0227ba72c1e27d7ee11b51379315b6f45d93ac5329a93b5"],
  ["apps/admin-web/auth/admin-authority-selector.ts", "caa1984316cb5fc0edfd12f9a64f9bf49aa92cc45c5ba8ad368a3b5b3e7a2fb2"],
  ["apps/admin-web/auth/admin-protected-read-authority.ts", "32704544211bc3be7de2b8914caa0b69e8a6d6111a6d4a69c0b5effef711e6ad"],
  ["apps/admin-web/auth/admin-protected-mutation-authority.ts", "7196ccf72e37ea95e627116a8f99448990ff1631d1d0331deeddf8cbf133937d"]
]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
const git = (...args) => child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const lines = (value) => value.split(/\r?\n/).filter(Boolean);
const sql = read(MIGRATION);
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR
  && origin === PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0
  && git("log", "-1", "--format=%s") === SUBJECT;
const p3bCandidate = head === P3B_HEAD && origin === P3B_HEAD && ahead === 0 && behind === 0;
const p3bFrozen = head !== P3B_HEAD && git("rev-parse", "HEAD^") === P3B_HEAD
  && origin === P3B_HEAD && ahead === 1 && behind === 0 && status.length === 0
  && git("log", "-1", "--format=%s") === P3B_SUBJECT;
const p3bPhase = p3bCandidate || p3bFrozen;
const boundedP3CSuccessor = isBoundedP3BSuccessor();
const checks = [], failures = [];
function check(name, pass, detail) { const x = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) }; checks.push(x); if (!x.pass) failures.push(x); console.log(`${x.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); }

check("repository is exact P3A through bounded P3C lifecycle", candidate || frozen || p3bPhase || boundedP3CSuccessor, { head, origin, ahead, behind, status });
check("changed paths are bounded", changed.every((file) => ALLOWED.has(file)), changed.filter((file) => !ALLOWED.has(file)));
check("changed predecessor guards carry exact P3A successor awareness", changed.filter((file) => SUCCESSOR_AWARENESS.has(file)).every((file) => {
  const source = read(file);
  return source.includes(MIGRATION) && source.includes(SUBJECT) && source.includes(PREDECESSOR);
}));
check("all five P3A core paths exist", [...OWN].every((file) => fs.existsSync(path.join(ROOT, file))));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
check("migration count is exact through bounded P3C", boundedP3CSuccessor || migrations.length === (p3bPhase ? 118 : 117), migrations.length);
check("P3A is unique and exact successors are bounded", (boundedP3CSuccessor || migrations.at(-1) === path.basename(p3bPhase ? P3B_MIGRATION : MIGRATION)) && migrations.filter((f) => f.includes("p3a")).length === 1, migrations.at(-1));
check("frozen predecessors and runtime hashes are unchanged", [...FROZEN].every(([f, h]) => f === "apps/admin-web/auth/admin-current-permission-vocabulary.ts" && (p3bPhase || boundedP3CSuccessor) ? ["a19c9415b127792dfe394a9563ad8a0dc8ed0b65923327496540d095eab20b3c", "657b13cdd67ad0b0b72b202a16fef4a34d1da695962e33e706815037282c0df6", "337068a7c2284944589c5d885618afdc52e2f464785e0d81cda28bb4af7217b3", "3f6d4407f867ddce09fc327dfdd3932739a490d147ba8d4d49a33ea2188d8b52", "2a423be65bf08eed819015633ac78f519e4f07985d9ba27c2e625036811438a3"].includes(sha(f)) : sha(f) === h));
const seed = sql.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "";
const seeded = [...seed.matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'planned'/g)].map((m) => m[1]).sort();
check("eight management permission keys are exact", JSON.stringify(seeded) === JSON.stringify(MANAGEMENT_KEYS), seeded);
check("all P3A catalogue seeds are active and planned", (seed.match(/'active',\s*'planned'/g) ?? []).length === 8 && !/'current'/.test(seed));
check("management policy metadata is exact", (seed.match(/false, false, false, true, false, false/g) ?? []).length === 8);
check("admin_context metadata is absent from P3A mutation", !/insert[\s\S]*admin_context\.read|update[\s\S]*admin_context\.read/i.test(sql));
check("delegation table exists", /create table admin_internal\.staff_permission_delegations/.test(sql));
check("delegation exact permission FK is restrictive", /staff_permission_delegations_permission_fkey[\s\S]*references admin_internal\.staff_permission_catalog \(permission_key\)[\s\S]*on update restrict on delete restrict/.test(sql));
check("delegation permission shape rejects wildcard and whitespace", /permission_key = pg_catalog\.btrim\(permission_key\)[\s\S]*strpos\(permission_key, '\*'\) = 0[\s\S]*strpos\(permission_key, '%'\) = 0/.test(sql));
check("delegation scope is GLOBAL only", /staff_permission_delegations_scope_check[\s\S]*scope_kind = 'global'/.test(sql) && !/restaurant_id|region_id|case_id|member_id|scope_payload/.test(sql));
check("delegation lifecycle is active or revoked", /staff_permission_delegations_status_check[\s\S]*status in \('active', 'revoked'\)/.test(sql));
check("delegation revoked history is terminal", /staff_permission_delegations_terminal_v1/.test(sql) && /old\.status = 'revoked'[\s\S]*new is distinct from old/.test(sql));
check("delegation window has exclusive upper bound", /effective_until is null or effective_until > effective_from/.test(sql));
check("delegation capabilities are independent and nonempty", /can_grant boolean not null[\s\S]*can_revoke boolean not null[\s\S]*can_set_temporary boolean not null/.test(sql) && /check \(can_grant or can_revoke\)/.test(sql));
check("delegation table has no seed rows", !/insert into admin_internal\.staff_permission_delegations/.test(sql));
check("active delegation identity is exact and unique", /create unique index staff_permission_delegations_active_exact_key[\s\S]*delegate_staff_account_id, permission_key, scope_kind[\s\S]*where status = 'active'/.test(sql));
check("management receipt table exists", /create table admin_internal\.staff_management_operation_receipts/.test(sql));
check("receipt idempotency is global per actor", /unique \(actor_auth_user_id, request_id\)/.test(sql));
check("receipt canonical payloads are bounded objects", /jsonb_typeof\(request_payload\) = 'object'[\s\S]*octet_length\(request_payload::text\) <= 16384/.test(sql) && /jsonb_typeof\(result_payload\) = 'object'[\s\S]*octet_length\(result_payload::text\) <= 16384/.test(sql));
check("receipt has no UPDATE or DELETE grant", !/grant (?:update|delete|truncate)[^;]*staff_management_operation_receipts/i.test(sql));
check("management audit table exists", /create table admin_internal\.staff_management_audit_log/.test(sql));
check("audit has typed authority identifiers and bounded evidence", ["target_staff_account_id", "permission_key", "bundle_assignment_id", "delegation_id", "entitlement_id", "before_state", "after_state"].every((x) => sql.includes(x)));
check("audit has no UPDATE or DELETE grant", !/grant (?:update|delete|truncate)[^;]*staff_management_audit_log/i.test(sql));
const operations = ["staff_account_link", "staff_account_suspend", "staff_account_reactivate", "staff_account_revoke", "staff_bundle_assign", "staff_bundle_revoke", "staff_permission_grant", "staff_permission_revoke", "staff_delegation_grant", "staff_delegation_revoke", "staff_console_admission_grant", "staff_console_admission_revoke"];
check("operation vocabulary is exact", operations.every((x) => (sql.match(new RegExp(`'${x}'`, "g")) ?? []).length === 2) && !/'patch'|'update'|'manage'/.test(sql));
check("six granular roles are sealed", SEALED_ROLES.every((role) => new RegExp(`create role ${role} nologin noinherit nobypassrls;`).test(sql)));
check("no client receives role membership", !new RegExp(`grant (?:${SEALED_ROLES.join("|")}) to (?:public|anon|authenticated|authenticator|service_role)`, "i").test(sql));
check("no client SET ROLE path exists", !/grant\s+[a-z0-9_]+\s+to\s+(?:anon|authenticated|authenticator|service_role)/i.test(sql));
const actor = sql.slice(sql.indexOf("create function admin_internal.current_staff_management_actor_v1"));
check("private actor helper derives request subject", /staff_request_subject_v1\(\)/.test(actor) && /staff_effective_permissions_for_subject_v1/.test(actor));
check("actor helper accepts no actor identity", /current_staff_management_actor_v1\(\s*p_required_management_permission_key text\s*\)/.test(actor) && !/p_actor/.test(actor));
check("actor helper exact allowlist matches management keys", MANAGEMENT_KEYS.every((key) => actor.includes(`'${key}'`)));
check("actor helper cannot authorize PLANNED keys", /where effective\.permission_key = p_required_management_permission_key/.test(actor));
check("actor helper ownership is sealed to management reader", /alter function admin_internal\.current_staff_management_actor_v1\(text\)[\s\S]*owner to staff_management_reader;/.test(sql));
check("no target lock helper freezes an unproven order", !/lock_staff_management_(?:target|accounts)/.test(sql));
check("console admission role is distinct", /create role staff_console_admission_authority/.test(sql) && /create role staff_direct_grant_authority/.test(sql));
check("ordinary direct role has no entitlement-table write", !/grant\s+(?:[^;]*insert|[^;]*update)[^;]*staff_permission_entitlements[^;]*staff_direct_grant_authority/is.test(sql));
check("P1C console Bundle rule is untouched", sha("supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql") === FROZEN.get("supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql"));
check("new private tables enable and FORCE RLS", (sql.match(/alter table admin_internal\.staff_(?:permission_delegations|management_operation_receipts|management_audit_log) enable row level security;/g) ?? []).length === 3 && (sql.match(/alter table admin_internal\.staff_(?:permission_delegations|management_operation_receipts|management_audit_log) force row level security;/g) ?? []).length === 3);
check("clients and service_role are explicitly revoked", ["staff_permission_delegations", "staff_management_operation_receipts", "staff_management_audit_log"].every((table) => new RegExp(`revoke all on table admin_internal\\.${table}[\\s\\S]*?from public, anon, authenticated, authenticator, service_role;`).test(sql)));
check("history foreign keys are RESTRICT", (sql.match(/on update restrict on delete restrict/g) ?? []).length >= 15 && !/on delete cascade/i.test(sql));
check("no staff account DML is seeded", !/(?:insert into|update|delete from) admin_internal\.staff_accounts/i.test(sql));
check("no entitlement DML is seeded", !/(?:insert into|update|delete from) admin_internal\.staff_permission_entitlements/i.test(sql));
check("no Bundle DML is seeded", !/(?:insert into|update|delete from) admin_internal\.staff_bundle_(?:templates|template_permissions|assignments)/i.test(sql));
check("no compatibility DML is seeded", !/(?:insert into|update|delete from) admin_internal\.staff_platform_admin_compatibility_links/i.test(sql));
check("P2A resolver is frozen and successor vocabulary is exact", sha("supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql") === FROZEN.get("supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql") && ((p3bPhase || boundedP3CSuccessor) ? ["a19c9415b127792dfe394a9563ad8a0dc8ed0b65923327496540d095eab20b3c", "657b13cdd67ad0b0b72b202a16fef4a34d1da695962e33e706815037282c0df6", "337068a7c2284944589c5d885618afdc52e2f464785e0d81cda28bb4af7217b3", "3f6d4407f867ddce09fc327dfdd3932739a490d147ba8d4d49a33ea2188d8b52", "2a423be65bf08eed819015633ac78f519e4f07985d9ba27c2e625036811438a3"].includes(sha("apps/admin-web/auth/admin-current-permission-vocabulary.ts")) : sha("apps/admin-web/auth/admin-current-permission-vocabulary.ts") === FROZEN.get("apps/admin-web/auth/admin-current-permission-vocabulary.ts")));
check("B1 admission and B0 operation runtime are unchanged", ["apps/admin-web/auth/admin-context.ts", "apps/admin-web/auth/admin-authority-selector.ts", "apps/admin-web/auth/admin-protected-read-authority.ts", "apps/admin-web/auth/admin-protected-mutation-authority.ts"].every((f) => sha(f) === FROZEN.get(f)));
check("P3A creates no public RPC", !/create (?:or replace )?function public\./.test(sql));
check("P3A itself changes no application source; bounded successors remain exact", boundedP3CSuccessor || !changed.some((f) => /^(?:apps|packages|supabase\/functions)\//.test(f) && !(p3bPhase && f === "apps/admin-web/auth/admin-current-permission-vocabulary.ts")));
check("Admin registry promotes no route", boundedP3CSuccessor || !changed.includes("apps/admin-web/auth/admin-route-registry.ts"));
check("no Auth invite or service-role runtime is added", !/inviteUserByEmail|auth\.admin|SUPABASE_SERVICE_ROLE_KEY/.test(sql));
check("package registers exact three P3A commands", ["test:staff-authority-p3-p6-p3a", "test:staff-authority-p3-p6-p3a-smoke", "test:staff-authority-p3-p6-p3a-mutations"].every((x) => read("package.json").includes(`\"${x}\"`)));
check("secret scan is clean", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changed.filter((f) => fs.existsSync(path.join(ROOT, f))).map(read).join("\n"))));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3a-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : p3bCandidate ? "p3b_candidate" : p3bFrozen ? "p3b_frozen_local" : boundedP3CSuccessor ? "bounded_successor" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((x) => x.name), changedPaths: changed, migrationCount: migrations.length, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
