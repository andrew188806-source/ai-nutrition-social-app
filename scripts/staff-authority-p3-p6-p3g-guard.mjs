#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASELINE = "13d89a50bc05c3992332b245d6c47e05f2fe392f";
const MIGRATION = "supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql";
const R1 = "supabase/migrations/20260916010000_staff_management_p3_p6_p3g_r1_extend_collation_repair.sql";
const P3F = "supabase/migrations/20260915020000_staff_management_p3_p6_p3f_privileged_permission_operator.sql";
const VOCABULARY = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const CLI = "scripts/break-glass-control.mjs";
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const git = (...args) => execFileSync("git", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}).trim();
const sql = read(MIGRATION);
const cli = read(CLI);
const pkg = JSON.parse(read("package.json"));
const vocabulary = read(VOCABULARY);
const migrations = fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort();
const r1Phase = migrations.length === 124 && migrations.at(-1) === R1.split("/").at(-1);
const changed = [...new Set([
  ...git("diff", "--name-only", BASELINE).split(/\r?\n/),
  ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/),
].filter(Boolean))].sort();
const allowed = new Set([
  "package.json",
  "package-lock.json",
  MIGRATION,
  CLI,
  "scripts/staff-authority-p3-p6-p3g-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3g-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3g-postgres.mjs",
  "scripts/staff-authority-p3-p6-p3b-successor-awareness.mjs",
  "scripts/staff-authority-p3-p6-p3b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3c-guard.mjs",
  "scripts/staff-authority-p3-p6-p3d-guard.mjs",
  "scripts/staff-authority-p3-p6-p3e-guard.mjs",
  "scripts/staff-authority-p3-p6-p3f-guard.mjs",
  R1,
  "scripts/staff-authority-p3-p6-p3g-r1-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-r1-mutations.mjs",
]);
const root = [
  "admin_context.read",
  "admin.management.staff.account.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
];
const callableControlFunctions = [
  "staff_break_glass_enroll_principal_v1",
  "staff_break_glass_revoke_principal_v1",
  "staff_break_glass_activate_v1",
  "staff_break_glass_extend_activation_v1",
  "staff_break_glass_close_activation_v1",
  "staff_break_glass_status_v1",
  "staff_break_glass_recent_audit_v1",
];
const expectedVocabulary = [
  "admin_audit.read",
  "admin_context.read",
  "admin.management.staff.account.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write",
  "admin_restaurant_branch.status.write",
];
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(!condition && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

check("exact P3F-R1 predecessor is an ancestor", git("merge-base", "HEAD", BASELINE) === BASELINE);
check("migration inventory advances 122 to 123 or exact bounded R1", migrations.length === (r1Phase ? 124 : 123), migrations.length);
check("P3G migration is present exactly once and latest, or has only its exact R1 successor",
  migrations.filter((file) => file.includes("p3g_break_glass_control_plane")).length === 1
  && migrations.filter((file) => file.includes("p3g_r1_extend_collation_repair")).length === (r1Phase ? 1 : 0)
  && (r1Phase ? migrations.at(-1) === R1.split("/").at(-1) : migrations.at(-1) === MIGRATION.split("/").at(-1)));
check("P3F migration SHA is pinned", sha(P3F) === "fcfb4b50f9cc2d97efb136dbdbc6c41ef069261f17312e43c5d1ffa3bb3468b3");
check("changed paths are bounded", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
check("no application runtime path changed", !changed.some((file) => /^(apps|packages|supabase\/functions)\//.test(file)));
check("migration is one complete transaction", /^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/.test(sql));
check("no permission catalogue key is inserted or updated", !/(?:insert into|update) admin_internal\.staff_permission_catalog/i.test(sql));
const currentKeys = [...vocabulary.matchAll(/^\s+"([a-z0-9_.]+)"/gm)].map((match) => match[1]);
check("CURRENT application vocabulary remains exact seven",
  JSON.stringify(currentKeys) === JSON.stringify(expectedVocabulary), currentKeys);
check("sealed control role has exact attributes", /create role staff_break_glass_control_authority\s+nologin\s+noinherit\s+nobypassrls;/.test(sql));
check("sealed role has no client membership", !/grant staff_break_glass_control_authority to (?:anon|authenticated|authenticator|service_role)/i.test(sql));
check("principal registry has required identity and lifecycle", /create table admin_internal\.staff_break_glass_principals[\s\S]*principal_id uuid[\s\S]*auth_user_id uuid not null[\s\S]*staff_account_id uuid not null[\s\S]*status_version bigint/.test(sql));
check("principal foreign keys preserve history", /staff_break_glass_principals_auth_user_fkey[\s\S]*on update restrict on delete restrict[\s\S]*staff_break_glass_principals_staff_account_fkey[\s\S]*on update restrict on delete restrict/.test(sql));
check("active principal identity uniqueness is exact", /staff_break_glass_principals_active_auth_key[\s\S]*where status = 'active'[\s\S]*staff_break_glass_principals_active_staff_key[\s\S]*where status = 'active'/.test(sql));
check("maximum two principals is globally serialized", /pg_advisory_xact_lock[\s\S]*staff_break_glass_principal_capacity[\s\S]*v_active_count >= 2[\s\S]*principal_capacity_reached/.test(sql));
check("revoked principals are terminal", /break_glass_principal_revoked_terminal/.test(sql) && !/set status = 'active'[^;]*staff_break_glass_principals/i.test(sql));
check("enroll accepts no staff account parameter", /staff_break_glass_enroll_principal_v1\(\s*p_auth_user_id uuid,\s*p_reason_code text,\s*p_request_id uuid\s*\)/m.test(sql));
check("enroll creates only a missing active staff account", /tastkind\.break_glass\.enroll_auth_user_id[\s\S]*insert into admin_internal\.staff_accounts[\s\S]*p_auth_user_id, 'active', v_now, null, 0/.test(sql));
check("existing staff account fails closed", /v_staff\.status <> 'active'[\s\S]*v_staff\.effective_from > v_now[\s\S]*v_now >= v_staff\.effective_until[\s\S]*staff_account_not_effective/.test(sql));
check("P3G has no staff account UPDATE authority", !/update admin_internal\.staff_accounts/i.test(sql)
  && !/grant update[^;]*admin_internal\.staff_accounts/i.test(sql));
check("P3G never creates an Auth user", !/insert into auth\.users|auth\.admin|createUser|inviteUser/i.test(sql));
check("principal revoke uses CAS and blocks live activation", /staff_break_glass_revoke_principal_v1[\s\S]*status_version <> p_expected_status_version[\s\S]*active_activation_exists/.test(sql));
check("activation registry is finite and history preserving", /create table admin_internal\.staff_break_glass_activations[\s\S]*effective_until timestamptz not null[\s\S]*effective_until <= effective_from \+ interval '2 hours'/.test(sql));
check("one stored active activation per principal", /staff_break_glass_activations_active_principal_key[\s\S]*where status = 'active'/.test(sql));
check("default activation is exactly 30 minutes", /v_now \+ interval '30 minutes'/.test(sql));
check("extension adds at most exactly 30 minutes", /v_activation\.effective_until \+ interval '30 minutes'[\s\S]*v_new_end <= v_activation\.effective_until/.test(sql));
check("continuous activation cap is exactly two hours", (sql.match(/effective_from \+ interval '2 hours'/g) ?? []).length >= 4);
check("caller supplies no duration or window", !/staff_break_glass_(?:activate|extend_activation)_v1\([\s\S]{0,250}p_(?:duration|effective_from|effective_until)/.test(sql));
check("activation end can never be NULL", /effective_until timestamptz not null/.test(sql)
  && !/insert into admin_internal\.staff_break_glass_activations[\s\S]{0,600}\bnull\b/.test(sql));
check("staff envelope clips open and extend", (sql.match(/coalesce\(v_staff\.effective_until, 'infinity'::timestamptz\)/g) ?? []).length >= 2);
for (const key of root) check(`root set contains ${key}`, sql.includes(`'${key}'`));
check("activation grant CHECK is exact four", /staff_break_glass_activation_grants_permission_check check \([\s\S]*permission_key in \([\s\S]*admin_context\.read[\s\S]*account\.write[\s\S]*console_admission\.write[\s\S]*permission\.write[\s\S]*\)\s*\)/.test(sql));
check("root set excludes audit delegation and branch", !/foreach v_permission_key[\s\S]{0,500}(?:admin_audit\.read|delegation\.write|admin_restaurant_branch\.status\.write)/.test(sql));
check("activation provenance binds unique entitlement and permission", /activation_id, permission_key\)[\s\S]*unique \(entitlement_id\)/.test(sql));
check("P3G entitlement source remains direct_grant", /v_permission_key, 'direct_grant',\s*null, 'active'/.test(sql));
check("deferred provenance consistency validates target permission source and window", /deferrable initially deferred[\s\S]*assert_staff_break_glass_activation_grant_consistency_v1/.test(sql)
  && /entitlement_effective_from <> v_row\.activation_effective_from[\s\S]*entitlement_effective_until <> v_row\.activation_effective_until/.test(sql));
check("extend locks and updates only linked four sources", /staff_break_glass_extend_activation_v1[\s\S]*join admin_internal\.staff_break_glass_activation_grants[\s\S]*update admin_internal\.staff_permission_entitlements entitlement[\s\S]*from admin_internal\.staff_break_glass_activation_grants/.test(sql));
check("close revokes only linked four sources", /staff_break_glass_close_activation_v1[\s\S]*where grant_row\.activation_id = p_activation_id[\s\S]*v_count <> 4[\s\S]*update admin_internal\.staff_permission_entitlements entitlement[\s\S]*grant_row\.entitlement_id = entitlement\.entitlement_id/.test(sql));
check("expired activation cannot extend", /v_now >= v_activation\.effective_until[\s\S]*activation_expired/.test(sql));
check("natural expiry has bounded reap and no scheduler", /staff_break_glass_reap_expired_activation_v1[\s\S]*natural_expiry_reap/.test(sql));
check("control receipts have exact operator/request key", /staff_break_glass_control_receipts_pkey\s+primary key \(operator_db_role, request_id\)/.test(sql));
check("control receipts use exact operation vocabulary", ["principal_enroll", "principal_revoke", "activation_open", "activation_extend", "activation_close"].every((kind) => sql.includes(`'${kind}'`)));
check("request IDs are UUIDv4 and globally serialized", /request_v4_check[\s\S]*uuid_send\(request_id\)/.test(sql)
  && /staff_break_glass_request:/.test(sql));
check("exact replay and payload conflict are bounded", /return v_prior\.result_payload/.test(sql) && /message = 'request_conflict'/.test(sql));
check("control audit captures required evidence", /create table admin_internal\.staff_break_glass_audit_log[\s\S]*operator_db_role[\s\S]*operation_kind[\s\S]*before_state jsonb[\s\S]*after_state jsonb/.test(sql));
check("reason is mandatory and bounded", /invalid_reason_code/.test(sql) && /\^\[a-z\]\[a-z0-9_\]\*\$/.test(sql));
check("all five P3G tables ENABLE and FORCE RLS", (sql.match(/alter table admin_internal\.staff_break_glass_[a-z_]+ enable row level security;/g) ?? []).length === 5
  && (sql.match(/alter table admin_internal\.staff_break_glass_[a-z_]+ force row level security;/g) ?? []).length === 5);
check("P3G tables deny all client roles", (sql.match(/from public, anon, authenticated, authenticator, service_role;/g) ?? []).length >= 6);
check("P3G performs no physical DELETE", !/delete from admin_internal\.(?:staff_break_glass|staff_permission_entitlements)/i.test(sql));
check("private control functions use session_user postgres gate", callableControlFunctions.every((name) => {
  const start = sql.indexOf(`create function admin_internal.${name}(`);
  const end = sql.indexOf("\n$$;", start);
  return start >= 0 && end > start && sql.slice(start, end).includes("if session_user <> 'postgres'");
}));
check("no public-schema break-glass function exists", !/function public\.staff_break_glass/i.test(sql));
check("postgres alone receives callable control EXECUTE", /grant execute on function[\s\S]*staff_break_glass_recent_audit_v1\(integer\)[\s\S]*to postgres;/.test(sql)
  && !/grant execute[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql));
check("service_role receives zero break-glass authority", !/grant (?:select|insert|update|delete|execute)[^;]*service_role/i.test(sql));
check("legacy Platform Admin receives zero break-glass authority", !/platform_admin/i.test(sql));
check("migration seeds zero real identity or authority", !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|@[a-z0-9.-]+/i.test(sql));
check("CLI file and package command exist", fs.existsSync(CLI) && pkg.scripts["break-glass"] === "node scripts/break-glass-control.mjs");
check("CLI uses pg parameterized private function calls", /from "pg"/.test(cli)
  && /staff_break_glass_[a-z_]+_v1\(\$1/.test(cli));
check("CLI never mutates tables directly", !/(?:insert into|update|delete from) admin_internal/i.test(cli));
check("CLI requires explicit environment", /target_environment_required/.test(cli)
  && /development\/production/.test(cli));
check("CLI never silently targets Production", /PRODUCTION BREAK GLASS/.test(cli)
  && /production_confirmation_required/.test(cli));
check("CLI names credentials without embedding values", cli.includes("TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL")
  && cli.includes("TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL")
  && !/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i.test(cli));
check("CLI rejects service_role use by contract", /service_role credentials are invalid/.test(cli));
check("CLI offers status activate extend close enroll revoke audit", ["Status", "Activate", "Extend +30 minutes", "Close activation", "Enroll principal", "Revoke principal", "Recent audit"].every((label) => cli.includes(label)));
check("CLI help documents 30m +30m and 2h", /--help/.test(cli) && /30 minutes/.test(cli) && /2 hours/.test(cli));
check("P3H remains explicitly deferred", /HIGH_PRIVILEGE_STEP_UP_STILL_DEFERRED_TO_P3H/.test(sql));
check("real primary bootstrap is operationally gated", /DO_NOT_OPERATIONALLY_BOOTSTRAP_REAL_PRIMARY_BEFORE_P3H_ACCEPTANCE/.test(sql));
const authored = changed.filter((file) => fs.existsSync(file)).map(read).join("\n");
check("secret scan is clean", ![
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
].some((pattern) => pattern.test(authored)));

console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p3g-guard",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  migrationCount: migrations.length,
  changedPaths: changed,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
