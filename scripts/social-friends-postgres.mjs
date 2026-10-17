// Fresh local PostgreSQL 17 integration. No Hosted access, secrets, skips or assumed PASS.
// Provider authentication is an injected synthetic boundary; production handlers/services/SQL run.
// Global heavy-PG lock is mandatory and held by this PID until all owned PG processes exit.
import fs from "node:fs";import path from "node:path";import net from "node:net";import child from "node:child_process";import assert from "node:assert/strict";import {createRequire} from "node:module";import {randomUUID,createHash} from "node:crypto";
import {load} from "./social-friends-test-loader.mjs";
import {activateDisposableFixture,FIXTURE_BUNDLE,presented} from "./pc2-consumer-onboarding-fixtures.mjs";
const root=process.cwd(),arg=n=>process.argv[process.argv.indexOf(n)+1],bin=arg("--pg-bin"),out=path.resolve(arg("--out"));
if(!process.argv.includes("--pg-bin")||!process.argv.includes("--out"))throw Error("--pg-bin and NEW --out are required");
const shared=process.env.TK_PARALLEL_ROOT??"D:/tastkind-parallel-20261017",lock=path.join(shared,"LOCKS","pg-heavy.lock"),token=randomUUID();
fs.mkdirSync(path.dirname(lock),{recursive:true});
try{fs.mkdirSync(lock);}catch(e){if(e.code==="EEXIST")throw Error("PG_LOCK_BUSY: another line holds "+lock);throw e;}
fs.writeFileSync(path.join(lock,"holder.json"),JSON.stringify({line:"social",holder:token,pid:process.pid,workdir:root,command:"social-friends-postgres.mjs",startedUtc:new Date().toISOString()},null,2));
const require_=createRequire(import.meta.url),{Client}=require_("pg");
const exe=n=>path.join(bin,n+(process.platform==="win32"?".exe":""));
const run=(n,args)=>{const r=child.spawnSync(exe(n),args,{encoding:"utf8",timeout:60000,windowsHide:true});if(r.status!==0)throw Error(n+" failed: "+r.stderr+" "+r.stdout);return r.stdout;};
const checks=[],connections=new Set();let started=false,ownsOut=false,port,su,db,failed=null;
const check=(name,pass,detail=null)=>{checks.push({name,pass:!!pass,detail});console.log((pass?"PASS ":"FAIL ")+name);assert.ok(pass,name+" "+JSON.stringify(detail));};
const expectDenied=async fn=>{try{await fn();return false;}catch(e){return e.code==="42501";}};
const connect=async user=>{const c=new Client({host:"127.0.0.1",port,user,database:"postgres",connectionTimeoutMillis:10000});c.on("error",()=>{});await c.connect();connections.add(c);return c;};
const close=async c=>{await c.end();connections.delete(c);};
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),A=uuid(101),B=uuid(102),C=uuid(103),LEGACY=uuid(104);
const direct=async(role,actor,sql,args=[])=>{const c=await connect(role==="authenticated"?"authenticator":"social_test_executor");try{await c.query("begin");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor??""]);await c.query("set local role "+role);await c.query("set local statement_timeout='10s'");const r=await c.query(sql,args);await c.query("commit");return r.rows;}catch(e){await c.query("rollback");throw e;}finally{await close(c);}};
const txClass=load(path.join(root,"supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts")).SocialRuntimeExecutorTransport;
const transport=()=>new txClass({withTransaction:async operation=>{
 const c=await connect("social_test_executor");try{await c.query("begin");await c.query("set local role social_runtime_executor");await c.query("set local statement_timeout='10s'");const result=await operation({queryObject:async(text,args)=>(await c.query(text,args)).rows});await c.query("commit");return result;}catch(e){await c.query("rollback");throw e;}finally{await close(c);}
},close:async()=>{}});
const config={supabaseUrl:"http://synthetic.invalid",supabaseAnonKey:"synthetic",candidateRefKey:new Uint8Array(32).fill(31),relationshipRefKey:new Uint8Array(32).fill(32),chatRefKey:new Uint8Array(32).fill(33)};
const dependencies=actor=>({loadConfig:()=>({ok:true,value:config}),authenticateCaller:async()=>actor?{ok:true,value:{userId:actor,userScopedClient:{}}}:{ok:false},createTransport:transport});
const friendHandler=load(path.join(root,"supabase/functions/social-friends/handler.ts")).processSocialFriendsRequest;
const relationHandler=load(path.join(root,"supabase/functions/meal-buddy-relationship/handler.ts")).processMealBuddyRelationshipRequest;
const chatHandler=load(path.join(root,"supabase/functions/meal-buddy-chat/handler.ts")).processMealBuddyChatRequest;
const call=async(handler,actor,body)=>{const response=await handler(new Request("http://localhost/local",{method:"POST",body:JSON.stringify(body)}),dependencies(actor));return {status:response.status,body:await response.json()};};
const friend=(actor,body)=>call(friendHandler,actor,body),relation=(actor,body)=>call(relationHandler,actor,body),chat=(actor,body)=>call(chatHandler,actor,body);
const settings=(actor,searchable)=>friend(actor,searchable===undefined?{operation:"settings"}:{operation:"set_searchable",searchable});
const lookup=(actor,value,kind="phone")=>friend(actor,{operation:"lookup",kind,value});
const reset=()=>db.query("delete from friend_internal.lookup_budget");
const fingerprint=async()=>createHash("sha256").update(JSON.stringify((await db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and (n.nspname like 'retention%' or n.nspname='consumer_internal') order by 1,2,3")).rows)).digest("hex");
try{
 fs.mkdirSync(out);ownsOut=true;const version=run("postgres",["--version"]);check("PostgreSQL17 required",/PostgreSQL\) 17\./.test(version),version);
 port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 run("initdb",["-D",path.join(out,"data"),"-U","supabase_admin","--encoding=UTF8","--locale=C","-A","trust","--no-sync"]);
 run("pg_ctl",["-D",path.join(out,"data"),"-l",path.join(out,"postgres.log"),"-o","-p "+port+" -c listen_addresses=127.0.0.1 -c fsync=off -c shared_buffers=16MB -c max_connections=25","start"]);started=true;
 su=await connect("supabase_admin");
 const source=fs.readFileSync(path.join(root,"scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"),"utf8"),marker="const BOOTSTRAP = `",start=source.indexOf(marker)+marker.length;
 assert.ok(start>=marker.length);await su.query(source.slice(start,source.indexOf("\n`;",start)));
 // Match real Supabase Auth schema fields absent from this repository's small legacy test stub.
 await su.query("alter table auth.users add column phone text unique,add column phone_confirmed_at timestamptz,add column banned_until timestamptz,add column deleted_at timestamptz;create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));grant select on auth.sessions to postgres;");
 db=await connect("postgres");
 const migrations=fs.readdirSync(path.join(root,"supabase/migrations")).filter(n=>n.endsWith(".sql")).sort(),social=migrations.filter(n=>n.includes("_social_friend_lookup_run_mvbudhyz.sql"));assert.equal(social.length,1);
 for(const name of migrations.filter(n=>n!==social[0])){
  if(name==="20260930174028_consumer_pc2_onboarding_consent_foundation.sql"){
   await su.query("insert into auth.users(id,email) values($1,'legacy@synthetic.invalid')",[LEGACY]);
   await db.query("insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key) values($1,'synthetic-legacy-social','Legacy','Legacy','BG')",[LEGACY]);
  }
  const installer=/consumer_retention_entitlement_authority|consumer_retention_acquisition_record/.test(name)?su:db;
  try{await installer.query(fs.readFileSync(path.join(root,"supabase/migrations",name),"utf8"));}catch(e){throw Error("BASE_MIGRATION "+name+" "+e.code+" "+e.message);}
 }
 const before=await fingerprint();await db.query(fs.readFileSync(path.join(root,"supabase/migrations",social[0]),"utf8"));
 check("fresh full predecessor chain and new migration apply",true,{count:migrations.length,migration:social[0]});
 check("retention and shared consent/age function definitions unchanged",before===await fingerprint());
 await su.query("create role social_test_executor login noinherit;grant social_runtime_executor to social_test_executor with inherit false,set true;");
 check("trusted SQL rejects mismatched transaction actor",await expectDenied(()=>direct("social_runtime_executor",C,"select friend_internal.settings($1)",[A])));
 check("runtime has no membership in lookup owner",(await db.query("select not pg_has_role('social_runtime_executor','social_friend_lookup_authority','member') ok")).rows[0].ok);
 check("client cannot lookup by direct private SQL",await expectDenied(()=>direct("authenticated",A,"select * from friend_internal.lookup($1,'phone','0912345678')",[A])));
 check("client cannot read private settings or rate budget",await expectDenied(()=>direct("authenticated",A,"select * from friend_internal.lookup_settings")));
 check("client cannot read Auth directory",await expectDenied(()=>direct("authenticated",A,"select phone from auth.users")));
 check("no client role gets private helper/lookup EXECUTE",(await db.query("select not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role'),('authenticator')) as r(name) where n.nspname='friend_internal' and has_function_privilege(r.name,p.oid,'execute')) ok")).rows[0].ok);
 await direct("authenticated",LEGACY,"select public.opt_in_authenticated_social_participation()");
 check("legacy implicit compatibility does not authorize new search",(await settings(LEGACY)).status===403);
 await activateDisposableFixture(db);
 for(const [id,name]of [[A,"Alice"],[B,"Bob"],[C,"Cara"]]){
  await su.query("insert into auth.users(id,email) values($1,$2)",[id,id+"@synthetic.invalid"]);
  await direct("authenticated",id,"select public.complete_authenticated_consumer_account_onboarding($1,$2,true,true,true,$3)",[FIXTURE_BUNDLE.bundleVersion,JSON.stringify(presented()),name]);
  await direct("authenticated",id,"select public.attest_authenticated_social_adult(true)");
  await direct("authenticated",id,"select public.opt_in_authenticated_social_participation()");
 }
 await su.query("update auth.users set phone='886912345678',phone_confirmed_at=now() where id=$1",[B]);
 check("new settings default unsearchable",(await settings(B)).body.settings.searchable===false);
 check("opted-out confirmed phone is uniform miss",(await lookup(A,"0912345678")).body.status==="not_found");
 await settings(B,true);await reset();
 const found=await lookup(A,"(0912) 345-678");check("Taiwan national phone resolves trusted confirmed registration",found.status===200&&found.body.status==="found",found);
 const candidate=found.body.candidate.candidateRef;
 check("projection reveals no phone, user ID, nutrition or position",Object.keys(found.body.candidate).sort().join(",")==="candidateRef,displayName,mascotAvatarKey"&&!JSON.stringify(found.body).includes(B)&&!JSON.stringify(found.body).includes("886912"));
 check("E164 exact formatting resolves",(await lookup(A,"+886 912 345 678")).body.status==="found");
 check("no fuzzy search",(await lookup(A,"0912%")).body.status==="not_found"&&(await lookup(A,"Bob")).body.status==="not_found");
 await su.query("update auth.users set phone_confirmed_at=null where id=$1",[B]);
 check("unconfirmed registration excluded",(await lookup(A,"0912345678")).body.status==="not_found");
 await su.query("update auth.users set raw_user_meta_data='{\"phone\":\"+886912345678\",\"phone_verified\":true}' where id=$1",[C]);
 check("self-reported user metadata cannot confirm phone",(await lookup(A,"0912345678")).body.status==="not_found");
 await su.query("update auth.users set phone_confirmed_at=now() where id=$1",[B]);await reset();
 const code=(await settings(B)).body.settings.inviteCode;
 check("exact invitation code resolves",(await lookup(A,code,"code")).body.status==="found");
 await friend(B,{operation:"rotate_code"});
 check("rotation invalidates prior code",(await lookup(A,code,"code")).body.status==="not_found");
 check("new code resolves",(await lookup(A,(await settings(B)).body.settings.inviteCode,"code")).body.status==="found");
 const ownCode=(await settings(A,true)).body.settings.inviteCode;
 check("self lookup uniformly unavailable",(await lookup(A,ownCode,"code")).body.status==="not_found");
 await settings(B,false);
 check("toggle disables code and phone",(await lookup(A,"0912345678")).body.status==="not_found"&&(await lookup(A,(await settings(B)).body.settings.inviteCode,"code")).body.status==="not_found");
 await settings(B,true);await reset();
 await db.query("update public.consumer_profiles set status='disabled' where user_id=$1",[B]);
 check("disabled profile excluded",(await lookup(A,"0912345678")).body.status==="not_found");
 await db.query("update public.consumer_profiles set status='active',deleted_at=now() where user_id=$1",[B]);
 check("soft-deleted profile excluded",(await lookup(A,"0912345678")).body.status==="not_found");
 await db.query("update public.consumer_profiles set deleted_at=null where user_id=$1",[B]);
 await su.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[B]);
 check("banned Auth target excluded",(await lookup(A,"0912345678")).body.status==="not_found");
 await su.query("update auth.users set banned_until=null where id=$1",[B]);
 for(const [blocker,blocked]of [[A,B],[B,A]]){
  await direct("authenticated",blocker,"select public.create_authenticated_social_block($1)",[blocked]);
  check("block direction excludes search "+blocker,(await lookup(A,"0912345678")).body.status==="not_found");
  await db.query("delete from public.social_blocks where blocker_user_id=$1 and blocked_user_id=$2",[blocker,blocked]);
 }
 await direct("authenticated",B,"select public.attest_authenticated_social_adult(false)");
 check("explicit under18 target excluded",(await lookup(A,"0912345678")).body.status==="not_found");
 await direct("authenticated",B,"select public.attest_authenticated_social_adult(true)");await direct("authenticated",B,"select public.resume_authenticated_social_participation()");await reset();
 await direct("authenticated",A,"select public.attest_authenticated_social_adult(false)");
 check("under18 actor denied by real server authority",(await lookup(A,"0912345678")).status===403);
 await direct("authenticated",A,"select public.attest_authenticated_social_adult(true)");await direct("authenticated",A,"select public.resume_authenticated_social_participation()");

 await reset();
 for(let i=0;i<10;i++)assert.equal((await lookup(A,"invalid")).body.status,"not_found");
 check("invalid attempts consume the minute budget",(await lookup(A,"0912345678")).body.status==="rate_limited");
 check("rate budgets are actor-isolated",(await lookup(C,"0912345678")).body.status==="found");
 await reset();
 const burst=await Promise.all(Array.from({length:12},()=>lookup(A,"invalid")));
 check("concurrent probes cannot overshoot 10 per minute",burst.filter(r=>r.body.status==="not_found").length===10&&burst.filter(r=>r.body.status==="rate_limited").length===2);
 await db.query("update friend_internal.lookup_budget set minute_start=now()-interval '2 minutes',day_count=50 where user_id=$1",[A]);
 check("daily cap cannot be bypassed by minute expiry",(await lookup(A,"invalid")).body.status==="rate_limited");
 await db.query("update friend_internal.lookup_budget set day_start=current_date-1 where user_id=$1",[A]);
 check("budget recovers after window reset",(await lookup(A,"invalid")).body.status==="not_found");
 await reset();
 const valid=(await lookup(A,"0912345678")).body.candidate.candidateRef;
 const spoof=await relation(C,{operation:"send",candidateRef:valid});
 check("candidate reference is actor-bound",spoof.status!==200);
 const sends=await Promise.all([relation(A,{operation:"send",candidateRef:valid}),relation(A,{operation:"send",candidateRef:valid})]);
 check("new search feeds real duplicate-idempotent invitation handler",sends.every(r=>r.status===200&&r.body.relationships[0].state==="outgoing_pending"),sends);
 const aRef=sends[0].body.relationships[0].relationshipRef;
 const count=(await db.query("select count(*)::int n from public.meal_buddy_relationships where user_low_id=$1 and user_high_id=$2",[A,B])).rows[0].n;
 check("duplicate sends make one canonical pair",count===1);
 const selfCandidate=await load(path.join(root,"supabase/functions/_shared/social-candidate-ref/index.ts")).createSocialCandidateRefCipher(config.candidateRefKey).seal(A,A,new Date());
 check("self invitation denied by canonical pair authority",(await relation(A,{operation:"send",candidateRef:selfCandidate})).status!==200);
 const bInbox=await relation(B,{operation:"list"}),bRef=bInbox.body.relationships[0].relationshipRef;
 const reverseRef=load(path.join(root,"supabase/functions/_shared/social-candidate-ref/index.ts")).createSocialCandidateRefCipher(config.candidateRefKey);
 const aCandidate=await reverseRef.seal(B,A,new Date());
 check("reverse send preserves incoming pending",(await relation(B,{operation:"send",candidateRef:aCandidate})).body.relationships[0].state==="incoming_pending");
 check("sender cannot accept own invitation",(await relation(A,{operation:"accept",relationshipRef:aRef})).status!==200);
 check("outsider cannot accept another user's ref",(await relation(C,{operation:"accept",relationshipRef:bRef})).status!==200);
 const accepted=await relation(B,{operation:"accept",relationshipRef:bRef});check("recipient accepts through actual handler",accepted.status===200&&accepted.body.relationships[0].state==="accepted",accepted);
 await settings(B,false);
 check("search disabled does not delete accepted friend",(await relation(A,{operation:"list"})).body.relationships.some(r=>r.state==="accepted"));
 const opened=await chat(A,{operation:"open",relationshipRef:aRef});check("accepted friend opens real chat despite lookup opt-out",opened.status===200,opened);
 const conversationRef=opened.body.conversation.conversationRef,clientMessageId=uuid(901);
 const message=await chat(A,{operation:"send",conversationRef,clientMessageId,body:"synthetic dinner hello"});
 const retried=await chat(A,{operation:"send",conversationRef,clientMessageId,body:"synthetic dinner hello"});
 check("chat send/retry preserves one server message",message.status===200&&retried.status===200&&message.body.message.messageRef===retried.body.message.messageRef);
 check("unrelated user cannot read chat",(await chat(C,{operation:"list_messages",conversationRef,before:null,limit:30})).status!==200);
 const history=await chat(A,{operation:"list_messages",conversationRef,before:null,limit:30});
 check("canonical pair chat retains readable history after search opt-out",history.status===200&&history.body.messages.some(m=>m.body==="synthetic dinner hello"));
 await direct("authenticated",B,"select public.create_authenticated_social_block($1)",[A]);
 check("block immediately revokes existing chat reads",(await chat(A,{operation:"list_messages",conversationRef,before:null,limit:30})).status!==200);
 await direct("authenticated",B,"select public.remove_authenticated_social_block($1)",[A]);
 const ended=await relation(A,{operation:"unfriend",relationshipRef:aRef});check("unfriend uses existing canonical lifecycle",ended.status===200);
 check("unfriend revokes old chat reference",(await chat(A,{operation:"list_messages",conversationRef,before:null,limit:30})).status!==200);
 // New mobile repository -> actual handler -> real executor SQL, with captured synthetic JWT.
 const {SocialFriendsRepository}=load(path.join(root,"apps/mobile/features/social-friends/repository.ts"));
 const mobile=new SocialFriendsRepository({getCurrentSession:async()=>({ok:true,value:{user:{userId:C}}})},{auth:{getSession:async()=>({data:{session:{user:{id:C},access_token:"synthetic-jwt-c"}},error:null})},functions:{invoke:async(name,options)=>{
  assert.equal(name,"social-friends");assert.equal(options.headers.Authorization,"Bearer synthetic-jwt-c");
  const r=await friend(C,options.body);return {data:r.body,error:r.status===200?null:{status:r.status}};
 }}});
 await reset();await settings(B,true);
 const mobileResult=await mobile.execute(C,{operation:"lookup",kind:"phone",value:"+886912345678"});
 check("mobile repository traverses production handler/service/SQL",mobileResult.status==="found"&&mobileResult.candidate.displayName==="Bob");
 const pairCipher=load(path.join(root,"supabase/functions/_shared/social-candidate-ref/index.ts")).createSocialCandidateRefCipher(config.candidateRefKey);
 const [ac,ca]=await Promise.all([pairCipher.seal(A,C,new Date()),pairCipher.seal(C,A,new Date())]);
 const cross=await Promise.all([relation(A,{operation:"send",candidateRef:ac}),relation(C,{operation:"send",candidateRef:ca})]);
 check("real competing cross-send serializes one pending pair",cross.every(r=>r.status===200)&&new Set(cross.map(r=>r.body.relationships[0].state)).size===2&&(await db.query("select count(*)::int n from public.meal_buddy_relationships where user_low_id=$1 and user_high_id=$2 and state='pending'",[A,C])).rows[0].n===1,cross);
 await db.query("begin");
 await db.query("select pg_advisory_xact_lock(hashtextextended($1::text||':friend_settings',0))",[B]);
 await db.query("update friend_internal.lookup_settings set searchable=false where user_id=$1",[B]);
 const racingSearch=lookup(A,"0912345678");
 await new Promise(resolve=>setTimeout(resolve,60));await db.query("commit");
 check("search waiting on concurrent opt-out rechecks committed setting",(await racingSearch).body.status==="not_found");
 await db.query("update public.consumer_profiles set status='disabled' where user_id=$1",[C]);
 check("disabled actor cannot get settings",(await settings(C)).status===403);
 await db.query("update public.consumer_profiles set status='active' where user_id=$1",[C]);
 await su.query("delete from auth.users where id=$1",[C]);
 check("Auth deletion cascades new settings and rate rows",(await db.query("select (select count(*) from friend_internal.lookup_settings where user_id=$1)+(select count(*) from friend_internal.lookup_budget where user_id=$1) n",[C])).rows[0].n==="0");
 check("retention/shared qualifications remain byte-identical after full flow",before===await fingerprint());
 fs.writeFileSync(path.join(out,"migration-inputs.json"),JSON.stringify(migrations.map(name=>({name,sha256:createHash("sha256").update(fs.readFileSync(path.join(root,"supabase/migrations",name))).digest("hex")})),null,2));
}catch(e){failed={message:e.message,stack:e.stack};console.error(e.stack);process.exitCode=1;}
finally{
 for(const c of [...connections])try{await close(c);}catch{}
 if(started)try{run("pg_ctl",["-D",path.join(out,"data"),"-m","fast","stop"]);started=false;}catch(e){failed??={message:"PG_STOP_FAILED "+e.message};process.exitCode=1;}
 if(ownsOut)fs.writeFileSync(path.join(out,"result.json"),JSON.stringify({status:failed?"FAIL_OR_BLOCKED":"PASS",checks,failed,authProviderVerified:false,denoNetworkVerified:false,uiDeviceVerified:false,hosted:false,lockToken:token},null,2));
 // Only release our exact holder after our PG instance has stopped.
 if(!started&&JSON.parse(fs.readFileSync(path.join(lock,"holder.json"),"utf8")).holder===token){fs.unlinkSync(path.join(lock,"holder.json"));fs.rmdirSync(lock);}
 console.log(JSON.stringify({status:failed?"FAIL_OR_BLOCKED":"PASS",checks:checks.length,passed:checks.filter(c=>c.pass).length,failed,output:out}));
}
