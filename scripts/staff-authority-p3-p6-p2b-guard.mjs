#!/usr/bin/env node
// P3-P6-P2B static compatibility, provenance, and source-isolation gate.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";

const ROOT = process.cwd();
const PREDECESSOR = "8c8ab93fc091f76f8b0af535c910d8a5227d48cb";
const SUBJECT = "Add Platform Admin staff compatibility bridge";
const MIGRATION = "supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql";
const OWN = [MIGRATION, "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2b-smoke.mjs", "scripts/staff-authority-p3-p6-p2b-mutations.mjs", "package.json"];
const SUCCESSOR_GUARDS = [
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs", "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const FROZEN = new Map([
  ["supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql", "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf"],
  ["supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql", "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4"],
  ["supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "c4f3877f889582a3af14533f530135beced7ba68a7d11f82e23f2b4ea996e835"],
  ["supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d"],
  ["supabase/migrations/20260904010000_platform_admin_authority.sql", "b97b45c6090e8b0284da4da7b24b7de3cde4a87f0b7d25583216fabd07048a44"],
  ["supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql", "dac22c901da171d44b2f064024d10b00f31d78e9fe27f51341baca69a3b44f5a"]
]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const sha = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (v) => v ? v.split(/\r?\n/).filter(Boolean) : [];
const sql = read(MIGRATION), bare = sql.replace(/(^|\s)--[^\n]*/g, "$1");
const legacyFoundation = read("supabase/migrations/20260904010000_platform_admin_authority.sql");
const legacyBranch = read("supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql");
const legacyDto = legacyBranch.slice(legacyBranch.indexOf("create or replace function public.platform_admin_current_context_v1"), legacyBranch.indexOf("reset role;", legacyBranch.indexOf("create or replace function public.platform_admin_current_context_v1")));
const sync = bare.slice(bare.indexOf("create function admin_internal.sync_platform_admin_staff_compatibility_v1"), bare.indexOf("create function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1"));
const triggerFn = bare.slice(bare.indexOf("create function admin_internal.sync_platform_admin_staff_compatibility_trigger_v1"), bare.indexOf("revoke all on function admin_internal.sync_platform_admin_staff_compatibility_v1"));
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1", "--untracked-files=all"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const allowed = new Set([...OWN, ...SUCCESSOR_GUARDS]);
const checks = [], failures = [];
function check(name, pass, detail) { const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1200)}`); }

check("exact P2A predecessor and local-only lifecycle", candidate || frozen, { head, origin, ahead, behind, status });
check("P2B diff contains only bounded paths", changed.every((f) => allowed.has(f)), changed.filter((f) => !allowed.has(f)));
for (const [file, digest] of FROZEN) check(`${path.basename(file)} remains hash-pinned`, sha(read(file)) === digest, sha(read(file)));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
check("migration inventory advances exactly 113 to 114", migrations.length === 114, migrations.length);
check("P2B is the exact latest migration", migrations.at(-1) === path.basename(MIGRATION), migrations.at(-1));
check("exactly one migration is added after P2A", JSON.stringify(changed.filter((f) => f.startsWith("supabase/migrations/"))) === JSON.stringify([MIGRATION]));
check("no frozen migration is modified", lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations")).every((f) => f === MIGRATION));
check("legacy grant and revoke definitions are not replaced", !/create\s+(?:or replace\s+)?function\s+admin_internal\.(?:grant|revoke)_platform_admin/i.test(bare));
check("legacy read resolver definitions are not replaced", !/create\s+(?:or replace\s+)?function\s+public\.platform_admin_(?:current_context|has_permission)_v1/i.test(bare));
check("P2A resolver definitions are not replaced", !/create\s+(?:or replace\s+)?function\s+public\.staff_(?:current_context|has_permission)_v1/i.test(bare));
check("frozen legacy DTO remains the intentional exact two-key projection", /permission\.permission_key in \('admin_context\.read', 'admin_audit\.read'\)/.test(legacyDto) && !/admin_restaurant_branch\.status\.write/.test(legacyDto));
const legacyKeys = [...legacyFoundation.matchAll(/\('00000000-0000-4000-8000-00000000ad01', '([a-z0-9_.]+)', '(?:self|platform)'\)/g), ...legacyBranch.matchAll(/values \('00000000-0000-4000-8000-00000000ad01', '([a-z0-9_.]+)', '(?:self|platform)'\)/g)].map((m) => m[1]).sort();
check("canonical legacy role-permission vocabulary is exact current three", JSON.stringify(legacyKeys) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort()), legacyKeys);

check("private compatibility link table exists", /create table admin_internal\.staff_platform_admin_compatibility_links/.test(bare));
for (const fk of ["membership", "staff_account", "permission", "entitlement"]) check(`compatibility ${fk} FK is non-destructive`, new RegExp(`compatibility_links_${fk}_fkey[\\s\\S]{0,260}on update restrict on delete restrict`).test(bare));
check("link lifecycle is active or revoked", /status in \('active', 'revoked'\)/.test(bare) && /revocation_shape_check/.test(bare));
check("active membership-permission links are unique", /unique index staff_platform_admin_compatibility_links_active_key[\s\S]*\(platform_admin_membership_id, permission_key\)[\s\S]*where status = 'active'/.test(bare));
check("link table enables and forces RLS", /compatibility_links enable row level security/.test(bare) && /compatibility_links force row level security/.test(bare));
check("link table has writer-only RLS policies", (bare.match(/create policy staff_platform_admin_compatibility_links_writer_/g) ?? []).length === 3 && !/compatibility_links_[a-z_]+\s+[\s\S]{0,100}to (?:public|anon|authenticated|authenticator|service_role|staff_authority_context_reader)/i.test(bare));
check("all client and context-reader link privileges are revoked", /revoke all on table admin_internal\.staff_platform_admin_compatibility_links\s+from public, anon, authenticated, authenticator, service_role, staff_authority_context_reader;/.test(bare));
check("writer has link SELECT INSERT and bounded UPDATE only", /grant select, insert on table admin_internal\.staff_platform_admin_compatibility_links\s+to staff_authority_write_authority;/.test(bare) && /grant update \(status, revoked_at\)/.test(bare) && !/grant delete[^;]*compatibility_links/i.test(bare));

check("writer receives exact legacy role columns", /grant select \(id, role_key, status\)\s+on table admin_internal\.platform_admin_roles to staff_authority_write_authority;/.test(bare));
check("writer receives exact legacy permission columns", /grant select \(role_id, permission_key\)\s+on table admin_internal\.platform_admin_role_permissions to staff_authority_write_authority;/.test(bare));
check("writer receives exact legacy membership columns", /grant select \(id, auth_user_id, role_id, status, granted_at, revoked_at\)\s+on table admin_internal\.platform_admin_memberships to staff_authority_write_authority;/.test(bare));
check("writer receives matching legacy SELECT policies", (bare.match(/create policy platform_admin_(?:roles|role_permissions|memberships)_staff_compatibility_select/g) ?? []).length === 3);
check("writer receives no legacy mutation or audit privilege", !/grant\s+(?:insert|update|delete)[^;]+platform_admin_(?:roles|role_permissions|memberships|audit_log)[^;]+staff_authority_write_authority/i.test(bare) && !/platform_admin_audit_log_staff_compatibility/.test(bare));

check("sealed synchronizer has one membership-id input", /sync_platform_admin_staff_compatibility_v1\(\s*p_platform_admin_membership_id uuid\s*\)/.test(sync));
check("synchronizer is volatile SECURITY DEFINER", /language plpgsql\s+volatile\s+security definer/.test(sync));
check("synchronizer pins empty search path RLS and UTC", /set search_path = ''\s+set row_security = 'on'\s+set timezone = 'UTC'/.test(sync));
check("synchronizer uses transaction-scoped membership lock", /pg_advisory_xact_lock[\s\S]*hashtextextended\(p_platform_admin_membership_id::text, 0\)/.test(sync));
check("active legacy authority requires active platform_admin role", /v_membership\.status <> 'active'[\s\S]*v_membership\.role_key is distinct from 'platform_admin'[\s\S]*v_membership\.role_status is distinct from 'active'/.test(sync));
check("permissions derive from exact legacy rows", /select distinct permission\.permission_key[\s\S]*platform_admin_role_permissions permission[\s\S]*permission\.role_id = v_membership\.role_id/.test(sync));
check("mirror never derives from the legacy context DTO", !/platform_admin_current_context_v1/.test(sync));
check("mirror contains no hardcoded DTO or extra permission key", !/'[a-z][a-z0-9_]*\.[a-z0-9_.]+'/.test(sync));
check("permission parity fails closed", /v_current_permission_count <> v_legacy_permission_count[\s\S]*platform_admin_compatibility_permission_parity_broken/.test(sync));
check("catalog requires active and current", /catalog\.lifecycle_status = 'active'[\s\S]*catalog\.readiness_status = 'current'/.test(sync));
check("staff account is created identity-only", /insert into admin_internal\.staff_accounts \(\s*auth_user_id, status, effective_from, effective_until/.test(sync) && !/job|title|manager|bundle_key|role_key/.test(sync.slice(sync.indexOf("insert into admin_internal.staff_accounts"), sync.indexOf("returning id, status"))));
check("existing ineffective staff account fails closed", /v_staff_account\.status <> 'active'[\s\S]*effective_from > v_now[\s\S]*v_now >= v_staff_account\.effective_until[\s\S]*staff_account_conflict/.test(sync));
check("compatibility creates exact migration_backfill source", /v_staff_account\.id, v_permission_key, 'migration_backfill', null/.test(sync));
check("compatibility includes console admission without changing catalog", /v_permission_key, 'migration_backfill'/.test(sync) && !/update admin_internal\.staff_permission_catalog/.test(sync));
check("entitlement starts no earlier than both sources", /greatest\(v_membership\.granted_at, v_staff_account\.effective_from\)/.test(sync));
check("active-link reuse validates exact linked entitlement", /entitlement\.entitlement_id = v_link\.entitlement_id[\s\S]*entitlement\.staff_account_id = v_staff_account\.id[\s\S]*entitlement\.permission_key = v_permission_key[\s\S]*source_type = 'migration_backfill'/.test(sync));
check("revocation targets linked entitlement ID", /entitlement\.entitlement_id = v_link\.entitlement_id/.test(sync));
check("revocation also matches source identity", /entitlement\.staff_account_id = v_link\.staff_account_id[\s\S]*entitlement\.permission_key = v_link\.permission_key[\s\S]*entitlement\.source_type = 'migration_backfill'[\s\S]*source_bundle_assignment_id is null/.test(sync));
check("revocation never targets broad staff plus permission", !/update admin_internal\.staff_permission_entitlements[\s\S]{0,600}where entitlement\.staff_account_id = v_link\.staff_account_id\s+and entitlement\.permission_key = v_link\.permission_key\s+and entitlement\.source_type/i.test(sync));
check("legacy non-active path revokes links and entitlements", /if v_membership\.status <> 'active'[\s\S]*set status = 'revoked', effective_until = v_now, revoked_at = v_now[\s\S]*compatibility_links[\s\S]*set status = 'revoked', revoked_at = v_now/.test(sync));
check("legacy revoke never updates staff account", !/update admin_internal\.staff_accounts/.test(sync));
check("synchronizer has no DELETE lifecycle", !/\bdelete\s+from\b/i.test(sync));
check("synchronizer has no Bundle template read or compatibility Bundle", !/staff_bundle_templates|staff_bundle_template_permissions|insert into admin_internal\.staff_bundle_assignments/.test(sync));
check("synchronizer has no reverse legacy mutation", !/(insert|update|delete)\s+(into\s+)?admin_internal\.platform_admin_/i.test(sync));
check("synchronizer has no wildcard or prefix authority", !/\blike\b|\bilike\b|starts_with|permission_key\s*~/.test(sync));

check("trigger helper transactionally invokes synchronizer", /perform admin_internal\.sync_platform_admin_staff_compatibility_v1\(new\.id\)/.test(triggerFn));
check("membership trigger covers INSERT and effective updates", /create trigger platform_admin_memberships_staff_compatibility_v1\s+after insert or update of role_id, status, granted_at, revoked_at\s+on admin_internal\.platform_admin_memberships/.test(bare));
check("both helpers are owned by sealed writer", /alter function admin_internal\.sync_platform_admin_staff_compatibility_v1\(uuid\)\s+owner to staff_authority_write_authority;/.test(bare) && /alter function admin_internal\.sync_platform_admin_staff_compatibility_trigger_v1\(\)\s+owner to staff_authority_write_authority;/.test(bare));
check("helpers have no client or legacy-writer EXECUTE", (bare.match(/revoke all on function admin_internal\.sync_platform_admin_staff_compatibility/g) ?? []).length === 2 && !/grant execute on function admin_internal\.sync_platform_admin_staff_compatibility/i.test(bare));
check("temporary SET-role path is removed", /grant staff_authority_write_authority to postgres[\s\S]*set role staff_authority_write_authority;[\s\S]*reset role;[\s\S]*revoke staff_authority_write_authority from postgres granted by postgres;/.test(bare));
check("bounded initial reconciliation calls sealed sync", /for v_membership_id in[\s\S]*from admin_internal\.platform_admin_memberships[\s\S]*sync_platform_admin_staff_compatibility_v1\(v_membership_id\)/.test(bare));

const p1a = read("supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql");
const currentKeys = [...p1a.matchAll(/\('([a-z0-9_.]+)',\s*'active',\s*'current'/g)].map((m) => m[1]).sort();
check("staff catalog remains exact current three", JSON.stringify(currentKeys) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort()), currentKeys);
check("P2B seeds no permission Bundle or staff identity", !/insert into admin_internal\.(?:staff_permission_catalog|staff_bundle_templates|staff_bundle_template_permissions|staff_bundle_assignments)\b/i.test(bare));
check("P1C audit constraints are untouched", !/staff_authority_audit_log/.test(bare));
check("application source is unchanged", git("diff", "--name-only", PREDECESSOR, "--", "apps", "packages", "functions") === "");
check("no route or Admin API promotion", git("diff", "--name-only", PREDECESSOR, "--", "apps/admin-web/auth", "apps/admin-web/app/api", "apps/admin-web/server") === "");
check("no migration-history repair or environment access", !/schema_migrations|supabase db push|migration sync|development|production/i.test(bare));
const pkg = JSON.parse(read("package.json"));
check("P2B package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p2b"] === "node scripts/staff-authority-p3-p6-p2b-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2b-smoke"] === "node scripts/staff-authority-p3-p6-p2b-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2b-mutations"] === "node scripts/staff-authority-p3-p6-p2b-mutations.mjs");
check("dependencies and lockfiles are unchanged", JSON.stringify(pkg.dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {}) && !changed.some((f) => /lock/i.test(f)));
check("bounded predecessor awareness names exact P2B migration", changed.filter((f) => SUCCESSOR_GUARDS.includes(f)).every((f) => read(f).includes(MIGRATION) && read(f).includes(PREDECESSOR)));
const changedText = changed.filter(exists).map(read).join("\n");
check("changed files contain no credential-shaped value", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((p) => p.test(changedText)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2b-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((f) => f.name), migrationSha256: sha(sql), changedPaths: changed, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
