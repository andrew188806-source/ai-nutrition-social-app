#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PREDECESSOR = "1a17400e1ebbc219cb4968f275cfabeef7030c21";
const MIGRATION = "supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql";
const P3C = "supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql";
const P3E = "supabase/migrations/20260915010000_staff_management_p3_p6_p3e_console_admission_operator.sql";
const P3F = "supabase/migrations/20260915020000_staff_management_p3_p6_p3f_privileged_permission_operator.sql";
const P2A = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const VOCABULARY = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const sql = read(MIGRATION);
const p3c = read(P3C);
const p2a = read(P2A);
const vocabulary = await import(pathToFileURL(path.join(ROOT, VOCABULARY)).href + `?v=${Date.now()}`);
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort();
const p3ePhase = migrations.length === 121 && migrations.at(-1) === path.basename(P3E);
const p3fPhase = migrations.length === 122 && migrations.at(-1) === path.basename(P3F);
const changed = [...new Set([
  ...git("diff", "--name-only", PREDECESSOR).split(/\r?\n/),
  ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/)
].filter(Boolean))].sort();
const allowed = new Set([
  MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p3d-guard.mjs",
  "scripts/staff-authority-p3-p6-p3d-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3d-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3a-guard.mjs",
  "scripts/staff-authority-p3-p6-p3a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3c-guard.mjs",
  "scripts/staff-authority-p3-p6-p3c-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3b-successor-awareness.mjs"
  ,P3E
  ,"apps/admin-web/auth/admin-current-permission-vocabulary.ts"
  ,"scripts/staff-authority-p3-p6-p3e-guard.mjs"
  ,"scripts/staff-authority-p3-p6-p3e-smoke.mjs"
  ,"scripts/staff-authority-p3-p6-p3e-mutations.mjs"
  ,P3F
  ,"scripts/staff-authority-p3-p6-p3f-guard.mjs"
  ,"scripts/staff-authority-p3-p6-p3f-smoke.mjs"
  ,"scripts/staff-authority-p3-p6-p3f-mutations.mjs"
]);
const checks = [], failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
const current = [
  "admin_audit.read", "admin_context.read", "admin.management.staff.account.write",
  "admin.management.staff.delegation.write", "admin_restaurant_branch.status.write"
];
const successorCurrent = p3fPhase ? [...current.slice(0, 4), "admin.management.staff.console_admission.write", "admin.management.staff.permission.write", current[4]] : p3ePhase ? [...current.slice(0, 4), "admin.management.staff.console_admission.write", current[4]] : current;
const rpcs = ["staff_delegated_grant_permission_v1", "staff_delegated_revoke_permission_v1"];
const allChangedText = changed.filter((file) => fs.existsSync(path.join(ROOT, file))).map(read).join("\n");

