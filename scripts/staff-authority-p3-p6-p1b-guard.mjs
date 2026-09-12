#!/usr/bin/env node
// P3-P6-P1B static authority and lifecycle gate. No database, network, or repository writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";

const PREDECESSOR = "0d60c787c1919aaf44d7714a1fd03b419469ba15";
const SUBJECT = "Add staff bundle entitlement foundation";
const P1A = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1A_SHA256 = "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf";
const MIGRATION = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const OWN_SCRIPTS = [
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p1b-mutations.mjs"
];
const SUCCESSOR_GUARDS = new Set([
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
]);
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const sql = read(MIGRATION);
const bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
const p1aSql = read(P1A);
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const allowed = new Set([MIGRATION, ...OWN_SCRIPTS, "package.json", ...SUCCESSOR_GUARDS]);
const checks = [], failures = [];
function check(name, pass, detail) {
  const result = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 900)}`);
}

check("exact P1A predecessor and candidate/local-freeze lifecycle", candidate || frozen, { head, origin, ahead, behind, status });
check("P1B diff contains only the bounded manifest", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
check("P1A migration remains hash-pinned", sha256(p1aSql) === P1A_SHA256, sha256(p1aSql));
check("P1A migration has no diff", git("diff", "--name-only", PREDECESSOR, "--", P1A) === "");
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration inventory is exactly 111", migrations.length === 111, migrations.length);
check("P1B migration is the exact latest path", migrations.at(-1) === path.basename(MIGRATION), migrations.at(-1));
const changedMigrations = changed.filter((file) => file.startsWith("supabase/migrations/"));
check("exactly one additive migration is introduced", JSON.stringify(changedMigrations) === JSON.stringify([MIGRATION]), changedMigrations);
check("all 110 predecessor migrations remain byte-identical", lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations")).every((file) => file === MIGRATION));
check("P1A sealed role definitions are unchanged", ["staff_authority_context_reader", "staff_authority_write_authority"].every((role) => new RegExp(`create role ${role}\\s+nologin\\s+noinherit\\s+nobypassrls;`).test(p1aSql)) && !/alter\s+role\s+staff_authority_/i.test(bare));
check("P1A tables receive no structural alteration", !/alter\s+table\s+admin_internal\.(?:staff_permission_catalog|staff_accounts)\s+(?:add|drop|alter|rename)/i.test(bare));
const p1aSeeds = [...(p1aSql.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "").matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((m) => m[1]).sort();
check("P1A seed remains exactly three", JSON.stringify(p1aSeeds) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort()), p1aSeeds);

for (const table of ["staff_bundle_templates", "staff_bundle_template_permissions", "staff_bundle_assignments", "staff_permission_entitlements"]) {
  check(`${table} exists`, new RegExp(`create table admin_internal\\.${table}\\b`).test(bare));
}
for (const premature of ["staff_delegation_scopes", "staff_authority_audit_log", "staff_authority_operation_receipts"]) {
  check(`no premature ${premature}`, !new RegExp(`create table admin_internal\\.${premature}\\b`).test(bare));
}
check("Bundle revision identity is composite and exact", /primary key \(bundle_key, revision\)/.test(bare));
check("Bundle key is bounded lowercase underscore syntax", /length\(bundle_key\) between 3 and 80/.test(bare) && /bundle_key ~ '\^\[a-z\]\[a-z0-9_\]\{2,79\}\$'/.test(bare));
check("Bundle key wildcard characters are rejected", /strpos\(bundle_key, '\*'\) = 0/.test(bare) && /strpos\(bundle_key, '%'\) = 0/.test(bare));
check("Bundle revision must be positive", /check \(revision > 0\)/.test(bare));
check("Bundle lifecycle is active or retired", /check \(lifecycle_status in \('active', 'retired'\)\)/.test(bare));
check("template permission references exact revision", /foreign key \(bundle_key, bundle_revision\)[\s\S]*references admin_internal\.staff_bundle_templates \(bundle_key, revision\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("template permission references exact catalog key", /foreign key \(permission_key\)[\s\S]*references admin_internal\.staff_permission_catalog \(permission_key\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("template membership kind is DEFAULT or CONDITIONAL", /check \(membership_kind in \('DEFAULT', 'CONDITIONAL'\)\)/.test(bare));
check("template permission identity prevents duplicate membership", /primary key \(bundle_key, bundle_revision, permission_key\)/.test(bare));
check("template permission membership has no UPDATE grant", !/grant\s+update[^;]*staff_bundle_template_permissions/i.test(bare));
check("assignment references exact staff account", /staff_bundle_assignments_staff_account_fkey[\s\S]*references admin_internal\.staff_accounts \(id\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("assignment references exact Bundle revision", /staff_bundle_assignments_bundle_revision_fkey[\s\S]*references admin_internal\.staff_bundle_templates \(bundle_key, revision\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("assignment lifecycle is active or revoked", /staff_bundle_assignments_status_check[\s\S]*check \(status in \('active', 'revoked'\)\)/.test(bare));
check("assignment lifecycle excludes expired and suspended", !/staff_bundle_assignments_status_check[\s\S]{0,150}(?:expired|suspended)/.test(bare));
check("assignment time window is strict and nullable", /staff_bundle_assignments_effective_window_check[\s\S]*check \(effective_until is null or effective_until > effective_from\)/.test(bare));
check("assignment revocation timestamp matches lifecycle", /staff_bundle_assignments_revocation_shape_check/.test(bare));
check("entitlement references exact staff account", /staff_permission_entitlements_staff_account_fkey[\s\S]*references admin_internal\.staff_accounts \(id\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("entitlement references exact catalog key", /staff_permission_entitlements_permission_fkey[\s\S]*references admin_internal\.staff_permission_catalog \(permission_key\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("entitlement Bundle source references assignment with RESTRICT", /staff_permission_entitlements_bundle_assignment_fkey[\s\S]*references admin_internal\.staff_bundle_assignments \(assignment_id\)[\s\S]*on update restrict on delete restrict/.test(bare));
check("source types are exact", /check \(source_type in \('bundle_assignment', 'direct_grant', 'migration_backfill'\)\)/.test(bare));
check("bundle source requires assignment reference", /source_type = 'bundle_assignment' and source_bundle_assignment_id is not null/.test(bare));
check("direct and migration sources forbid assignment reference", /source_type in \('direct_grant', 'migration_backfill'\) and source_bundle_assignment_id is null/.test(bare));
check("entitlement lifecycle is active or revoked", /staff_permission_entitlements_status_check[\s\S]*check \(status in \('active', 'revoked'\)\)/.test(bare));
check("entitlement lifecycle contains no stored expired", !/staff_permission_entitlements_status_check[\s\S]{0,150}expired/.test(bare));
check("entitlement time window is strict and nullable", /staff_permission_entitlements_effective_window_check[\s\S]*check \(effective_until is null or effective_until > effective_from\)/.test(bare));
check("same Bundle source duplicate is prevented", /create unique index staff_permission_entitlements_bundle_source_key[\s\S]*\(source_bundle_assignment_id, permission_key\)[\s\S]*where source_type = 'bundle_assignment';/.test(bare));
check("multi-source rows are allowed", !/unique\s*\(staff_account_id,\s*permission_key\)/i.test(bare));
check("all authority-history FKs reject cascading deletion", !/on delete cascade/i.test(bare) && (bare.match(/on update restrict on delete restrict/g) ?? []).length === 7);
check("materialization trust boundary is explicit", /P1C must atomically validate Bundle DEFAULT membership, matching assignment subject, window containment, and all-or-nothing materialization/.test(sql));
check("Bundle definitions are explicitly not runtime authority", /Bundle rows are provisioning provenance, never runtime authority/.test(sql));

check("P1B leaves all four tables unseeded", !/insert\s+into\s+admin_internal\.(?:staff_bundle_templates|staff_bundle_template_permissions|staff_bundle_assignments|staff_permission_entitlements)/i.test(bare));
check("P1B does not seed the permission catalog", !/insert\s+into\s+admin_internal\.staff_permission_catalog/i.test(bare));
check("P1B does not seed staff accounts or compatibility backfill", !/insert\s+into\s+admin_internal\.staff_accounts/i.test(bare) && !/platform_admin_memberships[\s\S]*staff_accounts/i.test(bare));
check("admin_context.read is absent from Bundle payload", !/admin_context\.read/.test(bare));
check("all four P1B tables ENABLE RLS", (bare.match(/enable row level security;/g) ?? []).length === 4);
check("all four P1B tables FORCE RLS", (bare.match(/force row level security;/g) ?? []).length === 4);
for (const client of ["anon", "authenticated", "authenticator", "service_role", "public"]) {
  check(`${client} receives no direct P1B table grant`, !new RegExp(`grant[^;]+admin_internal\\.staff_(?:bundle|permission_entitlements)[^;]+to ${client}`, "i").test(bare));
}
check("client direct privileges are explicitly revoked on all P1B tables", (bare.match(/revoke all on table admin_internal\.staff_/g) ?? []).length === 4 && (bare.match(/from public, anon, authenticated, authenticator, service_role;/g) ?? []).length === 4);
check("context reader receives bounded assignment columns", /grant select \(assignment_id, staff_account_id, status, effective_from, effective_until\)[\s\S]*staff_bundle_assignments to staff_authority_context_reader/.test(bare));
check("context reader receives bounded entitlement columns", /grant select \(entitlement_id, staff_account_id, permission_key, source_type,[\s\S]*effective_until\)[\s\S]*staff_permission_entitlements to staff_authority_context_reader/.test(bare));
check("context reader cannot read templates", !/grant select[^;]*staff_bundle_template[^;]*staff_authority_context_reader/i.test(bare));
check("context reader receives no mutation", !/grant (?:insert|update|delete)[^;]*staff_authority_context_reader/i.test(bare));
check("writer receives bounded provisioning privileges", /grant select, insert on table admin_internal\.staff_bundle_templates/.test(bare) && /grant update \(lifecycle_status, retired_at\)/.test(bare) && /grant select, insert on table admin_internal\.staff_permission_entitlements/.test(bare));
check("writer receives no DELETE", !/grant[^;]*delete[^;]*staff_authority_write_authority/i.test(bare));
check("no public mutation RPC is created", !/create\s+(?:or replace\s+)?function\s+public\./i.test(bare));
check("no staff context or permission predicate RPC", !/staff_current_context_v1|staff_has_permission_v1/.test(bare));
check("no delegation, supervisor, audit, or receipt implementation", !/staff_delegation_scopes|supervisor_(?:grant|revoke)|staff_authority_(?:audit_log|operation_receipts)/.test(bare));
check("migration is one transaction", /^begin;/m.test(bare) && /^commit;/m.test(bare));

check("Admin application and route registry are unchanged", git("diff", "--name-only", PREDECESSOR, "--", "apps") === "");
check("current permission vocabulary is byte-identical", read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").trimEnd() === git("show", `${PREDECESSOR}:apps/admin-web/auth/admin-current-permission-vocabulary.ts`).replace(/\r\n/g, "\n").trimEnd());
check("Admin APIs are unchanged", git("diff", "--name-only", PREDECESSOR, "--", "apps/admin-web/app/api", "apps/admin-web/server") === "");
const appSources = (() => { const out = []; const walk = (dir) => { for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { if (["node_modules", ".next", "dist", "build"].includes(entry.name)) continue; const file = path.posix.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(?:ts|tsx|js|mjs)$/.test(file)) out.push(read(file)); } }; walk("apps"); return out.join("\n"); })();
check("no application runtime references P1B tables", !/staff_bundle_templates|staff_bundle_template_permissions|staff_bundle_assignments|staff_permission_entitlements/.test(appSources));
check("no Production configuration is changed", !changed.some((file) => /production|\.env|vercel/i.test(file)));
check("package dependencies and lockfile are unchanged", JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {}) && !changed.some((file) => /lock/i.test(file)));
const pkg = JSON.parse(read("package.json"));
check("P1B package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p1b"] === "node scripts/staff-authority-p3-p6-p1b-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p1b-smoke"] === "node scripts/staff-authority-p3-p6-p1b-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p1b-mutations"] === "node scripts/staff-authority-p3-p6-p1b-mutations.mjs");
check("bounded predecessor guard edits pin P1A and exact P1B migration", changed.filter((file) => SUCCESSOR_GUARDS.has(file)).every((file) => read(file).includes(PREDECESSOR) && read(file).includes(MIGRATION)));
const changedText = changed.filter(exists).map(read).join("\n");
check("changed files contain no credential-shaped value", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));

console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p1b-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name), migrationSha256: sha256(sql), changedPaths: changed,
  developmentAccessed: false, productionAccessed: false, pushed: false
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
