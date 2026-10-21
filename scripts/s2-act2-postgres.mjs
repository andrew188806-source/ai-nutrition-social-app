// Fresh local PostgreSQL 17 integration. No Hosted access, secrets, skips or assumed PASS.
// Provider authentication is an injected synthetic boundary; production handlers/services/SQL run.
// Global heavy-PG lock is mandatory and held by this PID until all owned PG processes exit.
import fs from "node:fs";import path from "node:path";import net from "node:net";import child from "node:child_process";import assert from "node:assert/strict";import {createRequire} from "node:module";import {randomUUID,createHash} from "node:crypto";
import {load} from "./s2-act2-test-loader.mjs";
import {activateDisposableFixture,FIXTURE_BUNDLE,presented} from "./pc2-consumer-onboarding-fixtures.mjs";
const root=process.cwd(),arg=n=>process.argv[process.argv.indexOf(n)+1],bin=arg("--pg-bin"),out=path.resolve(arg("--out"));
if(!process.argv.includes("--pg-bin")||!process.argv.includes("--out"))throw Error("--pg-bin and NEW --out are required");
const shared=process.env.TK_PARALLEL_ROOT??"D:/tastkind-parallel-20261017",lock=path.join(shared,"LOCKS","pg-heavy.lock"),token=randomUUID();
fs.mkdirSync(path.dirname(lock),{recursive:true});
try{fs.mkdirSync(lock);}catch(e){if(e.code==="EEXIST")throw Error("PG_LOCK_BUSY: another line holds "+lock);throw e;}
fs.writeFileSync(path.join(lock,"holder.json"),JSON.stringify({line:"social",holder:token,pid:process.pid,workdir:root,command:"s2-act2-postgres.mjs",startedUtc:new Date().toISOString()},null,2));
const require_=createRequire(import.meta.url),{Client}=require_("pg");
const exe=n=>path.join(bin,n+(process.platform==="win32"?".exe":""));
const run=(n,args)=>{const fd=fs.openSync(path.join(out,"tool-"+n+"-"+Date.now()+".log"),"w");let r;try{r=child.spawnSync(exe(n),args,{stdio:["ignore",fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}if(r.status!==0)throw Error(n+" failed: "+r.stderr+" "+r.stdout);return n==="postgres"?child.execFileSync(exe(n),["--version"],{encoding:"utf8",windowsHide:true}):"";};
const checks=[],connections=new Set();let started=false,ownsOut=false,port,su,db,failed=null;
const check=(name,pass,detail=null)=>{checks.push({name,pass:!!pass,detail});console.log((pass?"PASS ":"FAIL ")+name);assert.ok(pass,name+" "+JSON.stringify(detail));};
const expectDenied=async fn=>{try{await fn();return false;}catch(e){return e.code==="42501";}};
const connect=async user=>{const c=new Client({host:"127.0.0.1",port,user,database:"postgres",connectionTimeoutMillis:10000});c.on("error",()=>{});await c.connect();connections.add(c);return c;};
const close=async c=>{await c.end();connections.delete(c);};
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0"),A=uuid(101),B=uuid(102),C=uuid(103),LEGACY=uuid(104),D=uuid(105),E=uuid(106),F=uuid(107);
const direct=async(role,actor,sql,args=[])=>{const c=await connect(role==="authenticated"?"authenticator":"social_test_executor");try{await c.query("begin");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor??""]);await c.query("set local role "+role);await c.query("set local statement_timeout='10s'");const r=await c.query(sql,args);await c.query("commit");return r.rows;}catch(e){await c.query("rollback");throw e;}finally{await close(c);}};
const txClass=load(path.join(root,"supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts")).SocialRuntimeExecutorTransport;
let txCount=0;const queries=[];
const transport=(beforeCommit=async()=>{},faultOptional=false)=>new txClass({withTransaction:async operation=>{txCount++;
 const c=await connect("social_test_executor");try{await c.query("begin");await c.query("set local role social_runtime_executor");await c.query("set local statement_timeout='10s'");const result=await operation({queryObject:async(text,args)=>{queries.push({text,args});try{if(faultOptional&&text.includes('read_meal_buddy_card_branch_context')){faultOptional=false;await c.query('select 1/0');}return (await c.query(text,args)).rows;}catch(e){console.error("QUERY_ERROR",e.code,e.message);throw e;}}});await beforeCommit();await c.query("commit");return result;}catch(e){await c.query("rollback");throw e;}finally{await close(c);}
},close:async()=>{}});
const config={supabaseUrl:"http://synthetic.invalid",supabaseAnonKey:"synthetic",candidateRefKey:new Uint8Array(32).fill(31),relationshipRefKey:new Uint8Array(32).fill(32),chatRefKey:new Uint8Array(32).fill(33)};
const dependencies=(actor,createTransport=transport)=>({loadConfig:()=>({ok:true,value:config}),authenticateCaller:async()=>actor?{ok:true,value:{userId:actor,userScopedClient:{}}}:{ok:false},createTransport});
const friendHandler=load(path.join(root,"supabase/functions/social-friends/handler.ts")).processSocialFriendsRequest;
const relationHandler=load(path.join(root,"supabase/functions/meal-buddy-relationship/handler.ts")).processMealBuddyRelationshipRequest;
const chatHandler=load(path.join(root,"supabase/functions/meal-buddy-chat/handler.ts")).processMealBuddyChatRequest;
const call=async(handler,actor,body,createTransport=transport)=>{const response=await handler(new Request("http://localhost/local",{method:"POST",body:JSON.stringify(body)}),dependencies(actor,createTransport));return {status:response.status,body:await response.json()};};
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
 const bootstrapSource=fs.readFileSync(path.join(root,"scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"),"utf8"),marker="const BOOTSTRAP = `",start=bootstrapSource.indexOf(marker)+marker.length;
 assert.ok(start>=marker.length);await su.query(bootstrapSource.slice(start,bootstrapSource.indexOf("\n`;",start)));
 // Match real Supabase Auth schema fields absent from this repository's small legacy test stub.
 await su.query("alter table auth.users add column phone text unique,add column phone_confirmed_at timestamptz,add column banned_until timestamptz,add column deleted_at timestamptz,add column email_confirmed_at timestamptz,add column is_anonymous boolean not null default false;create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));grant select on auth.sessions to postgres;alter role postgres bypassrls;");
 // Standard Auth claims function required by the accepted Demo predecessor; no claims are fabricated.
 await su.query(`create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;`);
 db=await connect("postgres");

 const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
 for(const name of migrations){if(name==='20260930174028_consumer_pc2_onboarding_consent_foundation.sql'){await su.query("insert into auth.users(id,email) values($1,'legacy@synthetic.invalid')",[LEGACY]);await db.query("insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key) values($1,'test-legacy','Legacy','Legacy','BG')",[LEGACY]);}const installer=/consumer_retention_entitlement_authority|consumer_retention_acquisition_record|consumer_retention_registry_seal|consumer_retention_billing_fact_ingest/.test(name)?su:db;try{await installer.query(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));}catch(e){throw Error('MIGRATION '+name+' '+e.code+' '+e.message);}}
 check('ACT2 fresh sorted152 migrations apply',migrations.length===152);
 await su.query('create role social_test_executor login noinherit;grant social_runtime_executor to social_test_executor with inherit false,set true;');
 await direct('authenticated',LEGACY,'select public.opt_in_authenticated_social_participation()');
 await db.query('select consumer_internal.require_social($1)',[LEGACY]);
 let legacyDenial;try{await direct('social_runtime_executor',LEGACY,'select stranger_internal.settings($1,true,null)',[LEGACY]);}catch(e){legacyDenial=e.message;}
 check('ACT2 preparation cohort with global eligibility still requires explicit adult',legacyDenial==='STRANGER_ADULT_REQUIRED',legacyDenial);
 await activateDisposableFixture(db);
 for(const [id,name]of [[A,'Alice'],[B,'Bob'],[C,'Cara'],[D,'Dana'],[E,'Ella'],[F,'Faye']]){
  await su.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@synthetic.invalid']);
  await direct('authenticated',id,'select public.complete_authenticated_consumer_account_onboarding($1,$2,true,true,true,$3)',[FIXTURE_BUNDLE.bundleVersion,JSON.stringify(presented()),name]);
  await direct('authenticated',id,'select public.attest_authenticated_social_adult(true)');await direct('authenticated',id,'select public.opt_in_authenticated_social_participation()');
 }
 const qualifiedBefore=await fingerprint();
 const actConfig={supabaseUrl:'http://synthetic.invalid',supabaseAnonKey:'synthetic',strangerKey:new Uint8Array(32).fill(41),cardKey:new Uint8Array(32).fill(42),relationshipKey:config.relationshipRefKey};
 const handler=load(path.join(root,'supabase/functions/stranger-exposure/handler.ts')).processStrangerExposureRequest;
 const api=async(actor,body,make=transport)=>{const response=await handler(new Request('http://localhost/local',{method:'POST',body:JSON.stringify(body)}),{loadConfig:()=>actConfig,verifyIdentity:async()=>actor,createTransport:make});return {status:response.status,body:await response.json()};};
 const anonymous=await api(null,{operation:'read'});check('ACT2 actual endpoint requires verified identity',anonymous.status===401);check('ACT2 closed input rejects client actor/array',(await api(A,{operation:'read',actorUserId:B})).status===400&&(await api(A,{operation:'discover',sourceCardRef:'mbc1.test',candidateIds:[B]})).status===400);
 const read=actor=>api(actor,{operation:'read'}),toggle=async(actor,enabled)=>{const state=await read(actor);assert.equal(state.status,200,JSON.stringify(state));return api(actor,{operation:'set',enabled,revision:state.body.settings.revision});};
 const card=async(actor)=>{const id=randomUUID();await db.query("insert into public.meal_buddy_cards(id,owner_user_id,card_type,intention_type,dining_date,meal_period,expires_at) values($1,$2,'general','chat_first',current_date,'dinner',now()+interval '1 day')",[id,actor]);return id;};
 const ca=await card(A),cb=await card(B),cc=await card(C);
 const cardCipher=load(path.join(root,'supabase/functions/_shared/meal-buddy-card-ref/index.ts')).createMealBuddyCardRefCipher(actConfig.cardKey);
 const source=await cardCipher.seal(A,'source',ca,new Date());
 const discover=(actor=A,ref=source)=>api(actor,{operation:'discover',sourceCardRef:ref});
 check('ACT2 no backfill or settings from old users/cards',(await db.query('select count(*)::int n from stranger_internal.exposure_settings')).rows[0].n===0);
 const firstRead=await read(A);check('ACT2 initial read succeeds',firstRead.status===200,firstRead);check('ACT2 absence defaults disabled',firstRead.body.settings.enabled===false);
 check('ACT2 unopted actor cannot discover',(await discover()).status===403);
 check('ACT2 forged actor refused',await expectDenied(()=>direct('social_runtime_executor',B,'select stranger_internal.settings($1,true,null)',[A])));
 for(const role of ['anon','authenticated','service_role'])check('ACT2 '+role+' no table/helper privileges',(await db.query("select not has_table_privilege($1,'stranger_internal.exposure_settings','select,insert,update,delete') and not has_function_privilege($1,'stranger_internal.settings(uuid,boolean,uuid)','execute') ok",[role])).rows[0].ok);
 check('ACT2 authority NOBYPASS nonowner/no membership',(await db.query("select not rolbypassrls and not rolsuper and not pg_has_role('social_runtime_executor','meal_buddy_stranger_authority','member') and (select pg_get_userbyid(relowner)<>'meal_buddy_stranger_authority' from pg_class where oid='stranger_internal.exposure_settings'::regclass) ok from pg_roles where rolname='meal_buddy_stranger_authority'")).rows[0].ok);
 check('ACT2 explicit enable',(await toggle(A,true)).body.settings.enabled===true);
 
 const a1=(await read(A)).body.settings;check('ACT2 repeated enable idempotent',(await api(A,{operation:'set',enabled:true,revision:a1.revision})).body.settings.revision===a1.revision);
 check('ACT2 no opted targets genuine empty',(await discover()).status===200&&(await discover()).body.candidates.length===0);
 await toggle(B,true);
 const beforeQueries=queries.length,beforeTx=txCount;const found=await discover();
 check('ACT2 actual pipeline only one outer transaction',txCount-beforeTx===1);
 const discoveryQueries=queries.slice(beforeQueries);check('ACT2 no global Taste read before UI filter',!discoveryQueries.some(q=>q.text.includes('canonical_candidate_taste_sources'))&&discoveryQueries.some(q=>q.text.includes('stranger_internal.taste')&&q.args[2].length===1&&q.args[2][0]===B));
 const optional=await api(A,{operation:'discover',sourceCardRef:source},()=>transport(async()=>{},true));check('ACT2 real optional SQL fault retains original fallback',optional.status===200&&optional.body.candidates.length===1&&queries.slice(beforeQueries).some(q=>q.text==='rollback to savepoint stranger_helper'));check('ACT2 real canonical pool Taste rank exposure DTO',found.status===200&&found.body.candidates.length===1,found);
 const ref=found.body.candidates[0].ref;check('ACT2 anonymous platform identity/no raw refs',found.body.candidates[0].label==='匿名飯友'&&found.body.candidates[0].mascotAvatarKey&& !/Alice|Bob|Cara|scr1\.|mbc1\.|userId|publicBio/.test(JSON.stringify(found.body)));
 check('ACT2 profile via current source/ref',(await api(A,{operation:'profile',ref})).status===200);
 const foreignSource=await cardCipher.seal(B,'source',cb,new Date()),forgedOwnerSource=await cardCipher.seal(A,'source',cb,new Date());
 check('ACT2 foreign source reference and ownership both enforced',(await discover(A,foreignSource)).status===400&&(await discover(A,forgedOwnerSource)).status===410);
 check('ACT2 foreign/tampered ref no access',(await api(B,{operation:'profile',ref})).status===400&&(await api(A,{operation:'profile',ref:ref.slice(0,-3)+'bad'})).status===400);
 const oldOpener=load(path.join(root,'supabase/functions/_shared/phone-search-candidate-ref.ts')).openInviteCandidateRef;
 let downgraded=false;try{await oldOpener(load(path.join(root,'supabase/functions/_shared/social-candidate-ref/index.ts')).createSocialCandidateRefCipher(config.candidateRefKey),A,ref,new Date());downgraded=true;}catch{}
 check('ACT2 stranger cannot downgrade ordinary/phone',!downgraded);
 const effects=async()=>JSON.stringify({pairs:(await db.query('select * from public.meal_buddy_relationships order by id')).rows,markers:(await db.query('select * from stranger_internal.pending_invites order by relation_id')).rows,chat:(await db.query('select count(*)::int n from public.meal_buddy_conversations')).rows,messages:(await db.query('select count(*)::int n from public.meal_buddy_messages')).rows,outbox:(await db.query('select count(*)::int n from public.meal_buddy_notification_outbox')).rows,budget:(await db.query('select * from friend_internal.lookup_budget order by user_id')).rows});
 const beforeStop=await effects();await toggle(B,false);
 check('ACT2 stop removes from fresh list',(await discover()).body.candidates.length===0);
 check('ACT2 old profile ref denied after stop',(await api(A,{operation:'profile',ref})).status===403);
 check('ACT2 old ref cannot create after stop',(await api(A,{operation:'send',ref})).status===403&&beforeStop===await effects());
 await toggle(B,true);
 check('ACT2 stopped generation not reused on reopen',(await api(A,{operation:'send',ref})).status===403);
 const ref2=(await discover()).body.candidates[0].ref;
 const sent=await api(A,{operation:'send',ref:ref2});check('ACT2 new invite reuses relationship authority',sent.status===200&&sent.body.relationshipRef.startsWith('mbr1.'),sent);
 await toggle(B,false);const sentEffects=await effects();const replay=await api(A,{operation:'send',ref:ref2});check('ACT2 existing invite replay allowed after stop no new effects',replay.status===200&&sentEffects===await effects());
 const senderInbox=await relation(A,{operation:'list'});check('ACT2 new stranger pending does not unveil name in ordinary inbox',senderInbox.status===200&&senderInbox.body.relationships.every(r=>r.counterpart.displayName==='匿名飯友'));
 const inbox=await relation(B,{operation:'list'});check('ACT2 recipient pending also anonymous',inbox.body.relationships[0].counterpart.displayName==='匿名飯友');const incoming=inbox.body.relationships.find(x=>x.state==='incoming_pending');
 check('ACT2 already-sent invite remains acceptable',(await relation(B,{operation:'accept',relationshipRef:incoming.relationshipRef})).status===200);
 check('ACT2 existing friendship/chat unaffected',(await chat(A,{operation:'open',relationshipRef:sent.body.relationshipRef})).status===200);
 await toggle(B,true);check('ACT2 accepted friends remain ordinary, not anonymous stranger cards',(await discover()).body.candidates.length===0&&(await relation(A,{operation:'list'})).body.relationships.some(x=>x.state==='accepted'&&x.counterpart.displayName==='Bob'));await toggle(B,false);
 await toggle(A,false);check('ACT2 actor stop leaves accepted chat usable',(await chat(A,{operation:'open',relationshipRef:sent.body.relationshipRef})).status===200);await toggle(A,true);
 // Send-first commits before stop, then preserves its existing canonical invitation.
 const cf=await card(F);await toggle(F,true);const fDiscovery=await discover();const strangerCipher=load(path.join(root,'supabase/functions/_shared/stranger-exposure/refs.ts')).createStrangerCipher(actConfig.strangerKey);let fRef;
 for(const item of fDiscovery.body.candidates){if((await strangerCipher.open(A,item.ref,new Date())).target===F)fRef=item.ref;}assert.ok(fRef);
 let enteredSend,releaseSend;const reached=new Promise(r=>enteredSend=r),release=new Promise(r=>releaseSend=r);const sending=api(A,{operation:'send',ref:fRef},()=>transport(async()=>{enteredSend();await release;}));await reached;
 let stopFCompleted=false;const stoppingF=toggle(F,false).then(r=>{stopFCompleted=true;return r;},e=>({status:0,error:e.message}));
 let fWait=false;const fDeadline=Date.now()+5000;while(Date.now()<fDeadline&&!stopFCompleted){fWait=(await su.query("select count(*)::int n from pg_stat_activity where wait_event='advisory'")).rows[0].n>0;if(fWait)break;await new Promise(r=>setTimeout(r,20));}
 const stopWasWaiting=!stopFCompleted&&fWait;releaseSend();const sendFirst=await sending,stopAfterSend=await stoppingF;check('ACT2 send-first stop waits on actual advisory lock',stopWasWaiting,{fWait,sendFirst,stopAfterSend});check('ACT2 send-first survives later stop',sendFirst.status===200&&stopAfterSend.status===200&&(await relation(A,{operation:'list'})).body.relationships.some(x=>x.relationshipRef&&x.state==='outgoing_pending'&&x.counterpart.displayName==='匿名飯友'));
 const fBeforeReplay=await effects();check('ACT2 send-first retry no duplicate after stop',(await api(A,{operation:'send',ref:fRef})).status===200&&fBeforeReplay===await effects());
 const bState=(await read(B)).body.settings;
 check('ACT2 stale enable rejected without mutation',(await api(B,{operation:'set',enabled:true,revision:null})).status===409&&(await read(B)).body.settings.revision===bState.revision);
 await direct('authenticated',C,'select public.attest_authenticated_social_adult(false)');check('ACT2 under18 cannot enable',(await toggle(C,true)).status===403);
 await direct('authenticated',C,'select public.attest_authenticated_social_adult(true)');await direct('authenticated',C,'select public.resume_authenticated_social_participation()');await toggle(C,true);
 await direct('authenticated',C,'select public.pause_authenticated_social_participation()');check('ACT2 consent/social loss can still stop',(await toggle(C,false)).status===200);
 await direct('authenticated',C,'select public.resume_authenticated_social_participation()');await toggle(C,true);
 // SQL-level narrowed Taste rejects an otherwise canonical, opted-out target before private read.
 check('ACT2 bounded Taste rejects opted-out target',await expectDenied(()=>direct('social_runtime_executor',A,'select stranger_internal.taste($1,$2,$3)',[A,ca,[B]])));
 // Membership is the existing canonical table+resolver, not metadata or a new plan database.
 await db.query("insert into public.subscription_entitlements(user_id,plan_code,entitlement_source,status,valid_from) values($1,'premium','TEST_ONLY','active',now()-interval '1 hour')",[C]);
 const photos=await discover();check('ACT2 Premium photo unavailable not mascot fallback',photos.status===200&&photos.body.identityBlocked&&!JSON.stringify(photos.body).includes('Cara'),photos);
 const cSource=await cardCipher.seal(C,'source',cc,new Date());check('ACT2 Premium actor explicit blocked route',(await discover(C,cSource)).status===403&&(await read(C)).body.settings.identity==='photo_unavailable');
 await db.query("update public.subscription_entitlements set plan_code='unknown_test_plan' where user_id=$1",[C]);
 check('ACT2 unknown entitlement never Free',(await discover()).status===503);
 check('ACT2 unknown identity explicit recoverable setting',(await read(C)).body.settings.identity==='unavailable');
 check('ACT2 unknown identity does not block stop',(await toggle(C,false)).status===200);
 await db.query('delete from public.subscription_entitlements where user_id=$1',[C]);await toggle(C,true);
 // Optional SQL error is actually executed on PG, then recovered on the same reserved connection.
 const {scopedReadPort}=load(path.join(root,'supabase/functions/_shared/stranger-exposure/transactionScope.ts'));
 const {defineSocialRuntimeExecutorStatement:stmt}=load(path.join(root,'supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts'));
 const statement=text=>stmt(Object.freeze(Object.assign([text],{raw:Object.freeze([text])})));
 await transport().withTransaction(async tx=>{const scoped=scopedReadPort(tx);let denied=false;try{await scoped.withTransaction(t=>t.query(statement('select 1/0')));}catch(e){denied=e.code==='22012';}const rows=await scoped.withTransaction(t=>t.query(statement('select 1 as value')));check('ACT2 savepoint recovers optional SQL on same tx',denied&&rows[0].value===1);});
 // Real deterministic lock races: stop waits behind exposure read; stop-first rejects delayed send.
 const barrier=await connect('social_test_executor');await barrier.query('begin');await barrier.query('set local role social_runtime_executor');await barrier.query("select set_config('request.jwt.claim.sub',$1,true)",[A]);await barrier.query('select stranger_internal.pool($1,$2)',[A,ca]);
 let stopDone=false;const stopped=toggle(C,false).then(x=>{stopDone=true;return x;});
 await new Promise(r=>setTimeout(r,150));const waitRows=(await su.query("select count(*)::int n from pg_stat_activity where wait_event='advisory' and pid<>pg_backend_pid()")).rows;
 check('ACT2 read-first stop really waits for advisory lock',!stopDone&&waitRows[0].n>0,waitRows);
 await barrier.query('commit');await close(barrier);check('ACT2 waited stop completes',(await stopped).status===200);
 await toggle(C,true);const cRef=(await discover()).body.candidates[0].ref;await toggle(C,false);const beforeLate=await effects();check('ACT2 stop-first delayed send no side effect',(await api(A,{operation:'send',ref:cRef})).status===403&&beforeLate===await effects());
 // Duplicate CAS writes in separate real transactions: one transition, stale competing update fails.
 const off=(await read(C)).body.settings;const both=await Promise.all([api(C,{operation:'set',enabled:true,revision:off.revision}),api(C,{operation:'set',enabled:true,revision:off.revision})]);check('ACT2 concurrent enable one canonical transition',both.filter(x=>x.status===200).length===1&&both.filter(x=>x.status===409).length===1);
 // Exact code and phone sources retain their established source-specific behavior.
 await settings(D,true);const code=(await settings(D)).body.settings.inviteCode;const codeFound=await lookup(E,code,'code');await settings(D,false);check('ACT2 code new purpose keeps send after lookup disable',(await relation(E,{operation:'send',candidateRef:codeFound.body.candidate.candidateRef})).status===200);
 await settings(D,true);await su.query("update auth.users set phone='886912345678',phone_confirmed_at=now() where id=$1",[D]);await reset();const phoneFound=await lookup(F,'0912345678');await settings(D,false);check('ACT2 phone F2 old ref new send still rejected',(await relation(F,{operation:'send',candidateRef:phoneFound.body.candidate.candidateRef})).status===400);
 const ordinary=await load(path.join(root,'supabase/functions/_shared/social-candidate-ref/index.ts')).createSocialCandidateRefCipher(config.candidateRefKey).seal(F,D,new Date());check('ACT2 ambiguous old ordinary cannot create new stranger invite',(await relation(F,{operation:'send',candidateRef:ordinary})).status===400);
 const oldProfile=load(path.join(root,'supabase/functions/meal-buddy-candidate-profile/handler.ts')).processMealBuddyCandidateProfileRequest;
 const oldProfileCall=async(actor,candidateRef)=>{const r=await oldProfile(new Request('http://localhost/local',{method:'POST',body:JSON.stringify({candidateRef})}),dependencies(actor));return {status:r.status,body:await r.json()};};
 check('ACT2 old ordinary profile cannot bypass stopped stranger gate',(await oldProfileCall(F,ordinary)).status===409);
 const knownOrdinary=await load(path.join(root,'supabase/functions/_shared/social-candidate-ref/index.ts')).createSocialCandidateRefCipher(config.candidateRefKey).seal(A,B,new Date());
 check('ACT2 existing friend profile keeps ordinary identity after stop',(await oldProfileCall(A,knownOrdinary)).body.profile.displayName==='Bob');
 check('ACT2 phone profile keeps original source contract after stop',(await oldProfileCall(F,phoneFound.body.candidate.candidateRef)).status===200);
 check('ACT2 code profile recognizes authenticated code source',(await oldProfileCall(E,codeFound.body.candidate.candidateRef)).status===200);
 const oldList=load(path.join(root,'supabase/functions/meal-buddy-candidate-list/handler.ts')).processMealBuddyCandidateListRequest;
 const legacy=await oldList(new Request('http://localhost/local',{method:'POST',body:JSON.stringify({sourceCardRef:source})}),dependencies(A));check('ACT2 legacy v1 public cannot bypass',legacy.status===409);
 await direct('authenticated',A,'select public.create_authenticated_social_block($1)',[C]);check('ACT2 block excludes stranger candidate',(await discover()).body.candidates.length===0);
 await toggle(E,true);await su.query('delete from auth.users where id=$1',[E]);check('ACT2 Auth hard delete cascades only current setting',(await db.query('select count(*)::int n from stranger_internal.exposure_settings where user_id=$1',[E])).rows[0].n===0);
 // Required current qualifications continue to apply while preference remains enabled.
 await direct('authenticated',A,'select public.remove_authenticated_social_block($1)',[C]);
 await db.query("update public.consumer_profiles set status='disabled' where user_id=$1",[C]);check('ACT2 disabled profile cannot disclose card',(await discover()).body.candidates.length===0);await db.query("update public.consumer_profiles set status='active' where user_id=$1",[C]);
 await db.query('update public.consumer_profiles set deleted_at=now() where user_id=$1',[C]);check('ACT2 soft-deleted profile cannot disclose card',(await discover()).body.candidates.length===0);await db.query('update public.consumer_profiles set deleted_at=null where user_id=$1',[C]);
 await su.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[C]);check('ACT2 banned Auth cannot disclose card',(await discover()).body.candidates.length===0);await su.query('update auth.users set banned_until=null where id=$1',[C]);
 const cFresh=(await discover()).body.candidates[0].ref;await db.query('update public.meal_buddy_cards set cancelled_at=now() where id=$1',[cc]);check('ACT2 cancelled card invalidates existing ref',(await api(A,{operation:'profile',ref:cFresh})).status===403);await db.query('update public.meal_buddy_cards set cancelled_at=null where id=$1',[cc]);
 await db.query("update public.meal_buddy_cards set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",[cc]);check('ACT2 expired card invalidates existing ref',(await api(A,{operation:'send',ref:cFresh})).status===403);
 await su.query('delete from auth.users where id=$1',[F]);check('ACT2 pending source marker follows canonical Auth relationship deletion',(await db.query('select count(*)::int n from stranger_internal.pending_invites')).rows[0].n===0);
 check('ACT2 retention/core function bodies unchanged',qualifiedBefore===await fingerprint());
 fs.writeFileSync(path.join(out,'migration-inputs.json'),JSON.stringify(migrations.map(name=>({name,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'supabase/migrations',name))).digest('hex')})),null,2));
}catch(e){failed={message:e.message,stack:e.stack};console.error(e.stack);process.exitCode=1;}
finally{
 for(const c of [...connections])try{await close(c);}catch{}
 if(started)try{run("pg_ctl",["-D",path.join(out,"data"),"-m","fast","stop"]);started=false;}catch(e){failed??={message:"PG_STOP_FAILED "+e.message};process.exitCode=1;}
 if(ownsOut)fs.writeFileSync(path.join(out,"result.json"),JSON.stringify({status:failed?"FAIL_OR_BLOCKED":"PASS",checks,failed,authProviderVerified:false,denoNetworkVerified:false,uiDeviceVerified:false,hosted:false,lockToken:token},null,2));
 // Only release our exact holder after our PG instance has stopped.
 if(!started&&JSON.parse(fs.readFileSync(path.join(lock,"holder.json"),"utf8")).holder===token){fs.unlinkSync(path.join(lock,"holder.json"));fs.rmdirSync(lock);}
 console.log(JSON.stringify({status:failed?"FAIL_OR_BLOCKED":"PASS",checks:checks.length,passed:checks.filter(c=>c.pass).length,failed,output:out}));
}
