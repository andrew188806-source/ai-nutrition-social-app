#!/usr/bin/env node
// P2D-B0-A mutation gate. Every mutant is in memory; repository files are never written.
import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n");
const original={
  sql:read("supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql"),
  selector:read("apps/admin-web/auth/admin-protected-read-authority.ts"),
  audit:read("apps/admin-web/server/staffAdminAuditRead.ts"), auditTransport:read("apps/admin-web/server/staffAdminAuditTransport.ts"),
  auditRuntime:read("apps/admin-web/server/platformAdminAuditRuntime.ts"),
  branch:read("apps/admin-web/server/staffAdminBranchStatusRead.ts"), branchTransport:read("apps/admin-web/server/staffAdminBranchStatusTransport.ts"),
  branchRuntime:read("apps/admin-web/server/platformAdminBranchStatusRuntime.ts"),
  vocabulary:read("apps/admin-web/auth/admin-current-permission-vocabulary.ts"),
  context:read("apps/admin-web/auth/admin-context.ts"), extraLegacyRewrite:false
};
function audit(s){
  const bare=s.sql.replace(/^\s*--.*$/gm,"");
  const auditRpc=bare.slice(bare.indexOf("create function public.staff_admin_audit_log_v1"),bare.indexOf("create function public.staff_admin_restaurant_branch_status_v1"));
  const branchRpc=bare.slice(bare.indexOf("create function public.staff_admin_restaurant_branch_status_v1"),bare.indexOf("-- Settle every function ACL"));
  const post=s.branchRuntime.slice(s.branchRuntime.indexOf("handlePlatformAdminBranchStatusMutationRequest"));
  return !s.extraLegacyRewrite
    && !/create\s+(?:or replace\s+)?function\s+(?:public\.platform_admin_|admin_internal\.(?:lock_current_platform|grant_platform|revoke_platform))/i.test(bare)
    && /staff_has_permission_v1\('admin_context\.read'\)/.test(auditRpc)
    && /staff_has_permission_v1\('admin_audit\.read'\)/.test(auditRpc)
    && !/platform_admin_has_permission/.test(auditRpc+branchRpc)
    && /lock_current_staff_branch_status_actor_v1\(\)/.test(branchRpc)
    && /'admin_context\.read'/.test(bare.slice(bare.indexOf("lock_current_staff_branch_status_actor_v1"),bare.indexOf("create function public.staff_admin_audit_log_v1")))
    && /'admin_restaurant_branch\.status\.write'/.test(bare.slice(bare.indexOf("lock_current_staff_branch_status_actor_v1"),bare.indexOf("create function public.staff_admin_audit_log_v1")))
    && !/role_key|bundle_key\s*=|source_type\s*=\s*'migration_backfill'/.test(auditRpc+branchRpc)
    && /staff_request_subject_v1\(\)/.test(bare) && !/lock_current_staff_branch_status_actor_v1\([^)]*(?:uuid|text)/.test(bare)
    && /revoke all on function public\.staff_admin_audit_log_v1\(integer\)[\s\S]*from public, anon, authenticated, authenticator, service_role;/.test(bare)
    && /revoke all on function public\.staff_admin_restaurant_branch_status_v1\(text, text\)[\s\S]*from public, anon, authenticated, authenticator, service_role;/.test(bare)
    && /grant execute on function public\.staff_admin_audit_log_v1\(integer\)\s+to authenticated;/.test(bare)
    && /grant execute on function public\.staff_admin_restaurant_branch_status_v1\(text, text\)\s+to authenticated;/.test(bare)
    && !/grant execute[^;]*(?:anon|service_role)/i.test(bare)
    && !/grant select[^;]*to\s+(?:anon|authenticated|authenticator|service_role)/i.test(bare)
    && !/grant update|grant insert[^;]*operation_receipts/i.test(bare)
    && !/staff_admin_set_restaurant_branch_status|staff_admin_[a-z_]*mutation/i.test(bare+s.audit+s.branch+s.auditTransport+s.branchTransport+s.auditRuntime+s.branchRuntime)
    && /credentialMode === "bearer"[\s\S]*authority: "legacy"/.test(s.selector)
    && s.selector.indexOf('credentialMode === "bearer"') < s.selector.indexOf("resolveAdminAuthorityMode(env)")
    && /mode\.mode === "staff_permissions_legacy_admission" \? "staff" as const : "legacy"/.test(s.selector)
    && /readAuthority\.authority === "staff" \? readStaffAdminAudit : readPlatformAdminAudit/.test(s.auditRuntime)
    && /readAuthority\.authority === "staff"[\s\S]*readStaffAdminBranchStatus[\s\S]*readPlatformAdminBranchStatus/.test(s.branchRuntime)
    && !/catch[\s\S]{0,180}readPlatformAdminAudit/.test(s.auditRuntime)
    && !/catch[\s\S]{0,180}readPlatformAdminBranchStatus/.test(s.branchRuntime)
    && /resolveAuditAuthority\(await transport\.readContext\(\)\)/.test(s.audit)
    && (s.audit.match(/transport\.readContext\(\)/g)??[]).length===2
    && (s.branch.match(/transport\.readContext\(\)/g)??[]).length===2
    && /acceptsAdminApiCookieMutationOrigin\(request\)/.test(post)
    && /mutatePlatformAdminBranchStatus\(/.test(post) && !/readStaffAdmin|staff_admin_/.test(post)
    && !/console\.|Authorization[^\n]*url|token[^\n]*response/i.test(s.auditTransport+s.branchTransport)
    && s.vocabulary===original.vocabulary && /authority\.context\.state !== "admin"/.test(s.context);
}
const mutants=[];
function mutate(name,key,anchor,replacement){if(!original[key].includes(anchor))throw new Error(`stale anchor: ${name}`);mutants.push({name,state:{...original,[key]:original[key].replace(anchor,replacement)}});}
mutants.push({name:"rewrite legacy Audit RPC",state:{...original,extraLegacyRewrite:true}});
mutants.push({name:"rewrite legacy Branch preview RPC",state:{...original,extraLegacyRewrite:true}});
mutants.push({name:"rewrite legacy Branch mutation RPC",state:{...original,extraLegacyRewrite:true}});
mutate("use legacy permission in staff Audit","sql","public.staff_has_permission_v1('admin_audit.read')","public.platform_admin_has_permission_v1('admin_audit.read')");
mutate("use legacy permission in staff Branch","sql","admin_internal.lock_current_staff_branch_status_actor_v1() is null","public.platform_admin_has_permission_v1('admin_restaurant_branch.status.write') is false");
mutate("omit base in Audit","sql","public.staff_has_permission_v1('admin_context.read')","true");
mutate("omit base in Branch","sql","      'admin_context.read',\n      'admin_restaurant_branch.status.write'","      'admin_restaurant_branch.status.write'");
mutate("authorize by role key","sql","v_actor := admin_internal.staff_request_subject_v1();","if current_setting('request.jwt.claim.role',true)='platform_admin' then return gen_random_uuid(); end if; v_actor := admin_internal.staff_request_subject_v1();");
mutate("authorize by Bundle name","sql","v_actor := admin_internal.staff_request_subject_v1();","if 'platform_admin' = (select bundle_key from admin_internal.staff_bundle_assignments limit 1) then return gen_random_uuid(); end if; v_actor := admin_internal.staff_request_subject_v1();");
mutate("require migration_backfill only","sql","entitlement.source_type in ('direct_grant', 'migration_backfill')","entitlement.source_type = 'migration_backfill'");
mutate("accept caller subject","sql","lock_current_staff_branch_status_actor_v1()","lock_current_staff_branch_status_actor_v1(p_subject uuid)");
mutate("grant anon execute","sql","grant execute on function public.staff_admin_audit_log_v1(integer)\n  to authenticated;","grant execute on function public.staff_admin_audit_log_v1(integer) to anon;");
mutate("grant service role execute","sql","grant execute on function public.staff_admin_audit_log_v1(integer)\n  to authenticated;","grant execute on function public.staff_admin_audit_log_v1(integer) to service_role;");
mutate("grant client staff table SELECT","sql","grant select (id, actor_auth_user_id","grant select on admin_internal.staff_accounts to authenticated;\ngrant select (id, actor_auth_user_id");
mutate("grant Branch reader UPDATE","sql","grant select (id, restaurant_id, name, status, status_version)","grant update(status) on public.restaurant_branches to staff_admin_branch_status_reader;\ngrant select (id, restaurant_id, name, status, status_version)");
mutate("grant Branch reader receipt INSERT","sql","grant select (id, restaurant_id, name, status, status_version)","grant insert on admin_internal.platform_admin_operation_receipts to staff_admin_branch_status_reader;\ngrant select (id, restaurant_id, name, status, status_version)");
mutate("create staff mutation RPC prematurely","sql","commit;","create function public.staff_admin_set_restaurant_branch_status_v1() returns void language sql as $$ select $$;\ncommit;");
mutate("select staff reads for bearer","selector",'authority: "legacy" as const','authority: "staff" as const');
mutate("consult selector for bearer","selector",'if (credentialMode === "bearer") {','resolveAdminAuthorityMode(env);\n  if (credentialMode === "bearer") {');
mutate("fallback Audit failure to legacy","auditRuntime","result = { state: \"unavailable\" };","result = await readPlatformAdminAudit(authorization.authorization, new URL(request.url).searchParams, getPlatformAdminAuditConfig(env), fetchImpl);");
mutate("fallback Branch failure to legacy","branchRuntime","return json({ state: \"dependency_unavailable\" });","return json(await readPlatformAdminBranchStatus(authorization.authorization, query.get('restaurantId'), branchId, getPlatformAdminBranchStatusConfig(env), fetchImpl));");
mutate("select legacy Audit in staff cookie","auditRuntime","readStaffAdminAudit : readPlatformAdminAudit","readPlatformAdminAudit : readPlatformAdminAudit");
mutate("select legacy Branch GET in staff cookie","branchRuntime","? readStaffAdminBranchStatus","? readPlatformAdminBranchStatus");
mutate("select staff Branch POST","branchRuntime","mutatePlatformAdminBranchStatus(\n    authorization.authorization","readStaffAdminBranchStatus(\n    authorization.authorization");
mutate("weaken CSRF","branchRuntime","!acceptsAdminApiCookieMutationOrigin(request)","false && !acceptsAdminApiCookieMutationOrigin(request)");
mutate("alter Audit response mapping","auditRuntime","forbidden: 403","forbidden: 200");
mutate("log bearer secret","auditTransport","return {","console.log(authorization);\n  return {");
mutate("modify permission vocabulary","vocabulary",'"admin_restaurant_branch.status.write"','"admin_restaurant_branch.status.write", "admin.future.read"');
mutate("allow staff-only application admission","context",'authority.context.state !== "admin"','authority.context.state === "unauthenticated"');
const results=mutants.map(({name,state})=>({name,killed:!audit(state)})),survivors=results.filter(x=>!x.killed).map(x=>x.name);
for(const r of results)console.log(`${r.killed?"PASS":"FAIL"} ${r.name}`);
console.log("\n"+JSON.stringify({suite:"staff-authority-p3-p6-p2d-b0-a-mutations",mutations:results.length,killed:results.length-survivors.length,survivors:survivors.length,survivorNames:survivors,repositoryFilesWritten:0,databaseUsed:false,developmentAccessed:false,productionAccessed:false},null,2));
process.exitCode=survivors.length?1:0;
