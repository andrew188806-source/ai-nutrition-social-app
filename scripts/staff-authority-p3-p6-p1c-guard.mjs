#!/usr/bin/env node
// P3-P6-P1C static authority and lifecycle gate. No database, network, or repository writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";

const PREDECESSOR = "2cb5f50944a8bff261d9f5d8dc7457ad9f6247a7";
const SUBJECT = "Add sealed staff authority materializer";
const P1C_HEAD = "78dcdaba1cebbbe3ec99a5d56b5361ba1a16a31a";
const P1A = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1A_SHA256 = "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf";
const P1B = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const P1B_SHA256 = "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4";
const MIGRATION = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const OWN_SCRIPTS = [
  "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-smoke.mjs",
  "scripts/staff-authority-p3-p6-p1c-mutations.mjs"
];
const P2A_SUBJECT = "Add staff effective permission resolver";
const P2A_MIGRATION = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const P2A_SCRIPTS = [
  "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2a-mutations.mjs"
];
const P2A_HEAD = "8c8ab93fc091f76f8b0af535c910d8a5227d48cb";
const P2B_SUBJECT = "Add Platform Admin staff compatibility bridge";
const P2B_MIGRATION = "supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql";
const P2B_SCRIPTS = ["scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2b-smoke.mjs", "scripts/staff-authority-p3-p6-p2b-mutations.mjs"];
const SUCCESSOR_GUARDS = new Set([
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
]);
const P2C_HEAD = "8dbd14b65b8734842095ce809686ce5929cc5958";
const P2C_SUBJECT = "Add Admin staff authority shadow comparison";
const P2C_SHADOW = "apps/admin-web/auth/admin-staff-authority-shadow.ts";
const P2C_APP_PATHS = ["apps/admin-web/auth/admin-context.ts", P2C_SHADOW];
const P2C_PATHS = [
  "package.json", ...P2C_APP_PATHS,
  "scripts/staff-authority-p3-p6-p2c-guard.mjs", "scripts/staff-authority-p3-p6-p2c-smoke.mjs", "scripts/staff-authority-p3-p6-p2c-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p2b-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs", "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
];
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const sql = read(MIGRATION), bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
const p1aSql = read(P1A), p1bSql = read(P1B);
const ddlBeforeFunctions = bare.slice(0, bare.indexOf("create function admin_internal.materialize_staff_bundle_assignment_v1"));
const materializer = bare.slice(bare.indexOf("create function admin_internal.materialize_staff_bundle_assignment_v1"), bare.indexOf("create function admin_internal.revoke_staff_bundle_assignment_v1"));
const revoker = bare.slice(bare.indexOf("create function admin_internal.revoke_staff_bundle_assignment_v1"), bare.indexOf("revoke all on function admin_internal.materialize_staff_bundle_assignment_v1"));
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const pushed = head === P1C_HEAD && origin === P1C_HEAD && ahead === 0 && behind === 0;
const p2aCandidate = pushed;
const p2aFrozen = head !== P1C_HEAD && git("rev-parse", "HEAD^") === P1C_HEAD && origin === P1C_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2A_SUBJECT;
const p2cCandidate = head === P2C_HEAD && origin === P2C_HEAD && ahead === 0 && behind === 0;
const p2cFrozen = head !== P2C_HEAD && git("rev-parse", "HEAD^") === P2C_HEAD && origin === P2C_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2C_SUBJECT;
const p2cPhase = p2cCandidate || p2cFrozen;
const p2bCandidate = head === P2A_HEAD && origin === P2A_HEAD && ahead === 0 && behind === 0;
const p2bFrozen = head !== P2A_HEAD && git("rev-parse", "HEAD^") === P2A_HEAD && origin === P2A_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2B_SUBJECT;
const p2bPhase = p2bCandidate || p2bFrozen || p2cPhase;
const p2aPhase = p2aCandidate || p2aFrozen || p2bPhase;
const allowed = new Set([...(p2cPhase ? P2C_PATHS : []), MIGRATION, ...OWN_SCRIPTS, "package.json", ...SUCCESSOR_GUARDS,
  ...(p2aPhase ? [P2A_MIGRATION, ...P2A_SCRIPTS] : []), ...(p2bPhase ? [P2B_MIGRATION, ...P2B_SCRIPTS] : [])]);
