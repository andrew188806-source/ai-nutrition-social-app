#!/usr/bin/env node
// P3-P6-P1A static authority and lifecycle gate. No database, network, or repository writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";

const PREDECESSOR = "e79cca87fe2eea689251d86008b23edb6dc9d5d4";
const SUBJECT = "Add staff authority identity foundation";
const MIGRATION = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1A_HEAD = "0d60c787c1919aaf44d7714a1fd03b419469ba15";
const P1A_SHA256 = "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf";
const P1B_SUBJECT = "Add staff bundle entitlement foundation";
const P1B_HEAD = "2cb5f50944a8bff261d9f5d8dc7457ad9f6247a7";
const P1B_MIGRATION = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const P1B_SCRIPTS = [
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p1b-mutations.mjs"
];
const P1C_SUBJECT = "Add sealed staff authority materializer";
const P1C_HEAD = "78dcdaba1cebbbe3ec99a5d56b5361ba1a16a31a";
const P1C_MIGRATION = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const P1C_SCRIPTS = [
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
const OWN_SCRIPTS = [
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p1a-mutations.mjs"
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
const git = (...args) => child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const lines = (value) => value.split(/\r?\n/).filter(Boolean);

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1"));
const changed = [...new Set([
  ...lines(git("diff", "--name-only", PREDECESSOR)),
  ...lines(git("ls-files", "--others", "--exclude-standard"))
])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR
  && origin === PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0
  && git("log", "-1", "--format=%s") === SUBJECT;
const pushed = head === P1A_HEAD && origin === P1A_HEAD && ahead === 0 && behind === 0;
const p1bCandidate = pushed;
const p1bFrozen = head !== P1A_HEAD && git("rev-parse", "HEAD^") === P1A_HEAD
  && origin === P1A_HEAD && ahead === 1 && behind === 0 && status.length === 0
  && git("log", "-1", "--format=%s") === P1B_SUBJECT;
const p1bPushed = head === P1B_HEAD && origin === P1B_HEAD && ahead === 0 && behind === 0;
const p1cCandidate = p1bPushed;
const p1cFrozen = head !== P1B_HEAD && git("rev-parse", "HEAD^") === P1B_HEAD
  && origin === P1B_HEAD && ahead === 1 && behind === 0 && status.length === 0
  && git("log", "-1", "--format=%s") === P1C_SUBJECT;
const p1cPushed = head === P1C_HEAD && origin === P1C_HEAD && ahead === 0 && behind === 0;
const p2aCandidate = p1cPushed;
const p2aFrozen = head !== P1C_HEAD && git("rev-parse", "HEAD^") === P1C_HEAD
  && origin === P1C_HEAD && ahead === 1 && behind === 0 && status.length === 0
  && git("log", "-1", "--format=%s") === P2A_SUBJECT;
const p2cCandidate = head === P2C_HEAD && origin === P2C_HEAD && ahead === 0 && behind === 0;
const p2cFrozen = head !== P2C_HEAD && git("rev-parse", "HEAD^") === P2C_HEAD && origin === P2C_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2C_SUBJECT;
const p2cPhase = p2cCandidate || p2cFrozen;
const p2bCandidate = head === P2A_HEAD && origin === P2A_HEAD && ahead === 0 && behind === 0;
const p2bFrozen = head !== P2A_HEAD && git("rev-parse", "HEAD^") === P2A_HEAD && origin === P2A_HEAD && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2B_SUBJECT;
const p2bPhase = p2bCandidate || p2bFrozen || p2cPhase;
const p2aPhase = p2aCandidate || p2aFrozen || p2bPhase;
const p1cPhase = p1cCandidate || p1cFrozen || p1cPushed || p2aPhase;
const p1bPhase = p1bCandidate || p1bFrozen || p1cPhase;
const allowed = new Set([...(p2cPhase ? P2C_PATHS : []), MIGRATION, ...OWN_SCRIPTS, "package.json", ...SUCCESSOR_GUARDS,
  ...(p1bPhase ? [P1B_MIGRATION, ...P1B_SCRIPTS] : []),
  ...(p1cPhase ? [P1C_MIGRATION, ...P1C_SCRIPTS] : []),
  ...(p2aPhase ? [P2A_MIGRATION, ...P2A_SCRIPTS] : []), ...(p2bPhase ? [P2B_MIGRATION, ...P2B_SCRIPTS] : [])]);
const sql = read(MIGRATION);
const stripped = sql.replace(/(^|\s)--[^\n]*/g, "$1");

const checks = [];
const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 600)}`);
}

check("exact predecessor through bounded P2B lifecycle", candidate || frozen || pushed || p1bPhase, { head, origin, ahead, behind, status });
check("P1A diff contains only the bounded manifest", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration inventory is exact for the recognized phase", migrations.length === (p2bPhase ? 114 : p2aPhase ? 113 : p1cPhase ? 112 : p1bPhase ? 111 : 110), migrations.length);
check("latest migration is exact for the recognized phase", migrations.at(-1) === path.basename(p2bPhase ? P2B_MIGRATION : p2aPhase ? P2A_MIGRATION : p1cPhase ? P1C_MIGRATION : p1bPhase ? P1B_MIGRATION : MIGRATION), migrations.at(-1));
const changedMigrations = changed.filter((file) => file.startsWith("supabase/migrations/"));
check("only the exact additive migrations are introduced", JSON.stringify(changedMigrations) === JSON.stringify(p2bPhase ? [MIGRATION, P1B_MIGRATION, P1C_MIGRATION, P2A_MIGRATION, P2B_MIGRATION] : p2aPhase ? [MIGRATION, P1B_MIGRATION, P1C_MIGRATION, P2A_MIGRATION] : p1cPhase ? [MIGRATION, P1B_MIGRATION, P1C_MIGRATION] : p1bPhase ? [MIGRATION, P1B_MIGRATION] : [MIGRATION]), changedMigrations);
check("all frozen migrations remain byte-identical", git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations").split(/\r?\n/).filter(Boolean).every((file) => file === MIGRATION || (p1bPhase && file === P1B_MIGRATION) || (p1cPhase && file === P1C_MIGRATION) || (p2aPhase && file === P2A_MIGRATION) || (p2bPhase && file === P2B_MIGRATION)));
check("admin_internal is reused and no second private schema is created", !/create\s+schema/i.test(stripped) && /admin_internal\./.test(stripped));

for (const role of ["staff_authority_context_reader", "staff_authority_write_authority"]) {
  check(`${role} exists`, new RegExp(`create role ${role}\\b`).test(stripped));
  check(`${role} is NOLOGIN`, new RegExp(`create role ${role}\\s+nologin`).test(stripped));
  check(`${role} is NOINHERIT`, new RegExp(`create role ${role}[\\s\\S]*?noinherit[\\s\\S]*?;`).test(stripped));
  check(`${role} is NOBYPASSRLS`, new RegExp(`create role ${role}[\\s\\S]*?nobypassrls[\\s\\S]*?;`).test(stripped));
}
check("sealed staff roles are never granted to client roles",
  !/grant\s+staff_authority_(?:context_reader|write_authority)\s+to\s+(?:anon|authenticated|authenticator|service_role|public)/i.test(stripped));
check("no client can SET ROLE into a sealed staff role", !/set\s+role\s+staff_authority_/i.test(stripped));
check("staff_permission_catalog exists", /create table admin_internal\.staff_permission_catalog/.test(stripped));
check("staff_accounts exists", /create table admin_internal\.staff_accounts/.test(stripped));
for (const premature of ["staff_bundle", "staff_permission_entitlements", "staff_delegation", "staff_authority_audit", "staff_authority_operation"]) {
  check(`no premature ${premature} table`, !new RegExp(`create table admin_internal\\.${premature}`).test(stripped));
}
check("permission key is the exact primary authority", /primary key \(permission_key\)/.test(stripped));
check("permission format is lowercase ASCII dotted exact-key syntax", /\^\[a-z\]\[a-z0-9_\]\*\(\\\.\[a-z\]\[a-z0-9_\]\*\)\+\$/.test(stripped));
check("permission key length is bounded at 160", /length\(permission_key\) between 3 and 160/.test(stripped));
check("permission format rejects wildcard characters", /strpos\(permission_key, '\*'\) = 0/.test(stripped) && /strpos\(permission_key, '%'\) = 0/.test(stripped));
check("current underscore compatibility keys are present in the exact seed", /'admin_context\.read'/.test(stripped) && /'admin_audit\.read'/.test(stripped) && /'admin_restaurant_branch\.status\.write'/.test(stripped));
const seedBlock = stripped.match(/insert into admin_internal\.staff_permission_catalog[\s\S]*?;\n/)?.[0] ?? "";
const seeds = [...seedBlock.matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((match) => match[1]).sort();
const expectedSeeds = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort();
check("exactly three current seed rows exist", seeds.length === 3, seeds);
check("the three seed keys are exact", JSON.stringify(seeds) === JSON.stringify(expectedSeeds), seeds);
check("no PLANNED future permission is seeded", !/'planned'[^;]*\),\s*\n\s*\('admin\./.test(seedBlock) && !/admin\.restaurants\./.test(seedBlock));
check("staff account auth identity is unique", /constraint staff_accounts_auth_user_id_key unique \(auth_user_id\)/.test(stripped));
check("Auth FK preserves authority history with RESTRICT", /foreign key \(auth_user_id\) references auth\.users \(id\)\s+on update restrict on delete restrict/.test(stripped));
check("staff lifecycle is exactly active suspended revoked", /check \(status in \('active', 'suspended', 'revoked'\)\)/.test(stripped));
check("expired is not a stored lifecycle", !/status in \([^)]*expired/.test(stripped));
check("effective window is strict and nullable", /check \(effective_until is null or effective_until > effective_from\)/.test(stripped));
check("status version is nonnegative", /check \(status_version >= 0\)/.test(stripped));
check("no staff row or platform_admin compatibility backfill", !/insert\s+into\s+admin_internal\.staff_accounts/i.test(stripped));
check("both new tables enable RLS", (stripped.match(/enable row level security;/g) ?? []).length === 2);
check("both new tables FORCE RLS", (stripped.match(/force row level security;/g) ?? []).length === 2);
check("reader has SELECT policies only", /staff_permission_catalog_reader_select/.test(stripped) && /staff_accounts_reader_select/.test(stripped)
  && !/staff_.*reader_(?:insert|update|delete)/.test(stripped));
check("writer has SELECT INSERT UPDATE policies and no DELETE policy",
  (stripped.match(/staff_(?:permission_catalog|accounts)_writer_(?:select|insert|update)/g) ?? []).length === 6
  && !/staff_.*writer_delete/.test(stripped));
for (const client of ["anon", "authenticated", "authenticator", "service_role", "public"]) {
  check(`${client} receives no direct P1A table grant`, !new RegExp(`grant[^;]+on (?:table )?admin_internal\\.staff_[^;]+to ${client}`).test(stripped));
}
check("client direct privileges are explicitly revoked on both tables",
  (stripped.match(/revoke all on table admin_internal\.staff_/g) ?? []).length === 2
  && (stripped.match(/from public, anon, authenticated, authenticator, service_role;/g) ?? []).length >= 2);
check("context reader receives only column SELECT", /grant select \(permission_key, lifecycle_status, readiness_status, deferred\)/.test(stripped)
  && /grant select \(id, auth_user_id, status, effective_from, effective_until, status_version\)/.test(stripped)
  && !/grant (?:insert|update|delete)[^;]*staff_authority_context_reader/.test(stripped));
check("staff writer receives SELECT INSERT UPDATE and no DELETE",
  (stripped.match(/grant select, insert, update on table admin_internal\.staff_/g) ?? []).length === 2
  && !/grant[^;]*delete[^;]*staff_authority_write_authority/.test(stripped));
check("no public mutation RPC is created", !/create\s+(?:or replace\s+)?function\s+public\./i.test(stripped));
check("staff_current_context_v1 is absent", !/staff_current_context_v1/.test(stripped));
check("staff_has_permission_v1 is absent", !/staff_has_permission_v1/.test(stripped));
check("frozen platform_admin authority is not replaced", !/drop\s+(?:table|function|role)[^;]*platform_admin/i.test(stripped));
check("current Admin application and route registry are unchanged", lines(git("diff", "--name-only", PREDECESSOR, "--", "apps/admin-web")).every((item) => p2cPhase && P2C_APP_PATHS.includes(item)));
check("current three-permission vocabulary is byte-identical", read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").trimEnd() === git("show", `${PREDECESSOR}:apps/admin-web/auth/admin-current-permission-vocabulary.ts`).replace(/\r\n/g, "\n").trimEnd());
check("Admin APIs are unchanged", git("diff", "--name-only", PREDECESSOR, "--", "apps/admin-web/app/api", "apps/admin-web/server") === "");
check("no service_role runtime path is added", !/grant[^;]+to service_role/.test(stripped));
check("no Production configuration is changed", !changed.some((file) => /production|\.env|vercel/i.test(file)));
check("package dependencies and lockfile are unchanged",
  JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {})
  && !changed.some((file) => /lock/i.test(file)));
const pkg = JSON.parse(read("package.json"));
check("P1A package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p1a"] === "node scripts/staff-authority-p3-p6-p1a-guard.mjs"
  && pkg.scripts?.["test:staff-authority-p3-p6-p1a-smoke"] === "node scripts/staff-authority-p3-p6-p1a-smoke.mjs"
  && pkg.scripts?.["test:staff-authority-p3-p6-p1a-mutations"] === "node scripts/staff-authority-p3-p6-p1a-mutations.mjs");
check("P1B package scripts are exact when the bounded successor is present", !p1bPhase
  || pkg.scripts?.["test:staff-authority-p3-p6-p1b"] === "node scripts/staff-authority-p3-p6-p1b-guard.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p1b-smoke"] === "node scripts/staff-authority-p3-p6-p1b-smoke.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p1b-mutations"] === "node scripts/staff-authority-p3-p6-p1b-mutations.mjs");
check("P1C package scripts are exact when the bounded successor is present", !p1cPhase
  || pkg.scripts?.["test:staff-authority-p3-p6-p1c"] === "node scripts/staff-authority-p3-p6-p1c-guard.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p1c-smoke"] === "node scripts/staff-authority-p3-p6-p1c-smoke.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p1c-mutations"] === "node scripts/staff-authority-p3-p6-p1c-mutations.mjs");
check("P2A package scripts are exact when the bounded successor is present", !p2aPhase
  || pkg.scripts?.["test:staff-authority-p3-p6-p2a"] === "node scripts/staff-authority-p3-p6-p2a-guard.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p2a-smoke"] === "node scripts/staff-authority-p3-p6-p2a-smoke.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p2a-mutations"] === "node scripts/staff-authority-p3-p6-p2a-mutations.mjs");
check("P2B package scripts are exact when the bounded successor is present", !p2bPhase
  || pkg.scripts?.["test:staff-authority-p3-p6-p2b"] === "node scripts/staff-authority-p3-p6-p2b-guard.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p2b-smoke"] === "node scripts/staff-authority-p3-p6-p2b-smoke.mjs"
    && pkg.scripts?.["test:staff-authority-p3-p6-p2b-mutations"] === "node scripts/staff-authority-p3-p6-p2b-mutations.mjs");
check("bounded predecessor guard edits contain the exact P1A predecessor and migration",
  changed.filter((file) => SUCCESSOR_GUARDS.has(file)).every((file) => {
    const source = read(file);
    return source.includes(PREDECESSOR) && source.includes(MIGRATION);
  }));
check("migration is one transaction", /^begin;/m.test(stripped) && /^commit;/m.test(stripped));
check("migration grants no staff role membership or SET path",
  !/grant\s+staff_authority_[a-z_]+\s+to\s+/i.test(stripped)
  && !/set\s+role\s+staff_authority_/i.test(stripped));

const migrationSha256 = crypto.createHash("sha256").update(read(MIGRATION), "utf8").digest("hex");
check("frozen P1A migration SHA-256 remains exact", migrationSha256 === P1A_SHA256, migrationSha256);
console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p1a-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : p1bCandidate ? "p1b_candidate" : p1bFrozen ? "p1b_frozen_local" : p1cCandidate ? "p1c_candidate" : p1cFrozen ? "p1c_frozen_local" : p2aCandidate ? "p2a_candidate" : p2aFrozen ? "p2a_frozen_local" : p2bCandidate ? "p2b_candidate" : p2bFrozen ? "p2b_frozen_local" : p2cCandidate ? "p2c_candidate" : p2cFrozen ? "p2c_frozen_local" : p1cPushed ? "p1c_pushed" : pushed ? "pushed" : p1bPushed ? "p1b_pushed" : "invalid",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  migrationSha256,
  changedPaths: changed,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
