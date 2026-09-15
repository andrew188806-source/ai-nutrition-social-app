#!/usr/bin/env node
// P3B mutation gate. Mutants exist in memory only; repository files are never written.
import crypto from "node:crypto";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260914020000_staff_management_p3_p6_p3b_account_operator.sql", "utf8");
const app = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const p3a = fs.readFileSync("supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql", "utf8");
const route = fs.readFileSync("apps/admin-web/auth/admin-route-registry.ts", "utf8");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const base = { sql: migration, app, p3a, route };
const frozen = { p3a: digest(p3a), route: digest(route) };

function audit(state) {
  const s = state.sql;
  const actor = s.slice(s.indexOf("create function admin_internal.lock_current_staff_management_actor_v1"), s.indexOf("comment on function admin_internal.lock_current_staff_management_actor_v1"));
  const publicFunctions = ["link", "suspend", "reactivate", "revoke"];
  return /permission_key = 'admin\.management\.staff\.account\.write'[\s\S]*readiness_status = 'planned'/.test(s)
    && /set readiness_status = 'current'/.test(s)
    && (s.match(/set readiness_status\s*=\s*'current'/g) ?? []).length === 1
    && !/permission_key = 'admin\.management\.(?:read|permissions\.read|staff\.read|staff\.(?:bundle|permission|delegation|console_admission)\.write)'[\s\S]{0,300}set readiness_status = 'current'/.test(s)
    && ["admin_audit.read", "admin_context.read", "admin.management.staff.account.write", "admin_restaurant_branch.status.write"].every((x) => state.app.includes(`\"${x}\"`))
    && (state.app.match(/\"admin\.[^\"]+\"/g) ?? []).length === 4
    && digest(state.p3a) === frozen.p3a && digest(state.route) === frozen.route
    && publicFunctions.every((op) => new RegExp(`create function public\\.staff_management_${op}_staff_account_v1\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''[\\s\\S]*?set row_security = 'on'`).test(s))
    && (s.match(/create function public\.staff_management_[a-z_]+_v1\(/g) ?? []).length === 4
    && !/p_actor/i.test(s)
    && /staff_request_subject_v1\(\)/.test(s)
    && /'admin_context\.read', 'admin\.management\.staff\.account\.write'/.test(actor)
    && (actor.match(/'admin_context\.read', 'admin\.management\.staff\.account\.write'/g) ?? []).length === 4
    && /v_effective_count <> 2 or v_locked_effective_count <> 2/.test(actor)
    && !/if exists \(select 1 from admin_internal\.platform_admins\)/.test(s)
    && /source_type in \('direct_grant', 'migration_backfill'\)/.test(s)
    && /source_type = 'bundle_assignment'/.test(s)
    && /p_target_auth_user_id = v_actor_auth_user_id/.test(s)
    && /p_target_staff_account_id = v_actor_staff_account_id/.test(s)
    && /v_before_version <> p_expected_status_version/.test(s)
    && /v_before_status <> 'suspended'[\s\S]*v_database_now >= v_before_effective_until/.test(s)
    && /staff_account_revoked_terminal/.test(s)
    && !/delete from admin_internal\.staff_accounts/i.test(s)
    && (s.match(/insert into admin_internal\.staff_management_operation_receipts/g) ?? []).length === 1
    && (s.match(/insert into admin_internal\.staff_management_audit_log/g) ?? []).length === 1
    && !/create table .*receipt/i.test(s) && !/create table .*audit/i.test(s)
    && /return v_prior\.result_payload/.test(s)
    && /request_payload is distinct from v_request_payload[\s\S]*request_conflict/.test(s)
    && /v_actor_auth_user_id::text \|\| ':' \|\| p_request_id::text/.test(s)
    && /staff-account-link:/.test(s)
    && !/(?:insert into|update|delete from) admin_internal\.staff_permission_entitlements/i.test(s)
    && !/(?:insert into|update|delete from) admin_internal\.staff_bundle_/i.test(s)
    && !/(?:insert into|update|delete from) admin_internal\.(?:platform_admins|staff_platform_admin_compatibility_links)/i.test(s)
    && !/\) to authenticated, (?:service_role|anon);/i.test(s)
    && !/grant[^;]*on (?:table )?admin_internal\.staff_accounts to (?:authenticated|service_role|anon)/i.test(s)
    && /grant update \(status, status_version, updated_at\)/.test(s)
    && !/grant update \([^)]*(?:auth_user_id|effective_from|effective_until)/.test(s)
    && !/grant[^;]*(?:delete|truncate)[^;]*staff_accounts/i.test(s)
    && !/set effective_until=v_database_now/.test(s)
    && !/grant delete on admin_internal\.staff_management_audit_log/.test(s);
}

const mutants = [];
function mutate(name, field, find, replacement) {
  if (!base[field].includes(find)) throw new Error(`stale mutation anchor: ${name}`);
  mutants.push({ name, state: { ...base, [field]: base[field].replace(find, replacement) } });
}
mutate("account.write remains planned", "sql", "set readiness_status = 'current'", "set readiness_status = 'planned'");
mutate("another management key promoted current", "sql", "begin;", "begin;\nupdate admin_internal.staff_permission_catalog set readiness_status='current' where permission_key='admin.management.staff.bundle.write';");
mutate("application vocabulary left at three", "app", '  "admin.management.staff.account.write",\n', "");
mutate("manager permission auto granted", "sql", "commit;", "insert into admin_internal.staff_permission_entitlements select null;\ncommit;");
mutate("legacy Platform Admin auto escalated", "sql", "commit;", "insert into admin_internal.platform_admins select null;\ncommit;");
mutate("actor requires only account.write", "sql", "v_effective_count <> 2 or v_locked_effective_count <> 2", "v_effective_count <> 1 or v_locked_effective_count <> 1");
mutate("actor requires only admin context", "sql", "'admin_context.read', 'admin.management.staff.account.write'", "'admin_context.read', 'admin_context.read'");
mutate("legacy Platform Admin bypass", "sql", "v_actor := admin_internal.staff_request_subject_v1();", "if exists (select 1 from admin_internal.platform_admins) then return query select gen_random_uuid(),gen_random_uuid(); end if;\n  v_actor := admin_internal.staff_request_subject_v1();");
mutate("caller actor UUID accepted", "sql", "p_operation_kind text,", "p_actor uuid,\n  p_operation_kind text,");
mutate("self-target allowed", "sql", "if p_target_auth_user_id = v_actor_auth_user_id then", "if false then");
mutate("link creates admin context", "sql", "commit;", "insert into admin_internal.staff_permission_entitlements select null; -- admin_context.read\ncommit;");
mutate("link creates entitlement", "sql", "commit;", "insert into admin_internal.staff_permission_entitlements select null;\ncommit;");
mutate("link creates Bundle", "sql", "commit;", "insert into admin_internal.staff_bundle_assignments select null;\ncommit;");
mutate("link creates legacy membership", "sql", "commit;", "insert into admin_internal.staff_platform_admin_compatibility_links select null;\ncommit;");
mutate("suspend omits CAS", "sql", "elsif v_before_version <> p_expected_status_version then", "elsif false then");
mutate("revoked account can reactivate", "sql", "if v_before_status <> 'suspended'", "if v_before_status not in ('suspended','revoked')");
mutate("revoke deletes account", "sql", "update admin_internal.staff_accounts\n          set status = 'revoked'", "delete from admin_internal.staff_accounts where id=p_target_staff_account_id;\n          update admin_internal.staff_accounts\n          set status = 'revoked'");
mutate("operator updates effective window", "sql", "set status = 'suspended'", "set effective_until=v_database_now, status = 'suspended'");
mutate("replay mutates twice", "sql", "return v_prior.result_payload;", "v_prior.result_payload := null; -- replay falls through");
mutate("replay audits twice", "sql", "return v_prior.result_payload;", "insert into admin_internal.staff_management_audit_log select null; return v_prior.result_payload;");
mutate("separate receipt table", "sql", "begin;", "begin;\ncreate table admin_internal.account_receipt(id uuid);");
mutate("receipt namespace includes operation", "p3a", "unique (actor_auth_user_id, request_id)", "unique (actor_auth_user_id, request_id, operation_kind)");
mutate("request conflict ignored", "sql", "request_payload is distinct from v_request_payload", "request_payload is not distinct from v_request_payload");
mutate("service_role execute granted", "sql", ") to authenticated;", ") to authenticated, service_role;");
mutate("anon execute granted", "sql", ") to authenticated;", ") to authenticated, anon;");
mutate("authenticated direct account update", "sql", "commit;", "grant update on admin_internal.staff_accounts to authenticated;\ncommit;");
mutate("writer updates auth identity", "sql", "grant update (status, status_version, updated_at)", "grant update (status, status_version, updated_at, auth_user_id)");
mutate("writer updates effective window", "sql", "grant update (status, status_version, updated_at)", "grant update (status, status_version, updated_at, effective_until)");
mutate("history delete granted", "sql", "grant select (id, auth_user_id", "grant delete on admin_internal.staff_management_audit_log to staff_account_write_authority;\ngrant select (id, auth_user_id");

const results = mutants.map(({ name, state }) => ({ name, killed: !audit(state) }));
const survivors = results.filter((x) => !x.killed);
for (const result of results) console.log(`${result.killed ? "PASS" : "FAIL"} ${result.name}`);
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3b-mutations", mutations: results.length, killed: results.length - survivors.length, survivors: survivors.length, survivorNames: survivors.map((x) => x.name), repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
