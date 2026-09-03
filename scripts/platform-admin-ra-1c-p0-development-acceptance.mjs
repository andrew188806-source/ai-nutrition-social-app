#!/usr/bin/env node
// Development-only P0 acceptance. Default mode is a read-only target preflight. Applying the
// migration and exercising the mutation requires the separate WRITE_OPT_IN after a local freeze.
import fs from "node:fs";
import crypto from "node:crypto";
const PREFLIGHT_OPT_IN="TASTKIND_PLATFORM_ADMIN_RA1C_P0_DEVELOPMENT_PREFLIGHT";
const WRITE_OPT_IN="TASTKIND_PLATFORM_ADMIN_RA1C_P0_DEVELOPMENT_WRITE";
const DEV_REF="msbgnnoorsoefuiwluye";
const TARGET_RESTAURANT="synthetic-fixture-restaurant";
const TARGET_BRANCH = "synthetic-fixture-branch-b";
const PROTECTED_BRANCH="dev-branch-xinyi";
const ADMIN_ID="81b4cdaf-2f12-4bda-bb26-197f6f5990ae";
const ADMIN_EMAIL="restaurant.owner.demo.20260903@development.invalid";
const migration=fs.readFileSync("supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql","utf8");
if(process.env[PREFLIGHT_OPT_IN]!=="1"){console.log(JSON.stringify({suite:"platform-admin-ra-1c-p0-development-acceptance",status:"skipped",reason:`set ${PREFLIGHT_OPT_IN}=1 for the read-only Development preflight`},null,2));process.exit(0)}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token)throw new Error("SUPABASE_ACCESS_TOKEN absent");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function sql(query){for(let n=1;n<=12;n++){const r=await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({query})});const t=await r.text();if(r.ok)return JSON.parse(t);if(r.status!==429)throw new Error(`SQL ${r.status}: ${t.slice(0,500)}`);await wait(Math.min(30000,n*4000))}throw new Error("Management API throttled")}
const one=async q=>(await sql(q))[0];
const canonical=x=>JSON.stringify(x,Object.keys(x).sort());const fingerprint=x=>crypto.createHash("sha256").update(canonical(x)).digest("hex");
const checks=[];const check=(name,pass,detail)=>{checks.push({name,pass:Boolean(pass),...(pass?{}:{detail})});console.log(`${pass?"PASS":"FAIL"} ${checks.length} ${name}`)};
const branchSnapshot=async id=>one(`select b.id,b.restaurant_id,b.name,b.district,b.address,b.status,
  coalesce(to_jsonb(b)->>'status_version','absent') as status_version from public.restaurant_branches b where b.id='${id}';`);
