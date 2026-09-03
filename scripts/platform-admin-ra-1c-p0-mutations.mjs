#!/usr/bin/env node
import {readMigration,auditSql} from "./platform-admin-ra-1c-p0-contract.mjs";
const source=readMigration();
const mutants=[
 ["broaden permission",s=>s.replace("admin_restaurant_branch.status.write","admin.*")],
 ["wrong permission scope",s=>s.replace("(permission_key = 'admin_restaurant_branch.status.write' and permission_scope = 'platform')","(permission_key = 'admin_restaurant_branch.status.write' and permission_scope = 'self')")],
 ["leak write permission through v1 context",s=>s.replace("where permission.permission_key in ('admin_context.read', 'admin_audit.read');",";")],
 ["drop status version",s=>s.replace("add column status_version bigint not null default 0","add column ignored bigint")],
 ["allow negative version",s=>s.replace("status_version >= 0","status_version >= -1")],
 ["increment on unrelated updates",s=>s.replace("before update of status","before update")],
 ["remove append-only receipt",s=>s.replace("create table admin_internal.platform_admin_operation_receipts","create table admin_internal.removed_receipts")],
 ["unbound request key",s=>s.replace("unique (actor_auth_user_id, request_id)","unique (request_id)")],
 ["generic action",s=>s.replace("action = 'set_restaurant_branch_status'","length(action)>0")],
 ["generic result",s=>s.replace("result in ('applied', 'noop', 'rejected')","length(result)>0")],
 ["login writer",s=>s.replace("nologin noinherit nobypassrls","login inherit bypassrls")],
 ["grant full branch update",s=>s.replace("update (status)","update")],
 ["grant delete",s=>s.replace("grant select, insert on admin_internal.platform_admin_operation_receipts","grant select, insert, delete on admin_internal.platform_admin_operation_receipts")],
 ["caller actor parameter",s=>s.replace("create function admin_internal.lock_current_platform_admin_branch_status_actor_v1()","create function admin_internal.lock_current_platform_admin_branch_status_actor_v1(actor_auth_user_id uuid)")],
 ["remove membership row lock",s=>s.replace("for update of membership",";")],
 ["drop DB permission recheck",s=>s.replace("permission.permission_key = 'admin_restaurant_branch.status.write'","permission.permission_key = permission.permission_key")],
 ["generic preview target",s=>s.replace("p_restaurant_id text, p_branch_id text","filter jsonb")],
 ["generic mutation input",s=>s.replace("p_expected_version bigint","p_patch jsonb")],
 ["allow non-v4 idempotency key",s=>s.replace("or (get_byte(uuid_send(p_request_id), 6) >> 4) <> 4","")],
 ["unbound ID length",s=>s.replaceAll("pg_catalog.length(p_restaurant_id) not between 1 and 200","false")],
 ["unpaired reason",s=>s.replace("p_requested_status='inactive' and p_reason_code='operational_pause'","p_requested_status='inactive'")],
 ["remove idempotency serialization",s=>s.replace("pg_catalog.pg_advisory_xact_lock","pg_catalog.abs")],
 ["ignore replay payload",s=>s.replace("v_prior.expected_version","p_expected_version")],
 ["accept conflicting replay",s=>s.replace("'idempotency_conflict'","'ok'")],
 ["remove target row lock",s=>s.replace("where branch.id=p_branch_id for update","where branch.id=p_branch_id")],
 ["ignore restaurant parent",s=>s.replace("v_branch_restaurant_id <> p_restaurant_id","false")],
 ["permit archived state",s=>s.replace("v_before_status not in ('active','inactive')","false")],
 ["drop compare-and-swap",s=>s.replace("v_before_status <> p_expected_status or v_before_version <> p_expected_version","false")],
 ["mutate arbitrary columns",s=>s.replace("set status=p_requested_status","set name='mutated', status=p_requested_status")],
 ["audit before mutation",s=>s.replace("update public.restaurant_branches","insert into admin_internal.platform_admin_operation_receipts default values; update public.restaurant_branches")],
 ["leak receipt table",s=>s.replace("revoke all on admin_internal.platform_admin_operation_receipts from public, anon, authenticated, authenticator, service_role","grant select on admin_internal.platform_admin_operation_receipts to authenticated")],
 ["expose private helper",s=>s.replace("revoke all on function admin_internal.lock_current_platform_admin_branch_status_actor_v1() from public, anon, authenticated, authenticator, service_role","grant execute on function admin_internal.lock_current_platform_admin_branch_status_actor_v1() to authenticated")],
 ["grant mutation to service role",s=>s.replace("grant execute on function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) to authenticated;","grant execute on function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) to service_role;")],
 ["capture search path",s=>s.replaceAll("set search_path = '' set row_security = 'on'","set search_path = public set row_security = 'on'")],
 ["wrong function owner",s=>s.replace("alter function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) owner to platform_admin_branch_status_authority","alter function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) owner to postgres")],
 ["retain bootstrap membership",s=>s.replace("revoke platform_admin_branch_status_authority from postgres granted by postgres;","-- retained")],
 ["remove transaction",s=>s.replace("\nbegin;","\n-- no transaction")]
];
const results=mutants.map(([name,mutate])=>{const changed=mutate(source);return{name,pass:changed!==source&&auditSql(changed).length>0,violations:auditSql(changed)}});
results.forEach((x,i)=>console.log(`${x.pass?"PASS":"FAIL"} ${i+1} killed: ${x.name}`));const failures=results.filter(x=>!x.pass);
console.log(JSON.stringify({suite:"platform-admin-ra-1c-p0-mutations",total:results.length,killed:results.length-failures.length,survived:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
