#!/usr/bin/env node
// Two disposable PostgreSQL 17 passes. No remote database is addressed.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import child from "node:child_process";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const CANDIDATE = "20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql";
const SUITE = "staff-authority-p3-p6-p3h-postgres";
const PG_BIN = (process.env.P3H_PG_BIN ?? "/tmp/p3g-pg/usr/lib/postgresql/17/bin").trim();
const PG_LIB = (process.env.P3H_PG_LIB ?? "/tmp/p3g-pg/usr/lib/x86_64-linux-gnu").trim();
if (!fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "PostgreSQL 17 binaries unavailable; set P3H_PG_BIN and P3H_PG_LIB" }, null, 2));
  process.exit(0);
}
const { Client } = createRequire(path.join(ROOT, "package.json"))("pg");
const PG_ENV = { ...process.env, LD_LIBRARY_PATH: [PG_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") };
const exe = (name) => path.join(PG_BIN, name);
const bootstrapText = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapText.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapText.indexOf("\n`;", bootstrapStart);
if (bootstrapStart < "const BOOTSTRAP = `".length || bootstrapEnd < bootstrapStart) throw new Error("frozen PostgreSQL bootstrap unavailable");
const BOOTSTRAP = bootstrapText.slice(bootstrapStart, bootstrapEnd);
const files = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
const checks = []; const failures = []; const matrix = {};
function check(pass, name, detail) { const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0,1200)}`); }
function run(name, args, options = {}) { const result = child.spawnSync(exe(name), args, { encoding: "utf8", env: PG_ENV, ...options }); if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout}`); return result.stdout; }
function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); server.on("error", reject); }); }
async function cluster(label) { const base = fs.mkdtempSync(path.join(os.tmpdir(), `p3h-${label}-`)); const data = path.join(base,"data"), socket = path.join(base,"socket"), log = path.join(base,"postgres.log"); const port = await freePort(); fs.mkdirSync(socket); run("initdb", ["-D",data,"-U","supabase_admin","--encoding=UTF8","--locale=C","-A","trust"]); run("pg_ctl", ["-D",data,"-l",log,"-o",`-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socket} -c fsync=off -c full_page_writes=off -c synchronous_commit=off`,"start"]); let stopped=false; return { base, port, async client(user="supabase_admin") { const c = new Client({ host:"127.0.0.1",port,user,database:"postgres" }); c.on("error",()=>{}); await c.connect(); return c; }, stop() { if(stopped)return; stopped=true; try{run("pg_ctl",["-D",data,"stop","-m","fast"]);}catch{} fs.rmSync(base,{recursive:true,force:true}); } }; }
async function bootstrap(handle) { const owner = await handle.client(); await owner.query(BOOTSTRAP); await owner.query("create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;"); return owner; }
async function apply(client, names) { let count=0; for (const name of names) { try { await client.query(fs.readFileSync(path.join(MIGRATIONS,name),"utf8")); count+=1; } catch(error) { check(false,`migration applies: ${name}`,{code:error.code,position:error.position,message:error.message}); throw error; } } return count; }
async function failure(work) { try { await work(); return null; } catch(error) { return { code:error.code,message:error.message }; } }
const uuid = (()=>{let n=1;return()=>`00000000-0000-4000-8000-${String(n++).padStart(12,"0")}`;})();
async function asActor(handle, actor, session, aal, sql, params=[]) { const c=await handle.client(); try { await c.query("begin"); await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:session,aal})]); await c.query("set local role authenticated"); const out=await c.query(sql,params); await c.query("commit"); return out.rows; } catch(error){try{await c.query("rollback");}catch{} throw error;} finally{await c.end();} }
async function issue(broker, actor, session, proof, factor, requestId=uuid()) { return (await broker.query("select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)",[actor,session,proof,factor,new Date().toISOString(),requestId])).rows[0]; }
async function readStepUpData(client, sql, params=[]) { await client.query("grant staff_step_up_receipt_data_authority to postgres with admin false,inherit false,set true"); try { await client.query("set role staff_step_up_receipt_data_authority"); return await client.query(sql,params); } finally { await client.query("reset role"); await client.query("revoke staff_step_up_receipt_data_authority from postgres"); } }