let sessionToken,anonKey,original,targetChanged=false,adminGranted=false;
const operator=statement=>sql(`begin; grant platform_admin_write_authority to postgres with inherit true, set false; ${statement}; revoke platform_admin_write_authority from postgres granted by postgres; commit;`);
const rpc=async(fn,body,jwt=sessionToken)=>{const r=await fetch(`https://${DEV_REF}.supabase.co/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:anonKey,...(jwt?{Authorization:`Bearer ${jwt}`}:{ }),"Content-Type":"application/json"},body:JSON.stringify(body??{})});const text=await r.text();let parsed;try{parsed=JSON.parse(text)}catch{parsed=text}return{status:r.status,body:parsed}};
try{
  const meta=await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}`,{headers:{Authorization:`Bearer ${token}`}})).json();
  check("project is exactly tastkind-development",meta.id===DEV_REF&&meta.name==="tastkind-development",meta);
  const pre=await branchSnapshot(TARGET_BRANCH); check("approved synthetic branch B exists under the approved parent",pre?.id===TARGET_BRANCH&&pre.restaurant_id===TARGET_RESTAURANT,pre);
  check("approved target is active/inactive",["active","inactive"].includes(pre?.status),pre);
  const protectedPre=await branchSnapshot(PROTECTED_BRANCH); check("protected branch is observable for a no-touch assertion",protectedPre?.id===PROTECTED_BRANCH,protectedPre);
  console.log(JSON.stringify({phase:"PRE_WRITE_TARGET_CONFIRMATION",targetSnapshot:pre,targetFingerprint:fingerprint(pre),protectedBranchFingerprint:fingerprint(protectedPre),developmentWriteStarted:false},null,2));
  if(process.env[WRITE_OPT_IN]!=="1"){console.log(JSON.stringify({suite:"platform-admin-ra-1c-p0-development-acceptance",status:"preflight_complete",writeExecuted:false,total:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length},null,2));process.exitCode=checks.some(x=>!x.pass)?1:0;process.exit()}
  if(checks.some(x=>!x.pass))throw new Error("PRE_WRITE_TARGET_CONFIRMATION_FAILED");

  const applied=await one(`select to_regclass('admin_internal.platform_admin_operation_receipts') is not null as applied;`);
  if(applied.applied)throw new Error("RA1C_P0_MIGRATION_ALREADY_APPLIED");
  await sql(migration);
  check("migration applied exactly once",(await one(`select to_regclass('admin_internal.platform_admin_operation_receipts') is not null as ok;`)).ok===true);
  original=await branchSnapshot(TARGET_BRANCH);check("migration preserves target business status",original.status===pre.status,{pre,original});
  const protectedAfterMigration=await branchSnapshot(PROTECTED_BRANCH);
  check("migration preserves every protected branch business field",["id","restaurant_id","name","district","address","status"].every(k=>protectedAfterMigration[k]===protectedPre[k]),{protectedPre,protectedAfterMigration});
  const keys=await(await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`,{headers:{Authorization:`Bearer ${token}`}})).json();anonKey=(Array.isArray(keys)?keys:[]).find(k=>k.name==="anon")?.api_key;if(!anonKey)throw new Error("Development anon key unavailable");
  const password=process.env.TASTKIND_RA1A_LIFECYCLE_TARGET_PASSWORD;if(!password)throw new Error("TASTKIND_RA1A_LIFECYCLE_TARGET_PASSWORD absent");
  const login=await(await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:anonKey,"Content-Type":"application/json"},body:JSON.stringify({email:ADMIN_EMAIL,password})})).json();sessionToken=login.access_token;
  check("existing Development fixture signs in",Boolean(sessionToken)&&login.user?.id===ADMIN_ID,{id:login.user?.id});
  const body={p_restaurant_id:TARGET_RESTAURANT,p_branch_id:TARGET_BRANCH,p_expected_status:original.status,p_requested_status:original.status==="active"?"inactive":"active",p_expected_version:Number(original.status_version),p_reason_code:original.status==="active"?"operational_pause":"operational_resume",p_request_id:crypto.randomUUID()};
  const ownerDenied=await rpc("platform_admin_set_restaurant_branch_status_v1",body);check("Restaurant Owner alone is denied",ownerDenied.status===200&&ownerDenied.body.errorCode==="permission_denied",ownerDenied);
  const anonDenied=await rpc("platform_admin_set_restaurant_branch_status_v1",body,null);check("anonymous client cannot execute mutation",anonDenied.status>=400,anonDenied);
  const active=await one(`select count(*)::int n from admin_internal.platform_admin_memberships where status='active';`);if(active.n!==0)throw new Error("ACTIVE_PLATFORM_ADMIN_PRECONDITION_FAILED");
  await operator(`select admin_internal.grant_platform_admin('${ADMIN_ID}'::uuid,'platform_admin',null,'RA-1C-P0 Development acceptance')`);adminGranted=true;
  const context=await rpc("platform_admin_current_context_v1",{});check("legacy context remains exactly two read permissions",context.status===200&&Array.isArray(context.body)&&context.body.length===2&&!JSON.stringify(context.body).includes("status.write"),context);
  const hasPermission=await rpc("platform_admin_has_permission_v1",{requested_permission_key:"admin_restaurant_branch.status.write"});check("active Admin has the exact status permission",hasPermission.status===200&&hasPermission.body===true,hasPermission);
  const beforeOthers=await one(`select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text,'[]')) as fingerprint from public.restaurant_branches b where b.id<>'${TARGET_BRANCH}';`);
  const appliedResult=await rpc("platform_admin_set_restaurant_branch_status_v1",body);check("valid mutation applies",appliedResult.status===200&&appliedResult.body.ok===true&&appliedResult.body.outcome==="applied",appliedResult);targetChanged=true;
  const changed=await branchSnapshot(TARGET_BRANCH);check("only intended target state/version changed",changed.status===body.p_requested_status&&Number(changed.status_version)===Number(original.status_version)+1,{original,changed});
  const replay=await rpc("platform_admin_set_restaurant_branch_status_v1",body);check("same request replays stable receipt",JSON.stringify(replay.body)===JSON.stringify(appliedResult.body),{appliedResult,replay});
  const conflict=await rpc("platform_admin_set_restaurant_branch_status_v1",{...body,p_expected_status:body.p_requested_status});check("same key with different valid payload conflicts",conflict.body.errorCode==="idempotency_conflict",conflict);
  const stale=await rpc("platform_admin_set_restaurant_branch_status_v1",{...body,p_request_id:crypto.randomUUID()});check("new stale request is rejected",stale.body.errorCode==="stale_state",stale);
  const receipt=await one(`select count(*)::int n from admin_internal.platform_admin_operation_receipts where branch_id='${TARGET_BRANCH}' and request_id='${body.p_request_id}'::uuid;`);check("one durable receipt exists",receipt.n===1,receipt);
  const afterOthers=await one(`select md5(coalesce(jsonb_agg(to_jsonb(b) order by b.id)::text,'[]')) as fingerprint from public.restaurant_branches b where b.id<>'${TARGET_BRANCH}';`);check("no other branch row changed",afterOthers.fingerprint===beforeOthers.fingerprint,{beforeOthers,afterOthers});
  const restore={p_restaurant_id:TARGET_RESTAURANT,p_branch_id:TARGET_BRANCH,p_expected_status:changed.status,p_requested_status:original.status,p_expected_version:Number(changed.status_version),p_reason_code:original.status==="active"?"operational_resume":"operational_pause",p_request_id:crypto.randomUUID()};
  const restored=await rpc("platform_admin_set_restaurant_branch_status_v1",restore);check("canonical reverse operation restores target status",restored.body.ok===true&&restored.body.outcome==="applied",restored);targetChanged=false;
  await operator(`select admin_internal.revoke_platform_admin('${ADMIN_ID}'::uuid,null,'RA-1C-P0 Development acceptance')`);adminGranted=false;
  const revoked=await rpc("platform_admin_set_restaurant_branch_status_v1",{...restore,p_request_id:crypto.randomUUID(),p_expected_version:Number(restored.body.version)});check("same session is denied immediately after revoke",revoked.body.errorCode==="permission_denied",revoked);
  const final=await branchSnapshot(TARGET_BRANCH);check("target status is restored and version history remains",final.status===original.status&&Number(final.status_version)===Number(original.status_version)+2,{original,final});
  const protectedFinal=await branchSnapshot(PROTECTED_BRANCH);check("dev-branch-xinyi remained untouched",["id","restaurant_id","name","district","address","status","status_version"].every(k=>protectedFinal[k]===protectedAfterMigration[k]),{protectedAfterMigration,protectedFinal});
  check("zero active Platform Admin remains",(await one(`select count(*)::int n from admin_internal.platform_admin_memberships where status='active';`)).n===0);
} catch(error){checks.push({name:"suite execution",pass:false,detail:String(error.message).slice(0,500)});console.error(error.message)}
finally{
  try{if(targetChanged&&sessionToken&&original){const now=await branchSnapshot(TARGET_BRANCH);await rpc("platform_admin_set_restaurant_branch_status_v1",{p_restaurant_id:TARGET_RESTAURANT,p_branch_id:TARGET_BRANCH,p_expected_status:now.status,p_requested_status:original.status,p_expected_version:Number(now.status_version),p_reason_code:original.status==="active"?"operational_resume":"operational_pause",p_request_id:crypto.randomUUID()});targetChanged=false}if(adminGranted){await operator(`select admin_internal.revoke_platform_admin('${ADMIN_ID}'::uuid,null,'RA-1C-P0 recovery')`);adminGranted=false}}catch(error){checks.push({name:"canonical recovery",pass:false,detail:String(error.message).slice(0,500)})}
}
const failed=checks.filter(x=>!x.pass);console.log(JSON.stringify({suite:"platform-admin-ra-1c-p0-development-acceptance",project:DEV_REF,target:TARGET_BRANCH,total:checks.length,passed:checks.length-failed.length,failed:failed.length,failures:failed,developmentWriteExecuted:process.env[WRITE_OPT_IN]==="1",productionTouched:false},null,2));process.exitCode=failed.length?1:0;
