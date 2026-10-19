import assert from "node:assert/strict";import path from "node:path";import {load} from "./social-friends-test-loader.mjs";
const root=process.cwd(),{parseFriendRequest,processSocialFriendsRequest}=load(path.join(root,"supabase/functions/social-friends/handler.ts"));
const {SocialFriendsRepository,parseFriendResult}=load(path.join(root,"apps/mobile/features/social-friends/repository.ts"));
const {SocialFriendsController}=load(path.join(root,"apps/mobile/features/social-friends/controller.ts"));
const checks=[];const check=(name,pass)=>{assert.ok(pass,name);checks.push(name);console.log("PASS "+name);};
const req=body=>new Request("http://localhost/social-friends",{method:"POST",body:JSON.stringify(body)});
check("strict parser accepts exact code lookup",(await parseFriendRequest(req({operation:"lookup",kind:"code",value:"a".repeat(32)})))?.kind==="code");
for(const body of [{operation:"lookup",kind:"phone",value:["123"]},{operation:"lookup",kind:"phone",value:"123",actorUserId:"spoof"},{operation:"lookup",kind:"phone",value:"x".repeat(81)},{operation:"set_searchable",searchable:"true"},[{operation:"settings"}],{operation:"settings",limit:100}]){
 check("reject spoof/batch/oversize/unknown shape "+checks.length,(await parseFriendRequest(req(body)))===null);
}
check("stream byte cap rejects unbounded payload",(await parseFriendRequest(req({operation:"lookup",kind:"code",value:"食".repeat(3000)})))===null);
const denied=await processSocialFriendsRequest(req({operation:"settings"}),{loadConfig:()=>({ok:true,value:{supabaseUrl:"local",supabaseAnonKey:"test"}}),authenticateCaller:async()=>({ok:false}),createTransport:()=>{throw Error("must_not_run");}});
check("unauthenticated never reaches privileged transport",denied.status===401);
check("client rejects private fields",parseFriendResult({policyVersion:"social-friends-v1",status:"found",candidate:{candidateRef:"scr1.x",displayName:"A",mascotAvatarKey:"BG",phone:"+886912345678"}})===null);
check("client rejects invented plan payload",parseFriendResult({policyVersion:"social-friends-v1",settings:{searchable:true,inviteCode:"a".repeat(32),plan:"free"}})===null);
let invocations=0,captured=null;
const auth={getCurrentSession:async()=>({ok:true,value:{user:{userId:"actor-a"}}})};
let sdkActor="actor-a";
const client={auth:{getSession:async()=>({data:{session:{user:{id:sdkActor},access_token:"test-jwt-a"}},error:null})},functions:{invoke:async(name,options)=>{invocations++;captured=options;return {data:{policyVersion:"social-friends-v1",settings:{searchable:false,inviteCode:"b".repeat(32)}},error:null};}}};
const repo=new SocialFriendsRepository(auth,client);
await repo.execute("actor-a",{operation:"settings"});
check("mobile pins captured actor JWT",captured.headers.Authorization==="Bearer test-jwt-a"&&captured.timeout===15000);
sdkActor="actor-b";await assert.rejects(()=>repo.execute("actor-a",{operation:"set_searchable",searchable:true}));
check("SDK account mismatch never invokes settings write",invocations===1);
let resolve;const controller=new SocialFriendsController({execute:()=>new Promise(r=>resolve=r)}),pending=controller.execute("a",{operation:"settings"});controller.invalidate();resolve({settings:{searchable:true,inviteCode:"c".repeat(32)}});
check("late actor response discarded",await pending===null);
let reject;const staleError=new SocialFriendsController({execute:()=>new Promise((_,r)=>reject=r)}),failed=staleError.execute("a",{operation:"settings"});staleError.invalidate();reject(Error("late"));
check("late actor error discarded",await failed===null);
console.log(JSON.stringify({suite:"social-friends-unit",status:"PASS",checks:checks.length,network:false,postgres:false,authProviderVerified:false}));
