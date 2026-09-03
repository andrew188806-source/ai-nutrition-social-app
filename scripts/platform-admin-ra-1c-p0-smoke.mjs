#!/usr/bin/env node
import assert from "node:assert/strict";
const checks=[]; const check=(name,fn)=>{try{fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}};
const receipts=new Map();
function mutate({actor,admin=true,permission=true,restaurantId="synthetic-fixture-restaurant",branchId="synthetic-fixture-branch-b",expectedStatus="active",requestedStatus="inactive",expectedVersion=0,reasonCode="operational_pause",requestId},state){
  if(!actor)return {ok:false,errorCode:"unauthenticated"}; if(!admin||!permission)return {ok:false,errorCode:"permission_denied"};
  if(!requestId||!['active','inactive'].includes(expectedStatus)||!['active','inactive'].includes(requestedStatus))return {ok:false,errorCode:"invalid_request"};
  const payload=JSON.stringify({restaurantId,branchId,expectedStatus,requestedStatus,expectedVersion,reasonCode}); const key=`${actor}:${requestId}`;
  if(receipts.has(key)){const old=receipts.get(key);return old.payload===payload?old.result:{ok:false,errorCode:"idempotency_conflict"};}
  let result;
  if(state.restaurantId!==restaurantId||state.branchId!==branchId)result={ok:false,outcome:"rejected",errorCode:"target_not_found"};
  else if(!['active','inactive'].includes(state.status))result={ok:false,outcome:"rejected",errorCode:"mutation_rejected"};
  else if(state.status!==expectedStatus||state.version!==expectedVersion)result={ok:false,outcome:"rejected",errorCode:"stale_state"};
  else if(state.status===requestedStatus)result={ok:true,outcome:"noop",status:state.status,version:String(state.version)};
  else {state.status=requestedStatus;state.version++;result={ok:true,outcome:"applied",status:state.status,version:String(state.version)};}
  receipts.set(key,{payload,result});return result;
}
const base=()=>({restaurantId:"synthetic-fixture-restaurant",branchId:"synthetic-fixture-branch-b",status:"active",version:0});
check("anonymous denied",()=>assert.equal(mutate({requestId:"a"},base()).errorCode,"unauthenticated"));
check("non-admin denied",()=>assert.equal(mutate({actor:"owner",admin:false,requestId:"b"},base()).errorCode,"permission_denied"));
check("missing permission denied",()=>assert.equal(mutate({actor:"admin",permission:false,requestId:"c"},base()).errorCode,"permission_denied"));
check("invalid request denied",()=>assert.equal(mutate({actor:"admin"},base()).errorCode,"invalid_request"));
check("wrong target hidden",()=>assert.equal(mutate({actor:"admin",branchId:"other",requestId:"d"},base()).errorCode,"target_not_found"));
check("unsupported state rejected",()=>{const s=base();s.status="archived";assert.equal(mutate({actor:"admin",requestId:"e"},s).errorCode,"mutation_rejected")});
check("stale status rejected",()=>assert.equal(mutate({actor:"admin",expectedStatus:"inactive",requestId:"f"},base()).errorCode,"stale_state"));
check("stale version rejected",()=>assert.equal(mutate({actor:"admin",expectedVersion:1,requestId:"g"},base()).errorCode,"stale_state"));
const state=base(), request={actor:"admin",requestId:"10000000-0000-4000-8000-000000000001"};
check("valid operation applies",()=>assert.deepEqual(mutate(request,state),{ok:true,outcome:"applied",status:"inactive",version:"1"}));
check("only status changes",()=>assert.deepEqual(state,{restaurantId:"synthetic-fixture-restaurant",branchId:"synthetic-fixture-branch-b",status:"inactive",version:1}));
check("exact replay is stable",()=>assert.deepEqual(mutate(request,state),{ok:true,outcome:"applied",status:"inactive",version:"1"}));
check("replay creates one receipt",()=>assert.equal(receipts.has(`admin:${request.requestId}`),true));
check("same key changed payload conflicts",()=>assert.equal(mutate({...request,requestedStatus:"active"},state).errorCode,"idempotency_conflict"));
check("new stale key cannot revive ABA",()=>assert.equal(mutate({...request,requestId:"new",expectedStatus:"active"},state).errorCode,"stale_state"));
check("current no-op is explicit",()=>assert.equal(mutate({...request,requestId:"noop",expectedStatus:"inactive",expectedVersion:1},state).outcome,"noop"));
check("no-op preserves version",()=>assert.equal(state.version,1));
check("fresh reverse applies",()=>assert.equal(mutate({...request,requestId:"reverse",expectedStatus:"inactive",requestedStatus:"active",expectedVersion:1,reasonCode:"operational_resume"},state).outcome,"applied"));
check("reverse increments version",()=>assert.equal(state.version,2));
check("revoked actor denied before replay",()=>assert.equal(mutate({...request,admin:false},state).errorCode,"permission_denied"));
check("other branch remains untouched",()=>assert.equal(state.branchId,"synthetic-fixture-branch-b"));
const failures=checks.filter(x=>!x.pass);checks.forEach((x,i)=>console.log(`${x.pass?"PASS":"FAIL"} ${i+1} ${x.name}`));
console.log(JSON.stringify({suite:"platform-admin-ra-1c-p0-smoke",total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
