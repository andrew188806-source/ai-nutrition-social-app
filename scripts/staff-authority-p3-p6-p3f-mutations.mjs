#!/usr/bin/env node
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260915020000_staff_management_p3_p6_p3f_privileged_permission_operator.sql", "utf8");
const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const p3e = fs.readFileSync("supabase/migrations/20260915010000_staff_management_p3_p6_p3e_console_admission_operator.sql", "utf8");
const p3d = fs.readFileSync("supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql", "utf8");
const mutants = [
  ["permission.write remains PLANNED", () => !/set readiness_status = 'current'[\s\S]*permission\.write'/.test(sql)],
  ["wrong management permission promoted", () => (sql.match(/set readiness_status = 'current'/g) ?? []).length !== 1],
  ["application vocabulary remains six", () => (vocabulary.match(/^\s+"/gm) ?? []).length !== 7],
  ["permission manager is auto-seeded", () => (sql.match(/insert into admin_internal\.staff_permission_entitlements/g) ?? []).length !== 1],
  ["legacy Platform Admin gains permission.write", () => /platform_admin_role_permissions|platform_admin_memberships/.test(sql)],
  ["actor only requires admin_context", () => !/admin\.management\.staff\.permission\.write/.test(sql)],
  ["actor only requires permission.write", () => !/effective\.permission_key in \('admin_context\.read', p_required_management_permission_key\)/.test(sql)],
  ["legacy actor bypass", () => /platform_admin|legacy.*bypass/i.test(sql)],
  ["caller actor is accepted", () => /create function public\.[\s\S]{0,300}p_actor/i.test(sql)],
  ["self-target grant is accepted", () => (sql.match(/self_target_denied/g) ?? []).length < 2],
  ["self-target revoke is accepted", () => !/v_pre_grant\.target_staff_account_id = v_actor_staff_account_id/.test(sql)],
  ["future target is accepted", () => !/target_effective_from > v_database_now/.test(sql)],
  ["suspended target is accepted", () => !/target_status <> 'active'/.test(sql)],
  ["revoked target is accepted", () => !/target_status <> 'active'/.test(sql)],
  ["admin_context is accepted", () => (sql.match(/(?:p_permission_key|v_pre_grant\.permission_key) = 'admin_context\.read'/g) ?? []).length < 2],
  ["ordinary branch permission is accepted", () => !/permission_ordinary_supervisor_delegable/.test(sql)],
  ["PLANNED permission is accepted", () => !/permission_readiness_status <> 'current'/.test(sql)],
  ["wildcard is accepted", () => !/strpos\(p_permission_key, '\*'\)/.test(sql)],
  ["privileged_only check is removed", () => !/not v_target\.permission_privileged_only/.test(sql)],
  ["ordinary delegation check is removed", () => !/v_target\.permission_ordinary_supervisor_delegable/.test(sql)],
  ["console admission check is removed", () => !/v_target\.permission_console_admission_required/.test(sql)],
  ["custom time ignores temporary_grantable", () => !/v_custom_window and not v_target\.permission_temporary_grantable/.test(sql)],
  ["target window containment is removed", () => !/v_actual_effective_until > v_target\.target_effective_until/.test(sql)],
  ["entitlement source type is wrong", () => !/p_permission_key, 'direct_grant', null/.test(sql)],
  ["P3F provenance is omitted", () => !/insert into admin_internal\.staff_privileged_permission_grants/.test(sql)],
  ["revoke uses target and permission instead of provenance", () => !/privileged_permission_grant_id = p_privileged_permission_grant_id/.test(sql)],
  ["unrelated direct source is revocable", () => !/entitlement_id = v_grant\.entitlement_id/.test(sql)],
  ["P3D source can be revoked", () => /staff_delegated_permission_grants[\s\S]{0,200}(?:update|delete)/i.test(sql)],
  ["P3E source can be revoked", () => /staff_console_admission_grants[\s\S]{0,200}(?:update|delete)/i.test(sql)],
  ["compatibility source can be revoked", () => /source_type = 'migration_backfill'[\s\S]{0,300}set status = 'revoked'/.test(sql)],
  ["CAS is removed", () => !/status_version <> p_expected_status_version/.test(sql)],
  ["revoked source can reactivate", () => /set status = 'active'/.test(sql)],
  ["physical delete is used", () => /delete from admin_internal\.(?:staff_permission_entitlements|staff_privileged_permission_grants)/i.test(sql)],
  ["grant replay duplicates receipt", () => !/return v_prior\.result_payload/.test(sql)],
  ["grant replay duplicates audit", () => !/return v_prior\.result_payload/.test(sql)],
  ["service_role receives EXECUTE", () => /grant execute[^;]*to service_role/i.test(sql)],
  ["anon receives EXECUTE", () => /grant execute[^;]*to anon/i.test(sql)],
  ["client mutates entitlement", () => /grant[^;]*(?:insert|update|delete)[^;]*staff_permission_entitlements[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql)],
  ["client mutates provenance", () => /grant[^;]*(?:insert|update|delete)[^;]*staff_privileged_permission_grants[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql)],
  ["P3E no longer owns console lane", () => !/'admin_context\.read'/.test(p3e)],
  ["P3D no longer rejects privileged permission", () => !/permission_privileged_only/.test(p3d)]
];
const survivors = [];
for (const [name, survives] of mutants) { const live = survives(); console.log(`${live ? "FAIL" : "PASS"} ${name}`); if (live) survivors.push(name); }
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3f-mutations", mutations: mutants.length, killed: mutants.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