let passA, passB;
try {
  passA = await cluster("pass-a"); const ownerA = await bootstrap(passA); const a = await passA.client("postgres");
  const predecessor = files.filter((name)=>name!==CANDIDATE);
  check(await apply(a,predecessor)===124 && files.length===125 && files.at(-1)===CANDIDATE,"A exact 124 predecessors and P3H migration 125",{total:files.length,latest:files.at(-1)});
  const p3gBefore=(await a.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='admin_internal' and p.proname like 'staff_break_glass_%' order by 1")).rows;
  await apply(a,[CANDIDATE]);
  const p3gAfter=(await a.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='admin_internal' and p.proname like 'staff_break_glass_%' order by 1")).rows;
  check(JSON.stringify(p3gBefore)===JSON.stringify(p3gAfter),"A P3G function definitions unchanged");
  const current=(await ownerA.query("select permission_key from admin_internal.staff_permission_catalog where lifecycle_status='active' and readiness_status='current' order by permission_key")).rows.map((r)=>r.permission_key);
  check(JSON.stringify(current)===JSON.stringify(["admin.management.staff.account.write","admin.management.staff.console_admission.write","admin.management.staff.delegation.write","admin.management.staff.permission.write","admin_audit.read","admin_context.read","admin_restaurant_branch.status.write"]),"A CURRENT permission vocabulary exact seven",current);
  const roles=(await a.query("select rolname,rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles where rolname like 'staff_step_up_%' order by rolname")).rows;
  check(roles.length===3 && roles.every((r)=>!r.rolcanlogin&&!r.rolinherit&&!r.rolbypassrls&&!r.rolsuper),"A all P3H roles sealed",roles);
  const brokerSeeds=(await a.query("select rolname from pg_roles where rolcanlogin and rolname like '%step_up%'")).rows;
  check(brokerSeeds.length===0,"A zero broker LOGIN seed",brokerSeeds);
  const tables=(await a.query("select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_internal' and relname in ('staff_step_up_receipts','staff_step_up_receipt_uses','staff_security_notification_outbox') order by relname")).rows;
  check(tables.length===3 && tables.every((r)=>r.relrowsecurity&&r.relforcerowsecurity),"A all P3H tables enable and force RLS",tables);
  const seed=(await readStepUpData(a,"select (select count(*) from admin_internal.staff_step_up_receipts)::int receipts,(select count(*) from admin_internal.staff_step_up_receipt_uses)::int uses,(select count(*) from admin_internal.staff_security_notification_outbox)::int outbox")).rows[0];
  check(Object.values(seed).every((v)=>v===0),"A zero receipt/evidence seed",seed);
  const v1Acl=(await a.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('staff_management_link_staff_account_v1','staff_management_suspend_staff_account_v1','staff_management_reactivate_staff_account_v1','staff_management_revoke_staff_account_v1','staff_management_grant_permission_delegation_v1','staff_management_revoke_permission_delegation_v1','staff_management_grant_console_admission_v1','staff_management_revoke_console_admission_v1','staff_management_grant_privileged_permission_v1','staff_management_revoke_privileged_permission_v1') and has_function_privilege('authenticated',p.oid,'EXECUTE')")).rows[0].n;
  const v2Acl=(await a.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'staff_management_%_v2' and has_function_privilege('authenticated',p.oid,'EXECUTE')")).rows[0].n;
  check(v1Acl===0 && v2Acl===10,"A protected v1 closed and exact ten v2 callable",{v1Acl,v2Acl});
  const issuerAcl=(await a.query("select has_function_privilege('service_role','admin_internal.staff_step_up_issue_receipt_v1(uuid,uuid,text,text,timestamp with time zone,uuid)','EXECUTE') service,has_function_privilege('authenticated','admin_internal.staff_step_up_issue_receipt_v1(uuid,uuid,text,text,timestamp with time zone,uuid)','EXECUTE') authenticated,has_function_privilege('postgres','admin_internal.staff_step_up_issue_receipt_v1(uuid,uuid,text,text,timestamp with time zone,uuid)','EXECUTE') postgres")).rows[0];
  check(!issuerAcl.service&&!issuerAcl.authenticated&&!issuerAcl.postgres,"A issuer ACL denies service_role authenticated postgres",issuerAcl);
  const memberships=(await a.query("select g.rolname granted,u.rolname member,x.rolname grantor,m.admin_option,m.inherit_option,m.set_option from pg_auth_members m join pg_roles g on g.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles x on x.oid=m.grantor where g.rolname like 'staff_step_up_%' or u.rolname like 'staff_step_up_%'")).rows;
  const clientMemberships=memberships.filter((r)=>["anon","authenticated","authenticator","service_role"].includes(r.member)||["anon","authenticated","authenticator","service_role"].includes(r.granted));
  const creatorEdges=memberships.filter((r)=>r.member==="postgres");
  check(clientMemberships.length===0&&creatorEdges.every((r)=>r.grantor==="supabase_admin"&&r.admin_option&&!r.inherit_option&&!r.set_option),"A zero client membership; PostgreSQL 17 creator edges are ADMIN-only and unusable",memberships);
  await a.end(); await ownerA.end(); passA.stop(); passA=null;

  passB = await cluster("pass-b"); const fixture=await bootstrap(passB); const b=await passB.client("postgres");
  check(await apply(b,files)===125,"B independently applies all 125 migrations");
  await b.query("create role p3h_test_broker login inherit nosuperuser nocreatedb nocreaterole nobypassrls; grant staff_step_up_receipt_issuer_authority to p3h_test_broker with admin false,inherit true,set true");
  const broker=await passB.client("p3h_test_broker");
  const actor=uuid(), noPermissionActor=uuid(), target=uuid(), actorSession=uuid(), noPermissionSession=uuid();
  await fixture.query("insert into auth.users(id,email) values ($1,'actor@invalid.test'),($2,'nopermission@invalid.test'),($3,'target@invalid.test')",[actor,noPermissionActor,target]);
  await fixture.query("insert into auth.sessions(id,user_id) values ($1,$2),($3,$4)",[actorSession,actor,noPermissionSession,noPermissionActor]);
  const actorStaff=(await fixture.query("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id",[actor])).rows[0].id;
  await fixture.query("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day')",[noPermissionActor]);
  await fixture.query("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) select $1,permission_key,'migration_backfill','active',now()-interval '1 day' from admin_internal.staff_permission_catalog where permission_key in ('admin.management.staff.account.write','admin.management.staff.delegation.write','admin.management.staff.console_admission.write','admin.management.staff.permission.write','admin_context.read')",[actorStaff]);
  const proofA="a".repeat(64), proofB="b".repeat(64), factor="f".repeat(64);
  const first=await issue(broker,actor,actorSession,proofA,factor);
  const window=(await readStepUpData(b,"select extract(epoch from expires_at-issued_at)::int seconds,status from admin_internal.staff_step_up_receipts where receipt_id=$1",[first.receipt_id])).rows[0];
  check(window.seconds===900&&window.status==="active","B broker issues exact fixed 15-minute receipt",window);
  const firstStatus=await broker.query("select * from admin_internal.staff_step_up_receipt_status_v1($1,$2,$3,$4)",[first.receipt_id,actor,actorSession,proofA]);
  check(firstStatus.rows[0].active===true,"B broker status sees matching live receipt");
  const second=await issue(broker,actor,actorSession,proofB,factor);
  const supersession=(await readStepUpData(b,"select receipt_id,status,superseded_at is not null superseded from admin_internal.staff_step_up_receipts where receipt_id in ($1,$2) order by issued_at",[first.receipt_id,second.receipt_id])).rows;
  check(supersession.length===2&&supersession[0].status==="revoked"&&supersession[0].superseded&&supersession[1].status==="active","B new receipt supersedes prior actor/session/class receipt",supersession);
  const wrongProof=await broker.query("select * from admin_internal.staff_step_up_receipt_status_v1($1,$2,$3,$4)",[second.receipt_id,actor,actorSession,"c".repeat(64)]);
  check(wrongProof.rows[0].active===false,"B proof mismatch denied");
  const postgresAcl=await failure(()=>b.query("select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)",[actor,actorSession,"d".repeat(64),factor,new Date().toISOString(),uuid()]));
  check(postgresAcl?.code==="42501","B postgres has no normal issuer ACL",postgresAcl);
  await b.query("grant staff_step_up_receipt_issuer_authority to postgres with admin false,inherit true,set true");
  const postgresContract=await failure(()=>b.query("select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)",[actor,actorSession,"d".repeat(64),factor,new Date().toISOString(),uuid()]));
  check(postgresContract?.message==="step_up_issuer_not_authorized","B postgres is independently rejected by issuer contract",postgresContract);
  await b.query("revoke staff_step_up_receipt_issuer_authority from postgres");
  for (const role of ["service_role","authenticated"]) { const c=await passB.client(); const denied=await failure(async()=>{await c.query("begin");await c.query(`set local role ${role}`);await c.query("select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)",[actor,actorSession,"d".repeat(64),factor,new Date().toISOString(),uuid()]);}); try{await c.query("rollback");}catch{} await c.end(); check(denied?.code==="42501",`B ${role} cannot issue receipt`,denied); }
  const brokerMutation=await failure(()=>broker.query("select public.staff_management_link_staff_account_v1($1,now(),null,$2,$3)",[target,"test_reason",uuid()]));
  check(brokerMutation?.code==="42501","B broker cannot invoke frozen staff mutation",brokerMutation);
  const v1Bypass=await failure(()=>asActor(passB,actor,actorSession,"aal2","select public.staff_management_link_staff_account_v1($1,now(),null,$2,$3)",[target,"test_reason",uuid()]));
  check(v1Bypass?.code==="42501","B direct authenticated v1 bypass is closed",v1Bypass);

  const gatedCalls = [
    ["P3B link","select public.staff_management_link_staff_account_v2(null,null,null,null,null,null,null) v"],
    ["P3B suspend","select public.staff_management_suspend_staff_account_v2(null,null,null,null,null,null) v"],
    ["P3B reactivate","select public.staff_management_reactivate_staff_account_v2(null,null,null,null,null,null) v"],
    ["P3B revoke","select public.staff_management_revoke_staff_account_v2(null,null,null,null,null,null) v"],
    ["P3C delegation grant","select public.staff_management_grant_permission_delegation_v2(null,null,null,null,null,null,null,null,null,null,null) v"],
    ["P3C delegation revoke","select public.staff_management_revoke_permission_delegation_v2(null,null,null,null,null,null) v"],
    ["P3E admission grant","select public.staff_management_grant_console_admission_v2(null,null,null,null,null) v"],
    ["P3E admission revoke","select public.staff_management_revoke_console_admission_v2(null,null,null,null,null,null) v"],
    ["P3F permission grant","select public.staff_management_grant_privileged_permission_v2(null,null,null,null,null,null,null,null) v"],
    ["P3F permission revoke","select public.staff_management_revoke_privileged_permission_v2(null,null,null,null,null,null) v"]
  ];
  for (const [name,sql] of gatedCalls) { const row=(await asActor(passB,actor,actorSession,"aal2",sql))[0].v; matrix[name]=row.errorCode; check(row.errorCode==="step_up_required",`B ${name} v2 requires receipt`,row); }
  const aal1=(await asActor(passB,actor,actorSession,"aal1","select public.staff_management_link_staff_account_v2($1,now(),null,$2,$3,$4,$5) v",[target,"test_reason",uuid(),second.receipt_id,proofB]))[0].v;
  check(aal1.errorCode==="step_up_aal2_required","B AAL1 denied despite valid receipt",aal1);
  const wrongActor=(await asActor(passB,noPermissionActor,noPermissionSession,"aal2","select public.staff_management_link_staff_account_v2($1,now(),null,$2,$3,$4,$5) v",[target,"test_reason",uuid(),second.receipt_id,proofB]))[0].v;
  check(wrongActor.errorCode==="step_up_actor_mismatch","B actor mismatch denied",wrongActor);
  const wrongSession=(await asActor(passB,actor,uuid(),"aal2","select public.staff_management_link_staff_account_v2($1,now(),null,$2,$3,$4,$5) v",[target,"test_reason",uuid(),second.receipt_id,proofB]))[0].v;
  check(wrongSession.errorCode==="step_up_session_mismatch","B session mismatch denied",wrongSession);
  await fixture.query("delete from auth.sessions where id=$1",[actorSession]);
  const deletedSession=(await asActor(passB,actor,actorSession,"aal2","select public.staff_management_link_staff_account_v2($1,now(),null,$2,$3,$4,$5) v",[target,"test_reason",uuid(),second.receipt_id,proofB]))[0].v;
  check(deletedSession.errorCode==="step_up_session_invalid","B deleted Auth session invalidates receipt",deletedSession);
  await fixture.query("insert into auth.sessions(id,user_id) values ($1,$2)",[actorSession,actor]);
  const noPermissionReceipt=await issue(broker,noPermissionActor,noPermissionSession,"e".repeat(64),factor);
  const noPermission=(await asActor(passB,noPermissionActor,noPermissionSession,"aal2","select public.staff_management_suspend_staff_account_v2($1,0,$2,$3,$4,$5) v",[actorStaff,"test_reason",uuid(),noPermissionReceipt.receipt_id,"e".repeat(64)]))[0].v;
  check(noPermission.errorCode==="permission_denied","B valid receipt does not replace existing management permission",noPermission);
  const requestId=uuid(), effectiveFrom=new Date().toISOString();
  const valid=(await asActor(passB,actor,actorSession,"aal2","select public.staff_management_link_staff_account_v2($1,$2,null,$3,$4,$5,$6) v",[target,effectiveFrom,"test_reason",requestId,second.receipt_id,proofB]))[0].v;
  check(valid.outcome==="applied"&&valid.ok===true,"B valid v2 path invokes frozen P3B operator",valid);
  const replay=(await asActor(passB,actor,actorSession,"aal2","select public.staff_management_link_staff_account_v2($1,$2,null,$3,$4,$5,$6) v",[target,effectiveFrom,"test_reason",requestId,second.receipt_id,proofB]))[0].v;
  const evidence=(await readStepUpData(b,"select (select count(*) from admin_internal.staff_step_up_receipt_uses where request_id=$1)::int uses,(select count(*) from admin_internal.staff_security_notification_outbox where request_id=$1)::int outbox",[requestId])).rows[0];
  check(replay.outcome==="applied"&&evidence.uses===1&&evidence.outbox===1,"B exact replay does not duplicate receipt use or outbox",{replay,evidence});
  const p3d=(await b.query("select has_function_privilege('authenticated','public.staff_delegated_grant_permission_v1(uuid,uuid,timestamp with time zone,timestamp with time zone,text,uuid)','EXECUTE') grant_ok,has_function_privilege('authenticated','public.staff_delegated_revoke_permission_v1(uuid,uuid,bigint,text,uuid)','EXECUTE') revoke_ok")).rows[0];
  check(p3d.grant_ok&&p3d.revoke_ok,"B P3D ordinary delegated RPC ACL remains unchanged",p3d);
  const activeScope=(await readStepUpData(b,"select actor_auth_user_id,session_id,operation_class,count(*)::int n from admin_internal.staff_step_up_receipts where status='active' group by 1,2,3 having count(*)>1")).rows;
  check(activeScope.length===0,"B no actor/session/class scope has two active receipts",activeScope);
  await broker.end(); await b.end(); await fixture.end(); passB.stop(); passB=null;
} catch(error) { check(false,"PostgreSQL harness completes without unhandled error",{code:error.code,message:error.message,stack:error.stack}); console.error(error); }
finally { if(passA)passA.stop(); if(passB)passB.stop(); }
console.log(JSON.stringify({ suite:SUITE,total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures,migrationCount:files.length,protectedOperationMatrix:matrix,developmentAccessed:false,productionAccessed:false },null,2));
process.exitCode=failures.length?1:0;
