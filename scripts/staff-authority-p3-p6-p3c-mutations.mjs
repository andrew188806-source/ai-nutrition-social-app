#!/usr/bin/env node
import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql","utf8");
const vocabulary=fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts","utf8");
const mutants=[
 ["delegation.write stays planned",()=>!/set readiness_status = 'current'/.test(sql)],
 ["wrong permission promoted",()=>!/permission_key = 'admin\.management\.staff\.delegation\.write'/.test(sql)],
 ["app vocabulary remains four",()=>!vocabulary.includes('"admin.management.staff.delegation.write"')],
 ["legacy Platform Admin auto gets delegation.write",()=>/platform_admin[\s\S]*delegation\.write/i.test(sql)],
 ["account manager auto gets delegation authority",()=>/staff_management_apply_delegation_operation_v1[\s\S]*lock_current_staff_management_actor_v1\(\s*'admin\.management\.staff\.account\.write'/.test(sql)],
 ["actor only needs context",()=>!/v_effective_count <> 2/.test(sql)],
 ["actor only needs delegation.write",()=>!/admin_context\.read/.test(sql)],
 ["legacy bypass",()=>/legacy.*bypass|platform_admin.*exists/i.test(sql)],
 ["delegation row authorizes management",()=>/staff_permission_delegations[\s\S]*v_effective_count/.test(sql)],
 ["caller actor accepted",()=>/p_actor/.test(sql)],
 ["self target accepted",()=>!/self_target_denied/.test(sql)],
 ["suspended target accepted",()=>!/target_status <> 'active'/.test(sql)],
 ["revoked target accepted",()=>!/target_status <> 'active'/.test(sql)],
 ["planned permission delegable",()=>!/permission_readiness_status <> 'current'/.test(sql)],
 ["admin_context delegable",()=>!/p_permission_key = 'admin_context\.read'/.test(sql)],
 ["management permission delegable",()=>!/p_permission_key like 'admin\.management\.%'/.test(sql)],
 ["wildcard accepted",()=>!/strpos\(p_permission_key, '\*'\)/.test(sql)],
 ["arbitrary scope accepted",()=>/p_scope/.test(sql)],
 ["window containment removed",()=>!/window_outside_target/.test(sql)],
 ["temporary policy ignored",()=>!/permission_temporary_grantable/.test(sql)],
 ["delegation becomes runtime permission",()=>/create or replace function admin_internal\.staff_effective_permissions/.test(sql)],
 ["grant creates entitlement",()=>/insert into admin_internal\.staff_permission_entitlements/.test(sql)],
 ["revoke removes operational entitlement",()=>/delete from admin_internal\.staff_permission_entitlements/.test(sql)],
 ["revoke without CAS",()=>!/status_version <> p_expected_status_version/.test(sql)],
 ["revoked row reactivated",()=>/set status = 'active'/.test(sql)],
 ["physical delete",()=>/delete from admin_internal\.staff_permission_delegations/.test(sql)],
 ["duplicate receipt audit",()=>!/return v_prior\.result_payload/.test(sql)],
 ["service role execute",()=>/grant execute[^;]*to service_role/i.test(sql)],
 ["anon execute",()=>/grant execute[\s\S]*to anon/.test(sql)]
];
const survivors=[];for(const [name,survives] of mutants){const live=survives();console.log(`${live?"FAIL":"PASS"} ${name}`);if(live)survivors.push(name)}
console.log("\n"+JSON.stringify({suite:"staff-authority-p3-p6-p3c-mutations",mutations:mutants.length,killed:mutants.length-survivors.length,survivors:survivors.length,survivorNames:survivors,repositoryFilesWritten:0,databaseUsed:false,developmentAccessed:false,productionAccessed:false},null,2));process.exitCode=survivors.length?1:0;
