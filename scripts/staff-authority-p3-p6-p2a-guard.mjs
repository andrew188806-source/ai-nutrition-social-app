#!/usr/bin/env node
// P3-P6-P2A static resolver and lifecycle gate. No database, network, or repository writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";

const PREDECESSOR = "78dcdaba1cebbbe3ec99a5d56b5361ba1a16a31a";
const SUBJECT = "Add staff effective permission resolver";
const P1A = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1B = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const P1C = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const P1_HASHES = new Map([
  [P1A, "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf"],
  [P1B, "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4"],
  [P1C, "c4f3877f889582a3af14533f530135beced7ba68a7d11f82e23f2b4ea996e835"]
]);
const MIGRATION = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const OWN_SCRIPTS = [
  "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2a-mutations.mjs"
];
const SUCCESSOR_GUARDS = new Set([
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs",
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
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sql = read(MIGRATION), bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
const p1a = read(P1A), p1b = read(P1B);
const subjectHelper = bare.slice(bare.indexOf("create function admin_internal.staff_request_subject_v1"), bare.indexOf("create function admin_internal.staff_effective_permissions_for_subject_v1"));
const resolver = bare.slice(bare.indexOf("create function admin_internal.staff_effective_permissions_for_subject_v1"), bare.indexOf("create function public.staff_current_context_v1"));
const context = bare.slice(bare.indexOf("create function public.staff_current_context_v1"), bare.indexOf("create function public.staff_has_permission_v1"));
const predicate = bare.slice(bare.indexOf("create function public.staff_has_permission_v1"), bare.indexOf("comment on function public.staff_current_context_v1"));
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const allowed = new Set([MIGRATION, ...OWN_SCRIPTS, "package.json", ...SUCCESSOR_GUARDS]);
const checks = [], failures = [];
function check(name, pass, detail) { const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1000)}`); }

check("exact P1C predecessor and candidate/local-freeze lifecycle", candidate || frozen, { head, origin, ahead, behind, status });
check("P2A diff contains only the bounded manifest", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
for (const [file, hash] of P1_HASHES) check(`${path.basename(file)} remains hash-pinned`, sha256(read(file)) === hash, sha256(read(file)));
check("all three P1 migrations have no diff", git("diff", "--name-only", PREDECESSOR, "--", P1A, P1B, P1C) === "");
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration inventory is exactly 113", migrations.length === 113, migrations.length);
check("P2A migration is the exact latest path", migrations.at(-1) === path.basename(MIGRATION), migrations.at(-1));
check("exactly one additive migration is introduced", JSON.stringify(changed.filter((file) => file.startsWith("supabase/migrations/"))) === JSON.stringify([MIGRATION]));
check("all 112 predecessor migrations remain byte-identical", lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations")).every((file) => file === MIGRATION));
check("P1 table structures are not altered", !/alter table admin_internal\.staff_(?:permission_catalog|accounts|bundle_templates|bundle_template_permissions|bundle_assignments|permission_entitlements|authority_audit_log|authority_operation_receipts)\s+(?:add|drop|alter|rename)/i.test(bare));
const seeds = [...(p1a.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "").matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((match) => match[1]).sort();
check("permission catalog remains exactly three seeds", JSON.stringify(seeds) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort()), seeds);
check("P2A seeds no staff Bundle entitlement audit or receipt data", !/insert\s+into\s+admin_internal\.staff_(?:accounts|bundle_templates|bundle_template_permissions|bundle_assignments|permission_entitlements|authority_audit_log|authority_operation_receipts)/i.test(bare));

check("private request-subject helper exists", subjectHelper.startsWith("create function admin_internal.staff_request_subject_v1()"));
check("subject helper reads the scalar verified subject claim", /current_setting\('request\.jwt\.claim\.sub', true\)/.test(subjectHelper));
check("subject helper supports the claims JSON subject", /current_setting\('request\.jwt\.claims', true\)/.test(subjectHelper) && /::pg_catalog\.jsonb ->> 'sub'/.test(subjectHelper));
check("subject helper fails closed for missing or malformed UUID", /return null;/.test(subjectHelper) && /v_subject !~\*/.test(subjectHelper));
check("public functions accept no caller user ID", /staff_current_context_v1\(\)/.test(context) && /staff_has_permission_v1\(p_requested_permission_key text\)/.test(predicate) && !/p_(?:user|auth_user|staff_account)_id/.test(context + predicate));
check("shared exact-entitlement resolver exists", resolver.startsWith("create function admin_internal.staff_effective_permissions_for_subject_v1"));
check("all four functions are STABLE SECURITY DEFINER", (bare.match(/language (?:sql|plpgsql)\s+stable\s+security definer/g) ?? []).length === 4);
check("all four functions pin empty search_path and RLS", (bare.match(/set search_path = ''\s+set row_security = 'on'/g) ?? []).length === 4);
check("functions use no dynamic SQL", !/\bexecute\b/i.test(subjectHelper + resolver + context + predicate));
check("all functions are owned by the sealed context reader", (bare.match(/owner to staff_authority_context_reader;/g) ?? []).length === 4);
check("temporary role and schema capabilities are released", /revoke create on schema public from staff_authority_context_reader;/.test(bare) && /revoke create on schema admin_internal from staff_authority_context_reader;/.test(bare) && /revoke staff_authority_context_reader from postgres granted by postgres;/.test(bare));

check("current-context function exists with exact output only", /create function public\.staff_current_context_v1\(\)\s+returns table \(permission_key text\)/.test(context));
check("has-permission function exists with one text input", /create function public\.staff_has_permission_v1\(p_requested_permission_key text\)\s+returns boolean/.test(predicate));
check("both public functions use the shared resolver", /staff_effective_permissions_for_subject_v1/.test(context) && /staff_effective_permissions_for_subject_v1/.test(predicate));
check("both public functions derive their own request subject", /staff_request_subject_v1\(\)/.test(context) && /staff_request_subject_v1\(\)/.test(predicate));
check("both public functions use database statement time", /statement_timestamp\(\)/.test(context) && /statement_timestamp\(\)/.test(predicate));
check("current context is deterministic and DISTINCT", /select distinct entitlement\.permission_key/.test(resolver) && /order by entitlement\.permission_key/.test(resolver) && /order by effective\.permission_key/.test(context));
check("predicate uses exact equality only", /effective\.permission_key = p_requested_permission_key/.test(predicate) && !/\blike\b|\bilike\b|starts_with|regexp/i.test(predicate));
check("null and empty permission keys are false", /p_requested_permission_key is null or p_requested_permission_key = '' then false/.test(predicate));

check("staff account must be active", /account\.status = 'active'/.test(resolver));
check("staff start uses database time", /account\.effective_from <= p_database_now/.test(resolver));
check("staff end is exclusive", /account\.effective_until is null or p_database_now < account\.effective_until/.test(resolver));
check("catalog permission must be active", /permission\.lifecycle_status = 'active'/.test(resolver));
check("catalog permission must be runtime current", /permission\.readiness_status = 'current'/.test(resolver));
check("entitlement must be active", /entitlement\.status = 'active'/.test(resolver));
check("entitlement start uses database time", /entitlement\.effective_from <= p_database_now/.test(resolver));
check("entitlement end is exclusive", /entitlement\.effective_until is null or p_database_now < entitlement\.effective_until/.test(resolver));
check("Bundle source requires its exact assignment", /entitlement\.source_type = 'bundle_assignment'/.test(resolver) && /assignment\.assignment_id = entitlement\.source_bundle_assignment_id/.test(resolver));
check("Bundle assignment subject must match", /assignment\.staff_account_id = entitlement\.staff_account_id/.test(resolver));
check("Bundle assignment must be active", /assignment\.status = 'active'/.test(resolver));
check("Bundle assignment uses an exclusive database-time window", /assignment\.effective_from <= p_database_now/.test(resolver) && /assignment\.effective_until is null or p_database_now < assignment\.effective_until/.test(resolver));
check("direct and migration sources require no assignment", /entitlement\.source_type in \('direct_grant', 'migration_backfill'\)[\s\S]*entitlement\.source_bundle_assignment_id is null/.test(resolver));
check("runtime resolver never reads Bundle templates", !/staff_bundle_templates|staff_bundle_template_permissions/.test(resolver));

check("authenticated receives both public resolver functions", (bare.match(/grant execute on function public\.staff_(?:current_context|has_permission)_v1[^;]*to authenticated;/g) ?? []).length === 2);
for (const client of ["public", "anon", "authenticator", "service_role"]) check(`${client} receives no resolver EXECUTE`, !new RegExp(`grant execute on function public\\.staff_(?:current_context|has_permission)_v1[^;]*to[^;]*\\b${client}\\b`, "i").test(bare));
check("private helpers receive no client EXECUTE", !/grant execute on function admin_internal\.staff_[^;]+to (?:public|anon|authenticated|authenticator|service_role)/i.test(bare));
check("client EXECUTE is explicitly revoked before grant", (bare.match(/revoke all on function (?:admin_internal|public)\.staff_/g) ?? []).length === 4);
check("P2A grants no internal table privilege", !/grant\s+(?:select|insert|update|delete)[^;]+on (?:table )?admin_internal\./i.test(bare));
check("frozen reader columns already cover the resolver", /grant select \(permission_key, lifecycle_status, readiness_status, deferred\)/.test(p1a) && /grant select \(id, auth_user_id, status, effective_from, effective_until, status_version\)/.test(p1a) && /grant select \(assignment_id, staff_account_id, status, effective_from, effective_until\)/.test(p1b) && /grant select \(entitlement_id, staff_account_id, permission_key, source_type,\s+source_bundle_assignment_id, status, effective_from, effective_until\)/.test(p1b));
check("no client receives an internal table path", !/grant[^;]+admin_internal\.[^;]+to (?:public|anon|authenticated|authenticator|service_role)/i.test(bare));

check("legacy Platform Admin resolvers are untouched", !/platform_admin_current_context_v1|platform_admin_has_permission_v1/.test(bare));
check("no compatibility backfill exists", !/platform_admin_memberships|migration_backfill[\s\S]*insert/i.test(bare));
check("no new permission seed or delegation exists", !/insert\s+into\s+admin_internal\.staff_permission_catalog|admin\.staff_authority\.[a-z_.]+\.delegate/i.test(bare));
check("application source is unchanged", git("diff", "--name-only", PREDECESSOR, "--", "apps", "packages", "functions") === "");
check("no route registry or Admin API changes", git("diff", "--name-only", PREDECESSOR, "--", "apps/admin-web/auth", "apps/admin-web/app/api", "apps/admin-web/server") === "");
check("no Development migration-tracker repair exists", !/schema_migrations|supabase db push|migration sync/i.test(bare));
check("no Production configuration is changed", !changed.some((file) => /production|\.env|vercel/i.test(file)));
check("package dependencies and lockfiles are unchanged", JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {}) && !changed.some((file) => /lock/i.test(file)));
const pkg = JSON.parse(read("package.json"));
check("P2A package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p2a"] === "node scripts/staff-authority-p3-p6-p2a-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2a-smoke"] === "node scripts/staff-authority-p3-p6-p2a-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2a-mutations"] === "node scripts/staff-authority-p3-p6-p2a-mutations.mjs");
check("bounded predecessor guards pin exact P2A awareness", changed.filter((file) => SUCCESSOR_GUARDS.has(file)).every((file) => read(file).includes(PREDECESSOR) && read(file).includes(MIGRATION)));
const changedText = changed.filter(exists).map(read).join("\n");
check("changed files contain no credential-shaped value", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2a-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.name), migrationSha256: sha256(sql), changedPaths: changed, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