check("migration is one complete transaction", /^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/.test(sql));
check("exact P3C predecessor is present", git("merge-base", "HEAD", PREDECESSOR) === PREDECESSOR);
check("migration count is exact through bounded P3F", migrations.length === (p3fPhase ? 122 : p3ePhase ? 121 : 120), migrations.length);
check("P3D migration has only exact P3E/P3F successors", migrations.at(-1) === path.basename(p3fPhase ? P3F : p3ePhase ? P3E : MIGRATION) && migrations.filter((x) => x.includes("p3d_delegated_permission_operator")).length === 1, migrations.at(-1));
check("changed paths are bounded", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
check("P3C migration hash is frozen", sha(P3C) === "9140a6bac29b56c00bccdc3eee40f9023ef19fb474dfff46a6a8c0e90ff9d5f4");
check("P2A resolver hash is frozen", sha(P2A) === "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d");
check("permission.write is not promoted", !/update admin_internal\.staff_permission_catalog[\s\S]*admin\.management\.staff\.permission\.write/.test(sql));
check("application vocabulary is exact through bounded P3F", JSON.stringify(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS) === JSON.stringify(successorCurrent), vocabulary.CURRENT_ADMIN_PERMISSION_KEYS);
check("P3C remains sole delegation.write promotion", /admin\.management\.staff\.delegation\.write/.test(p3c) && !/set readiness_status = 'current'/.test(sql));
check("provenance table exists", /create table admin_internal\.staff_delegated_permission_grants/.test(sql));
check("entitlement foreign key is restrictive", /staff_delegated_permission_grants_entitlement_fkey[\s\S]*staff_permission_entitlements \(entitlement_id\)[\s\S]*on update restrict on delete restrict/.test(sql));
check("delegation foreign key is restrictive", /staff_delegated_permission_grants_delegation_fkey[\s\S]*staff_permission_delegations \(delegation_id\)[\s\S]*on update restrict on delete restrict/.test(sql));
check("target foreign key is restrictive", /staff_delegated_permission_grants_target_fkey[\s\S]*staff_accounts \(id\)[\s\S]*on update restrict on delete restrict/.test(sql));
check("permission foreign key is restrictive", /staff_delegated_permission_grants_permission_fkey[\s\S]*staff_permission_catalog \(permission_key\)[\s\S]*on update restrict on delete restrict/.test(sql));
check("every provenance foreign key preserves history", (sql.match(/on update restrict on delete restrict/g) ?? []).length >= 8 && !/on delete cascade/i.test(sql));
check("provenance table enables and forces RLS", /alter table admin_internal\.staff_delegated_permission_grants enable row level security;[\s\S]*alter table admin_internal\.staff_delegated_permission_grants force row level security;/.test(sql));
check("clients have no provenance table access", /revoke all on table admin_internal\.staff_delegated_permission_grants[\s\S]*from public, anon, authenticated, authenticator, service_role;/.test(sql));
check("service role receives no table or function grant", !/grant[^;]*(?:staff_delegated_permission_grants|staff_delegated_(?:grant|revoke)_permission_v1)[^;]*service_role/i.test(sql));
check("migration seeds no provenance", !/insert into admin_internal\.staff_delegated_permission_grants[\s\S]*values\s*\([^\n]*['\"]admin_/i.test(sql));
check("migration seeds no entitlement", !/insert into admin_internal\.staff_permission_entitlements[\s\S]*values\s*\([^\n]*['\"]admin_/i.test(sql));
check("exactly two public P3D RPCs exist", rpcs.every((fn) => new RegExp(`create function public\\.${fn}\\(`).test(sql)) && (sql.match(/create function public\.staff_delegated_[a-z_]+_v1\(/g) ?? []).length === 2);
check("public RPCs are volatile security definers", rpcs.every((fn) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?volatile[\\s\\S]*?security definer`).test(sql)));
check("public RPCs force empty path and RLS", rpcs.every((fn) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?set search_path = ''[\\s\\S]*?set row_security = 'on'`).test(sql)));
check("authenticated is sole client executor", rpcs.every((fn) => new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to authenticated`).test(sql)));
check("public RPCs accept no caller actor", !/create function public\.staff_delegated_[\s\S]*?p_actor/i.test(sql));
check("actor is derived from JWT subject", /lock_current_staff_delegated_actor_v1[\s\S]*staff_request_subject_v1\(\)/.test(sql));
check("actor staff row is locked and effective", /where account\.auth_user_id = v_actor_auth_user_id[\s\S]*for update[\s\S]*v_account\.status <> 'active'[\s\S]*v_account\.effective_from > v_database_now/.test(sql));
check("actor requires no management or console key", !/lock_current_staff_delegated_actor_v1[\s\S]{0,1800}admin_context\.read|lock_current_staff_delegated_actor_v1[\s\S]{0,1800}admin\.management\./.test(sql));
check("grant requires exact delegation id", /staff_delegated_grant_permission_apply_v1\(\s*p_delegation_id uuid/.test(sql));
check("revoke requires exact delegation and source ids", /staff_delegated_revoke_permission_apply_v1\(\s*p_delegation_id uuid,\s*p_delegated_grant_id uuid/.test(sql));
check("delegation ownership is exact", /delegate_staff_account_id <> v_actor_staff_account_id/.test(sql));
check("delegation GLOBAL active and effective", /scope_kind <> 'global'[\s\S]*status <> 'active'[\s\S]*effective_from > v_database_now[\s\S]*v_database_now >= v_delegation\.effective_until/.test(sql));
check("grant checks can_grant", /or not v_delegation\.can_grant/.test(sql));
check("revoke checks can_revoke", /or not v_delegation\.can_revoke/.test(sql));
check("custom window checks can_set_temporary", /v_custom_window and not v_delegation\.can_set_temporary[\s\S]*custom_window_denied/.test(sql));
check("target row is locked before catalogue", sql.indexOf("lock_staff_delegation_target_policy_v1") < sql.indexOf("lock_staff_delegated_permission_source_v1(p_delegation_id)"));
check("target must be active", /v_target\.target_status <> 'active'/.test(sql));
check("self target is denied for grant and revoke", (sql.match(/self_target_denied/g) ?? []).length >= 2);
check("permission identity rejects wildcards", /strpos\(v_delegation\.permission_key, '\*'\)[\s\S]*strpos\(v_delegation\.permission_key, '%'\)/.test(sql));
check("catalogue requires CURRENT active", /permission_lifecycle_status <> 'active'[\s\S]*permission_readiness_status <> 'current'/.test(sql));
check("catalogue requires individual provisioning", /not v_target\.permission_individually_provisionable/.test(sql));
check("admin_context is a hard deny", /permission_key = 'admin_context\.read'/.test(sql));
check("management namespace is a hard deny", /permission_key like 'admin\.management\.%'/.test(sql));
check("privileged permissions are denied", /v_target\.permission_privileged_only/.test(sql));
check("temporary catalogue policy is required", /not v_target\.permission_temporary_grantable[\s\S]*temporary_permission_ineligible/.test(sql));
check("grant start is inside target window", /v_actual_effective_from < v_target\.target_effective_from/.test(sql));
check("grant end is inside target window", /target_effective_until is not null[\s\S]*v_actual_effective_until is null[\s\S]*v_actual_effective_until > v_target\.target_effective_until/.test(sql));
check("grant start is inside delegation window", /v_actual_effective_from < v_delegation\.effective_from/.test(sql));
check("grant end is inside delegation window", /v_delegation\.effective_until is not null[\s\S]*v_actual_effective_until is null[\s\S]*v_actual_effective_until > v_delegation\.effective_until/.test(sql));
check("standard window uses DB time and earliest finite end", /v_actual_effective_from := v_database_now[\s\S]*least\(v_target\.target_effective_until, v_delegation\.effective_until\)/.test(sql));
check("entitlement source is exact direct grant", /v_delegation\.permission_key, 'direct_grant', null,[\s\S]*'active'/.test(sql));
check("provenance binds entitlement delegation target permission actor", /v_entitlement\.entitlement_id, p_delegation_id, p_target_staff_account_id,[\s\S]*v_delegation\.permission_key, v_actor_auth_user_id, v_actor_staff_account_id/.test(sql));
check("same-source active grant is unique", /create unique index staff_delegated_permission_grants_active_source_key[\s\S]*delegation_id, target_staff_account_id, permission_key[\s\S]*where status = 'active'/.test(sql));
check("revoke targets exact provenance", /where delegated\.delegated_grant_id = p_delegated_grant_id[\s\S]*for update/.test(sql));
check("revoke locks exact linked entitlement", /where entitlement\.entitlement_id = v_grant\.entitlement_id[\s\S]*for update/.test(sql));
check("revoke cannot touch Bundle source", /v_entitlement\.source_type <> 'direct_grant'[\s\S]*source_bundle_assignment_id is not null/.test(sql));
check("provenance and entitlement revoke together", /update admin_internal\.staff_permission_entitlements[\s\S]*set status = 'revoked'[\s\S]*update admin_internal\.staff_delegated_permission_grants[\s\S]*set status = 'revoked'/.test(sql));
check("revoke has exact provenance CAS", /status_version <> p_expected_status_version[\s\S]*stale_state/.test(sql));
check("revoked entitlement is terminal", /staff_permission_entitlement_revoked_terminal/.test(sql) && /staff_permission_entitlements_revoked_terminal_v1/.test(sql));
check("revoked provenance is terminal", /staff_delegated_permission_grant_revoked_terminal/.test(sql));
check("no physical delete exists", !/delete from admin_internal\.(?:staff_permission_entitlements|staff_delegated_permission_grants)/i.test(sql));
check("no reactivation path exists", !/set status = 'active'/.test(sql));
check("shared receipt is reused", /insert into admin_internal\.staff_management_operation_receipts/.test(sql) && !/create table .*receipt/i.test(sql));
check("shared audit is reused", /insert into admin_internal\.staff_management_audit_log/.test(sql) && !/create table .*audit/i.test(sql));
check("request namespace is global per actor", /v_actor_auth_user_id::text \|\| ':' \|\| p_request_id::text/.test(sql));
check("exact replay returns stored result", /return v_prior\.result_payload/.test(sql));
check("changed request payload conflicts", /request_payload is distinct from v_request_payload[\s\S]*request_conflict/.test(sql));
check("delegation does not enter runtime resolver", !/staff_permission_delegations/.test(p2a));
check("delegation loss does not revoke issued entitlements", !/(?:update|delete from) admin_internal\.staff_permission_entitlements[\s\S]{0,300}staff_permission_delegations/i.test(p3c));
check("no route navigation or application change beyond exact P3E vocabulary", !changed.some((file) => /^(?:apps|packages|supabase\/functions)\//.test(file) && file !== VOCABULARY));
check("no service credential or Auth Admin runtime", !/SUPABASE_SERVICE_ROLE_KEY|auth\.admin|inviteUserByEmail/.test(sql));
check("secret scan is clean", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(allChangedText)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3d-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((x) => x.name), changedPaths: changed, migrationCount: migrations.length, applicationCurrentPermissions: current, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