const checks = [], failures = [];
function check(name, pass, detail) { const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1000)}`); }

check("exact P1B predecessor through bounded P2B lifecycle", candidate || frozen || pushed || p2aPhase, { head, origin, ahead, behind, status });
check("P1C diff contains only the bounded manifest", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
check("P1A migration remains hash-pinned", sha256(p1aSql) === P1A_SHA256, sha256(p1aSql));
check("P1B migration remains hash-pinned", sha256(p1bSql) === P1B_SHA256, sha256(p1bSql));
check("P1A and P1B migrations have no diff", git("diff", "--name-only", PREDECESSOR, "--", P1A, P1B) === "");
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration inventory is exact for recognized phase", migrations.length === (p2bPhase ? 114 : p2aPhase ? 113 : 112), migrations.length);
check("latest migration is exact for recognized phase", migrations.at(-1) === path.basename(p2bPhase ? P2B_MIGRATION : p2aPhase ? P2A_MIGRATION : MIGRATION), migrations.at(-1));
const changedMigrations = changed.filter((file) => file.startsWith("supabase/migrations/"));
check("only exact additive migrations are introduced", JSON.stringify(changedMigrations) === JSON.stringify(p2bPhase ? [MIGRATION, P2A_MIGRATION, P2B_MIGRATION] : p2aPhase ? [MIGRATION, P2A_MIGRATION] : [MIGRATION]), changedMigrations);
check("all frozen predecessor migrations remain byte-identical", lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations")).every((file) => file === MIGRATION || (p2aPhase && file === P2A_MIGRATION) || (p2bPhase && file === P2B_MIGRATION)));
check("P1A/P1B table structure is not altered", !/alter table admin_internal\.(?:staff_permission_catalog|staff_accounts|staff_bundle_templates|staff_bundle_template_permissions|staff_bundle_assignments|staff_permission_entitlements)\s+(?:add|drop|alter|rename)/i.test(bare));
const seeds = [...(p1aSql.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "").matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((match) => match[1]).sort();
check("permission catalog remains exactly three seeds", JSON.stringify(seeds) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort()), seeds);
check("P1C leaves staff accounts and Bundle data unseeded", !/insert\s+into\s+admin_internal\.(?:staff_accounts|staff_bundle_templates|staff_bundle_template_permissions|staff_bundle_assignments|staff_permission_entitlements)/i.test(ddlBeforeFunctions));

check("append-only audit table exists", /create table admin_internal\.staff_authority_audit_log/.test(bare));
check("immutable receipt table exists", /create table admin_internal\.staff_authority_operation_receipts/.test(bare));
check("audit captures request event trusted actor subject and reason", ["request_id uuid not null", "event_type text not null", "actor_kind text not null", "actor_database_identity text not null", "subject_staff_account_id uuid not null", "reason text not null"].every((fragment) => bare.includes(fragment)));
check("audit supports operator staff and system actor kinds", /actor_kind in \('operator', 'staff', 'system'\)/.test(bare));
check("audit stores one assignment or entitlement event shape", /bundle_assignment_materialized/.test(bare) && /bundle_entitlement_materialized/.test(bare) && /bundle_assignment_revoked/.test(bare) && /bundle_entitlement_revoked/.test(bare));
check("audit is append-only", !/grant\s+(?:update|delete)[^;]*staff_authority_audit_log/i.test(bare) && !/audit_log_writer_(?:update|delete)/.test(bare));
check("receipt stores canonical JSONB request identity", /request_payload jsonb not null/.test(bare) && /jsonb_typeof\(request_payload\) = 'object'/.test(bare));
check("receipt request ID is globally unique", /staff_authority_operation_receipts_pkey primary key \(request_id\)/.test(bare));
check("receipt stores replay result identity", /result_assignment_id uuid not null/.test(bare) && /result_entitlement_count integer not null/.test(bare));
check("receipts are immutable", !/grant\s+(?:update|delete)[^;]*staff_authority_operation_receipts/i.test(bare) && !/operation_receipts_writer_(?:update|delete)/.test(bare));
check("audit and receipt both ENABLE RLS", (bare.match(/enable row level security;/g) ?? []).length === 2);
check("audit and receipt both FORCE RLS", (bare.match(/force row level security;/g) ?? []).length === 2);
for (const client of ["anon", "authenticated", "authenticator", "service_role", "public"]) {
  check(`${client} receives no audit or receipt grant`, !new RegExp(`grant[^;]+staff_authority_(?:audit_log|operation_receipts)[^;]+to ${client}`, "i").test(bare));
}
check("client table privileges are explicitly revoked", (bare.match(/revoke all on table admin_internal\.staff_authority_/g) ?? []).length === 2 && (bare.match(/from public, anon, authenticated, authenticator, service_role;/g) ?? []).length >= 4);
check("context reader receives no audit or receipt access", !/staff_authority_(?:audit_log|operation_receipts)[^;]*staff_authority_context_reader/i.test(bare));
check("writer has audit INSERT only", /grant insert on table admin_internal\.staff_authority_audit_log/.test(bare));
check("writer has receipt SELECT and INSERT only", /grant select, insert on table admin_internal\.staff_authority_operation_receipts/.test(bare));

check("sealed materializer exists in admin_internal", materializer.startsWith("create function admin_internal.materialize_staff_bundle_assignment_v1"));
check("sealed revoker exists in admin_internal", revoker.startsWith("create function admin_internal.revoke_staff_bundle_assignment_v1"));
for (const [name, block] of [["materializer", materializer], ["revoker", revoker]]) {
  check(`${name} is SECURITY DEFINER`, /security definer/.test(block));
  check(`${name} has empty search_path and RLS on`, /set search_path = ''[\s\S]*set row_security = 'on'/.test(block));
  check(`${name} uses no dynamic SQL`, !/\bexecute\b/i.test(block));
}
check("both functions are owned by the sealed writer", (bare.match(/owner to staff_authority_write_authority;/g) ?? []).length === 2);
check("temporary owner membership and schema CREATE are released", /revoke create on schema admin_internal from staff_authority_write_authority;/.test(bare) && /revoke staff_authority_write_authority from postgres granted by postgres;/.test(bare));
check("both function ACLs explicitly revoke every client", (bare.match(/revoke all on function admin_internal\.(?:materialize|revoke)_staff_bundle_assignment_v1\(/g) ?? []).length === 2);
check("no client receives operator function EXECUTE", !/grant execute on function admin_internal\.(?:materialize|revoke)_staff_bundle_assignment_v1[\s\S]*?to (?:public|anon|authenticated|authenticator|service_role)/i.test(bare));
check("materializer requires exact revision input", /p_bundle_revision integer/.test(materializer) && /template\.revision = p_bundle_revision/.test(materializer) && !/\blatest\b/i.test(materializer));
check("caller cannot provide permissions or entitlement subjects", !/p_(?:permission|entitlement)/.test(materializer.slice(0, materializer.indexOf("returns jsonb"))));
check("staff account must exist and be active", /staff_not_found/.test(materializer) && /v_staff_status <> 'active'/.test(materializer));
check("assignment is contained by staff validity", /p_effective_from < v_staff_effective_from/.test(materializer) && /p_effective_until is null or p_effective_until > v_staff_effective_until/.test(materializer));
check("new assignment requires active exact Bundle revision", /bundle_revision_not_found/.test(materializer) && /v_bundle_status <> 'active'/.test(materializer) && /bundle_revision_retired/.test(materializer));
check("console-admission membership rejects the whole Bundle", /permission\.console_admission_required/.test(materializer) && /bundle_console_admission_forbidden/.test(materializer));
check("only DEFAULT membership is materialized", /membership\.membership_kind = 'DEFAULT'/.test(materializer) && !/membership_kind in \('DEFAULT', 'CONDITIONAL'\)/.test(materializer));
check("generated entitlement staff derives from assignment input", /p_staff_account_id, membership\.permission_key, 'bundle_assignment', v_assignment_id/.test(materializer));
check("generated permission derives from exact pinned membership", /membership\.bundle_key = p_bundle_key[\s\S]*membership\.bundle_revision = p_bundle_revision[\s\S]*membership\.membership_kind = 'DEFAULT'/.test(materializer));
check("generated entitlement window equals assignment window", /'active', p_effective_from, p_effective_until, v_now, null/.test(materializer));
check("zero-DEFAULT Bundle is intentionally allowed", /v_entitlement_count integer := 0/.test(materializer) && /get diagnostics v_entitlement_count = row_count/.test(materializer));
check("assignment entitlement audit and receipt share one transaction", /^begin;/m.test(bare) && (bare.match(/\bcommit;/g) ?? []).length === 1 && materializer.includes("staff_bundle_assignments") && materializer.includes("staff_permission_entitlements") && materializer.includes("staff_authority_audit_log") && materializer.includes("staff_authority_operation_receipts"));
check("materializer serializes and replays identical requests", /pg_advisory_xact_lock/.test(materializer) && /operation_kind <> 'materialize_bundle_assignment'/.test(materializer) && /outcome', 'replayed'/.test(materializer));
check("materializer rejects conflicting request reuse", /request_payload is distinct from v_request_payload/.test(materializer) && /request_conflict/.test(materializer));
check("operator actor is trusted session identity", /'operator', session_user/.test(materializer) && !/p_actor/.test(materializer));

check("revoker targets one exact assignment", /where assignment\.assignment_id = p_assignment_id[\s\S]*for update/.test(revoker));
check("new request against revoked assignment fails closed", /already_revoked/.test(revoker));
check("revoker changes lifecycle without DELETE", /set status = 'revoked', revoked_at = v_now/.test(revoker) && !/delete\s+from/i.test(revoker));
check("revoker filters exact Bundle source", /source_type = 'bundle_assignment'/.test(revoker) && /source_bundle_assignment_id = p_assignment_id/.test(revoker));
check("revoker cannot touch direct or migration sources", !/source_type\s+in\s*\([^)]*(?:direct_grant|migration_backfill)/.test(revoker));
check("revoker cannot touch another Bundle assignment", /source_bundle_assignment_id = p_assignment_id/.test(revoker) && !/source_bundle_assignment_id is not null/.test(revoker));
check("revoker has replay and conflict semantics", /operation_kind <> 'revoke_bundle_assignment'/.test(revoker) && /outcome', 'replayed'/.test(revoker) && /request_conflict/.test(revoker));
check("no direct-grant function exists", !/create function[^;]*(?:direct_grant|grant_staff_permission)/i.test(bare));
check("no delegation table or permission seed exists", !/create table admin_internal\.staff_delegation|admin\.staff_authority\.[a-z_.]+\.delegate/.test(bare));
check("no staff resolver exists", !/staff_current_context_v1|staff_has_permission_v1/.test(bare));
check("no platform_admin compatibility backfill exists", !/platform_admin_memberships[\s\S]*insert into admin_internal\.staff_accounts/i.test(bare));

check("Admin application and route registry are unchanged", lines(git("diff", "--name-only", PREDECESSOR, "--", "apps")).every((item) => p2cPhase && P2C_APP_PATHS.includes(item)));
check("Admin APIs are unchanged", git("diff", "--name-only", PREDECESSOR, "--", "apps/admin-web/app/api", "apps/admin-web/server") === "");
const appSources = (() => { const out = []; const walk = (dir) => { for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { if (["node_modules", ".next", "dist", "build"].includes(entry.name)) continue; const file = path.posix.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(?:ts|tsx|js|mjs)$/.test(file)) out.push(read(file)); } }; walk("apps"); return out.join("\n"); })();
check("no application runtime references P1C tables or functions", !/staff_authority_(?:audit_log|operation_receipts)|materialize_staff_bundle_assignment_v1|revoke_staff_bundle_assignment_v1/.test(appSources));
check("no Development migration-tracker repair exists", !/schema_migrations|supabase db push|migration sync/i.test(bare));
check("no Production configuration is changed", !changed.some((file) => /production|\.env|vercel/i.test(file)));
check("package dependencies and lockfile are unchanged", JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {}) && !changed.some((file) => /lock/i.test(file)));
const pkg = JSON.parse(read("package.json"));
check("P1C package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p1c"] === "node scripts/staff-authority-p3-p6-p1c-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p1c-smoke"] === "node scripts/staff-authority-p3-p6-p1c-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p1c-mutations"] === "node scripts/staff-authority-p3-p6-p1c-mutations.mjs");
check("P2A package scripts are exact when bounded successor is present", !p2aPhase || pkg.scripts?.["test:staff-authority-p3-p6-p2a"] === "node scripts/staff-authority-p3-p6-p2a-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2a-smoke"] === "node scripts/staff-authority-p3-p6-p2a-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2a-mutations"] === "node scripts/staff-authority-p3-p6-p2a-mutations.mjs");
check("P2B package scripts are exact when bounded successor is present", !p2bPhase || pkg.scripts?.["test:staff-authority-p3-p6-p2b"] === "node scripts/staff-authority-p3-p6-p2b-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2b-smoke"] === "node scripts/staff-authority-p3-p6-p2b-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2b-mutations"] === "node scripts/staff-authority-p3-p6-p2b-mutations.mjs");
check("bounded predecessor guards pin P1B and exact P1C migration", changed.filter((file) => SUCCESSOR_GUARDS.has(file)).every((file) => read(file).includes(PREDECESSOR) && read(file).includes(MIGRATION)));
const changedText = changed.filter(exists).map(read).join("\n");
check("changed files contain no credential-shaped value", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p1c-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : p2aCandidate ? "p2a_candidate" : p2aFrozen ? "p2a_frozen_local" : p2bCandidate ? "p2b_candidate" : p2bFrozen ? "p2b_frozen_local" : p2cCandidate ? "p2c_candidate" : p2cFrozen ? "p2c_frozen_local" : pushed ? "pushed" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.name), migrationSha256: sha256(sql), changedPaths: changed, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
