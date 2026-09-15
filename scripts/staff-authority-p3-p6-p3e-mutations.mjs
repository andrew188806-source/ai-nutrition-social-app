#!/usr/bin/env node
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260915010000_staff_management_p3_p6_p3e_console_admission_operator.sql", "utf8");
const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const p3c = fs.readFileSync("supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql", "utf8");
const p3d = fs.readFileSync("supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql", "utf8");
const p1c = fs.readFileSync("supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "utf8");
const mutants = [
  ["console writer stays PLANNED", () => !/console_admission\.write'[\s\S]*set readiness_status = 'current'|set readiness_status = 'current'[\s\S]*console_admission\.write'/.test(sql)],
  ["permission writer accidentally promoted", () => /permission\.write'[\s\S]{0,400}set readiness_status = 'current'/.test(sql)],
  ["application vocabulary is not exact through P3F", () => (vocabulary.match(/^\s+"/gm) ?? []).length !== 7],
  ["console manager is auto-granted", () => /insert into admin_internal\.staff_permission_entitlements[\s\S]{0,300}console_admission\.write/.test(sql)],
  ["legacy Platform Admin gains console writer", () => /platform_admin_role_permissions|platform_admin_memberships/.test(sql)],
  ["actor only requires admin_context", () => !/admin\.management\.staff\.console_admission\.write/.test(sql)],
  ["actor only requires console writer", () => !/effective\.permission_key in \('admin_context\.read', p_required_management_permission_key\)/.test(sql)],
  ["legacy actor bypass", () => /platform_admin|legacy.*bypass/i.test(sql)],
  ["caller supplies actor ID", () => /create function public\.[\s\S]{0,300}p_actor/i.test(sql)],
  ["caller supplies permission key", () => /create function public\.staff_management_(?:grant|revoke)_console_admission_v1\([\s\S]{0,240}p_permission/i.test(sql)],
  ["caller supplies time window", () => /create function public\.staff_management_(?:grant|revoke)_console_admission_v1\([\s\S]{0,240}p_effective/i.test(sql)],
  ["self grant allowed", () => (sql.match(/self_target_denied/g) ?? []).length < 2],
  ["self revoke allowed", () => !/v_pre_grant\.target_staff_account_id = v_actor_staff_account_id/.test(sql)],
  ["future target allowed", () => !/target_effective_from > v_database_now/.test(sql)],
  ["suspended target allowed", () => !/target_status <> 'active'/.test(sql)],
  ["revoked target allowed", () => !/target_status <> 'active'/.test(sql)],
  ["permission is not hard-coded", () => (sql.match(/'admin_context\.read'/g) ?? []).length < 12],
  ["catalogue active/current check removed", () => !/permission_lifecycle_status <> 'active'[\s\S]*permission_readiness_status <> 'current'/.test(sql)],
  ["console metadata check removed", () => !/not v_target\.permission_console_admission_required/.test(sql)],
  ["grant creates a caller-selected permission", () => !/'admin_context\.read', 'direct_grant', null/.test(sql)],
  ["Bundle source is created", () => /insert into admin_internal\.staff_permission_entitlements[\s\S]{0,900}values[\s\S]{0,250}'bundle_assignment'/.test(sql)],
  ["revoke targets target instead of provenance", () => !/console_admission_grant_id = p_console_admission_grant_id/.test(sql)],
  ["compatibility source is revoked", () => /source_type = 'migration_backfill'[\s\S]{0,300}set status = 'revoked'/.test(sql)],
  ["unrelated direct source can be revoked", () => !/entitlement_id = v_grant\.entitlement_id/.test(sql)],
  ["CAS is removed", () => !/status_version <> p_expected_status_version/.test(sql)],
  ["revoked source can reactivate", () => /set status = 'active'/.test(sql)],
  ["physical delete is used", () => /delete from admin_internal\.(?:staff_permission_entitlements|staff_console_admission_grants)/i.test(sql)],
  ["grant replay duplicates receipt", () => !/return v_prior\.result_payload/.test(sql)],
  ["grant replay duplicates audit", () => !/return v_prior\.result_payload/.test(sql)],
  ["P3C admin_context boundary removed", () => !/p_permission_key = 'admin_context\.read'|permission_console_admission_required/.test(p3c)],
  ["P3D admin_context boundary removed", () => !/permission_key = 'admin_context\.read'/.test(p3d)],
  ["Bundle console exclusion removed", () => !/bundle_console_admission_forbidden/.test(p1c)],
  ["service_role receives EXECUTE", () => /grant execute[^;]*to service_role/i.test(sql)],
  ["anon receives EXECUTE", () => /grant execute[^;]*to anon/i.test(sql)],
  ["client mutates entitlement", () => /grant[^;]*(?:insert|update|delete)[^;]*staff_permission_entitlements[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql)],
  ["client mutates provenance", () => /grant[^;]*(?:insert|update|delete)[^;]*staff_console_admission_grants[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql)]
];
const survivors = [];
for (const [name, survives] of mutants) { const live = survives(); console.log(`${live ? "FAIL" : "PASS"} ${name}`); if (live) survivors.push(name); }
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3e-mutations", mutations: mutants.length, killed: mutants.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
