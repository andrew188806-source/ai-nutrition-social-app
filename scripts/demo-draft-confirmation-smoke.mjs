import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
const cache = new Map();
function load(file) {
 file=path.resolve(file); if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name.startsWith("."))return load(path.resolve(path.dirname(file),name)+".ts");throw Error(name);},setTimeout,clearTimeout,URL,URLSearchParams,Headers,Response,process},{filename:file});
 return module.exports;
}
const {ConsumerOnboardingController,pc2RouteDestination}=load("apps/mobile/features/consumer-onboarding/controller.ts");
const {parseDemoDraftState}=load("apps/mobile/features/consumer-onboarding/types.ts");
const {isConsumerDemoHost}=load("apps/mobile/features/consumer-onboarding/demoEnvironment.ts");
const {createActorBindingFetchGuard,ACTOR_BINDING_HEADER}=load("apps/mobile/features/consumer-auth/actorBoundDispatch.ts");
const base={documentsAvailable:false,onboardingComplete:false,coreEligible:false,trainingGranted:false,preparationCompatibility:false,ageAttested:false,agePolicyVersion:"social-adult-self-attestation-v1",socialQualified:false,participation:"not_participating",socialEligible:false};
const rows=[],check=(name,pass)=>{assert.ok(pass,name);rows.push({name,pass:true,scope:"LOCAL_CONTRACT_ONLY"});};
const tick=()=>new Promise(r=>setTimeout(r,1));
async function settled(c){for(let i=0;i<2000&&c.getSnapshot().pending;i++)await tick();assert.equal(c.getSnapshot().pending,false);}
function fixture() {
 let actor="fixture-A",failSave=false,failRead=false,malformed=false,delay=null,saveCalls=0,invalidations=0;const saved=new Map(),calls=[];
 function dto(){return {demoEnabled:true,confirmed:saved.has(actor),confirmedAt:saved.get(actor)??null,participationState:{...base,coreEligible:saved.has(actor)}};}
 const port={getCurrentSession:async()=>({ok:true,value:actor?{user:{userId:actor}}:null})};
 const client={rpc(name,args){calls.push({name,args});
  if(name==="confirm_authenticated_demo_draft"){let expected=null;return {setHeader(k,v){assert.equal(k,ACTOR_BINDING_HEADER);expected=v;return this;},then(resolve,reject){const action=async()=>{if(delay)await delay;if(expected!==actor)return {data:null,error:{code:"TKACT0"}};if(failSave)return {data:null,error:{code:"fixture_failure"}};saveCalls++;saved.set(actor,saved.get(actor)??"2026-10-11T00:00:00.000Z");return {data:dto(),error:null};};return action().then(resolve,reject);}};}
  if(name==="get_consumer_demo_environment")return Promise.resolve({data:{demoEnabled:true,projectRef:"msbgnnoorsoefuiwluye"},error:null});
  if(name==="get_authenticated_demo_draft_state"){if(failRead)return Promise.resolve({data:null,error:{code:"fixture_failure"}});const snapshot=dto();return (async()=>{if(delay)await delay;return {data:malformed?{demoEnabled:"true"}:snapshot,error:null};})();}
  if(name==="get_consumer_required_documents")return Promise.resolve({data:{available:false,bundle:null},error:null});
  if(name==="get_authenticated_consumer_participation_state")return Promise.resolve({data:base,error:null});
  throw Error(name);
 }};
 const make=(opts={})=>new ConsumerOnboardingController({authPort:port,client,redirect:null,invalidateAccess:()=>invalidations++,demoModeAllowed:true,timeoutMs:100,...opts});
 return {make,client,saved,calls,dto,port,setActor:v=>actor=v,failSave:v=>failSave=v,failRead:v=>failRead=v,malformed:v=>malformed=v,setDelay:v=>delay=v,get saveCalls(){return saveCalls;},get invalidations(){return invalidations;}};
}
const f=fixture(),c=f.make();f.setActor(null);c.bindScope(null,0);await settled(c);
check("Signed-out environment discovery performs no draft confirmation",f.saveCalls===0&&pc2RouteDestination("restaurants",false,c.getSnapshot())==="/login"&&!c.getSnapshot().demo);
f.setActor("fixture-A");c.bindScope("fixture-A",1);await settled(c);
check("Unconfirmed authenticated actor remains gated",c.getSnapshot().demo?.confirmed===false&&pc2RouteDestination("restaurants",true,c.getSnapshot())==="/onboarding");
f.failSave(true);assert.equal(await c.confirmDemo(),false);
check("Failed save never grants entry or invalidates access",!c.getSnapshot().demo.confirmed&&c.getSnapshot().uncertain&&f.invalidations===0&&f.saveCalls===0);
f.failSave(false);assert.equal(await c.confirmDemo(),true);
check("Successful retry requires a confirmed canonical response and bound actor",c.getSnapshot().demo.confirmed&&c.getSnapshot().state.coreEligible&&!c.getSnapshot().state.trainingGranted&&!c.getSnapshot().state.onboardingComplete&&f.invalidations===1&&f.saveCalls===1);
const firstAt=c.getSnapshot().demo.confirmedAt;assert.equal(await c.refresh(),true);
check("Refresh keeps persisted acknowledgement without another mutation",c.getSnapshot().demo.confirmedAt===firstAt&&f.saveCalls===1);
f.setActor(null);c.bindScope(null,2);await settled(c);f.setActor("fixture-A");c.bindScope("fixture-A",3);await settled(c);
check("Relogin restores account acknowledgement",c.getSnapshot().demo.confirmed&&f.saveCalls===1);
const fresh=f.make();fresh.bindScope("fixture-A",4);await settled(fresh);
check("New controller restores server acknowledgement independent of draft version",fresh.getSnapshot().demo.confirmedAt===firstAt&&pc2RouteDestination("restaurants",true,fresh.getSnapshot())===null);
f.setActor("fixture-B");fresh.bindScope("fixture-B",5);await settled(fresh);
check("A confirmation cannot authorize B",!fresh.getSnapshot().demo.confirmed&&!fresh.getSnapshot().state.coreEligible&&fresh.isBoundTo("fixture-B",5)&&!fresh.isBoundTo("fixture-A",4));
f.failRead(true);assert.equal(await fresh.refresh(),false);
check("Read failure ends loading and denies entry",!fresh.getSnapshot().pending&&fresh.getSnapshot().demoStatus==="error"&&fresh.getSnapshot().uncertain&&pc2RouteDestination("restaurants",true,fresh.getSnapshot())==="/onboarding");
f.failRead(false);f.malformed(true);assert.equal(await fresh.refresh(),false);
check("Malformed server DTO cannot grant Demo trust",fresh.getSnapshot().uncertain&&!fresh.getSnapshot().state);
f.malformed(false);assert.equal(await fresh.refresh(),true);
let release;f.setDelay(new Promise(r=>release=r));const pending=fresh.confirmDemo();await tick();f.setActor("fixture-C");fresh.bindScope("fixture-C",6);release();await pending;await settled(fresh);f.setDelay(null);
check("Changing signer between check and dispatch rejects the save",f.saveCalls===1&&!f.saved.has("fixture-C")&&!fresh.getSnapshot().demo?.confirmed);
let lateRelease;f.setDelay(new Promise(r=>lateRelease=r));const timed=f.make({timeoutMs:5});timed.bindScope("fixture-C",7);await settled(timed);check("Timeout ends loading without restoring stale eligibility",timed.getSnapshot().error==="timeout"&&!timed.getSnapshot().pending&&timed.getSnapshot().uncertain);
lateRelease();await tick();check("Late read after timeout cannot revive eligibility",!timed.getSnapshot().state);f.setDelay(null);
const production=f.make({demoModeAllowed:false});production.bindScope("fixture-C",8);await settled(production);
check("Disabled client Demo mode retains formal canonical gate",!production.getSnapshot().demo&&production.getSnapshot().state.coreEligible===false);
assert.throws(()=>parseDemoDraftState({demoEnabled:true,confirmed:true,confirmedAt:null,participationState:base}));
check("Confirmation DTO requires a valid server timestamp",true);
check("Client host/project gate excludes production and lookalike domains",isConsumerDemoHost({environment:"development",url:"https://msbgnnoorsoefuiwluye.supabase.co",hostname:"haocu-demo.vercel.app"})&&!isConsumerDemoHost({environment:"production",url:"https://msbgnnoorsoefuiwluye.supabase.co",hostname:"haocu-demo.vercel.app"})&&!isConsumerDemoHost({environment:"development",url:"https://other.supabase.co",hostname:"haocu-demo.vercel.app"})&&!isConsumerDemoHost({environment:"development",url:"https://msbgnnoorsoefuiwluye.supabase.co",hostname:"haocu-demo.vercel.app.evil"}));
let forwarded=0;const guard=createActorBindingFetchGuard({supabaseUrl:"https://msbgnnoorsoefuiwluye.supabase.co",inner:async()=>{forwarded++;return new Response("{}",{status:200});}});
const jwt=subject=>"fixture."+Buffer.from(JSON.stringify({sub:subject})).toString("base64url")+".fixture";const request={method:"POST",headers:{[ACTOR_BINDING_HEADER]:"fixture-A",Authorization:"Bearer "+jwt("fixture-B")},body:JSON.stringify({p_confirm:true})};
assert.equal((await guard("https://msbgnnoorsoefuiwluye.supabase.co/rest/v1/rpc/confirm_authenticated_demo_draft",request)).status,409);
check("Final-header signer mismatch blocks all network calls",forwarded===0);
request.headers.Authorization="Bearer "+jwt("fixture-A");assert.equal((await guard("https://msbgnnoorsoefuiwluye.supabase.co/rest/v1/rpc/confirm_authenticated_demo_draft",request)).status,200);
check("Matching signer forwards exactly once; server JWT validation remains required",forwarded===1);
const report={scope:"LOCAL_CONTRACT_ONLY_NOT_HOSTED_OR_BROWSER_ACCEPTANCE",executed:rows.length,passed:rows.length,cases:rows};
if(process.env.TASTKIND_DEMO_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.TASTKIND_DEMO_EVIDENCE_DIR,"demo-contract-results.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
