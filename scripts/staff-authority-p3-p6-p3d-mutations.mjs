#!/usr/bin/env node
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql", "utf8");
const vocabulary = fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts", "utf8");
const mutants = [
  ["permission.write promoted CURRENT", () => /permission\.write'[\s\S]*set readiness_status = 'current'/.test(sql)],
  ["legacy Platform Admin bypass", () => /platform_admin|legacy.*bypass/i.test(sql)],
  ["management permission bypass", () => !/permission_key like 'admin\.management\.%'/.test(sql)],
  ["caller controls actor ID", () => /create function public\.staff_delegated_[\s\S]*p_actor/i.test(sql)],
  ["delegation ownership ignored", () => !/delegate_staff_account_id <> v_actor_staff_account_id/.test(sql)],
  ["delegation lifecycle ignored", () => !/v_delegation\.status <> 'active'/.test(sql)],
  ["can_grant ignored", () => !/not v_delegation\.can_grant/.test(sql)],
  ["can_revoke ignored", () => !/not v_delegation\.can_revoke/.test(sql)],
  ["can_set_temporary ignored", () => !/not v_delegation\.can_set_temporary/.test(sql)],
  ["self target allowed", () => (sql.match(/self_target_denied/g) ?? []).length < 2],
  ["suspended target allowed", () => !/target_status <> 'active'/.test(sql)],
  ["revoked target allowed", () => !/target_status <> 'active'/.test(sql)],
  ["admin_context allowed", () => !/permission_key = 'admin_context\.read'/.test(sql)],
  ["admin.management permission allowed", () => !/permission_key like 'admin\.management\.%'/.test(sql)],
  ["planned permission allowed", () => !/permission_readiness_status <> 'current'/.test(sql)],
  ["wildcard allowed", () => !/strpos\(v_delegation\.permission_key, '\*'\)/.test(sql)],
  ["target window containment removed", () => !/v_actual_effective_from < v_target\.target_effective_from/.test(sql)],
  ["delegation window containment removed", () => !/v_actual_effective_from < v_delegation\.effective_from/.test(sql)],
  ["entitlement source type wrong", () => !/'direct_grant', null/.test(sql)],
  ["Bundle assignment attached", () => /'direct_grant', (?!null)/.test(sql)],
  ["provenance table omitted", () => !/create table admin_internal\.staff_delegated_permission_grants/.test(sql)],
  ["revoke by target permission", () => !/delegated_grant_id = p_delegated_grant_id/.test(sql)],
  ["revoke unrelated Bundle source", () => !/source_type <> 'direct_grant'/.test(sql)],
  ["revoke unrelated direct source", () => !/entitlement_id = v_grant\.entitlement_id/.test(sql)],
  ["delegation revoke retroactively revokes entitlement", () => /staff_permission_delegations[\s\S]{0,300}update admin_internal\.staff_permission_entitlements/.test(sql)],
  ["revoked entitlement reactivated", () => /set status = 'active'/.test(sql)],
  ["physical delete", () => /delete from admin_internal\.(?:staff_permission_entitlements|staff_delegated_permission_grants)/i.test(sql)],
  ["duplicate receipt on replay", () => !/return v_prior\.result_payload/.test(sql)],
  ["duplicate audit on replay", () => !/return v_prior\.result_payload/.test(sql)],
  ["service_role execute", () => /grant execute[^;]*to service_role/i.test(sql)],
  ["anon execute", () => /grant execute[^;]*to anon/i.test(sql)],
  ["client entitlement mutation", () => /grant[^;]*(?:insert|update|delete)[^;]*staff_permission_entitlements[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql)],
  ["client provenance mutation", () => /grant[^;]*(?:insert|update|delete)[^;]*staff_delegated_permission_grants[^;]*to (?:anon|authenticated|authenticator|service_role)/i.test(sql)],
  ["application vocabulary gains sixth key", () => (vocabulary.match(/^  "/gm) ?? []).length !== 5]
];
const survivors = [];
for (const [name, survives] of mutants) {
  const live = survives(); console.log(`${live ? "FAIL" : "PASS"} ${name}`); if (live) survivors.push(name);
}
console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p3d-mutations", mutations: mutants.length, killed: mutants.length - survivors.length, survivors: survivors.length, survivorNames: survivors, repositoryFilesWritten: 0, databaseUsed: false, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = survivors.length ? 1 : 0;
