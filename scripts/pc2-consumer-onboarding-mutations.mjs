#!/usr/bin/env node
import fs from "node:fs";import path from "node:path";import os from "node:os";import {execFileSync,spawnSync} from "node:child_process";
import {PC2_ALL_PATHS,isExactPc2} from "./pc2-consumer-onboarding-manifest.mjs";
const root=process.cwd(),guard=path.join(root,"scripts/pc2-consumer-onboarding-guard.mjs"),base=fs.mkdtempSync(path.join(os.tmpdir(),"pc2-mutations-"));
const foundation="supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql",gates="supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql";
const cases=[
 ["explicit false age cannot use legacy Social fallback",foundation,"and not exists(select 1 from consumer_internal.social_age_qualifications a where a.user_id=p_owner)","and true","explicit false age overrides preparation compatibility"],
 ["required training made optional",foundation,"p_grant_training is distinct from true","p_grant_training is distinct from false","all three consents mandatory explicit including training"],
 ["document binding mutable",foundation,"raise exception 'PC2_DOCUMENT_BINDING_IMMUTABLE'","return new; -- 'PC2_MUTABLE'","registry immutable independent approval publication and effective binding"],
 ["private RLS weakened",foundation,"force row level security","disable row level security","private tables FORCE RLS and explicit revoke"],
 ["RPC gate removed",gates,"perform consumer_internal.require_core(auth.uid());","-- removed core boundary","core RPCs independently gated before preserved bodies"],
 ["direct card participation bypass",gates,"perform consumer_internal.require_social(p_actor_user_id);","-- removed direct card gate","Social candidate both subjects and direct card WRITE gate"],
 ["candidate age bypass",gates,"and consumer_internal.social_qualified(candidate.user_id)","and true","Social candidate both subjects and direct card WRITE gate"],
 ["withdrawal skips explicit suspension",foundation,"update public.social_participation set state='paused'","update public.social_participation set state='opted_in'","owner consent lock and fixed withdrawal Social pause"],
 ["storage direct API bypass",gates,"create policy pc2_photo_access","create policy changed_photo_policy","authenticated core read/write and Storage policies present"],
 ["Edge malformed eligibility admitted","supabase/functions/_shared/auth/authenticateCaller.ts","eligibility.data?.coreEligible !== true","eligibility.data?.coreEligible === false","Consumer Edge cannot skip caller eligibility before privileged work"],
 ["consent prechecked","apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx","[training, setTraining] = useState(false)","[training, setTraining] = useState(true)","required boxes unchecked"]
];
const checks=[];
try{
 for(const p of PC2_ALL_PATHS){fs.mkdirSync(path.dirname(path.join(base,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(base,p));}
 const control=spawnSync(process.execPath,[guard,"--contracts-only","--root",base],{cwd:root,encoding:"utf8"});if(control.status!==0)throw Error("semantic mutation control must pass: "+control.stdout);
 for(const [name,p,from,to,expected] of cases){const file=path.join(base,p),original=fs.readFileSync(file,"utf8");if(!original.includes(from))throw Error("unapplied mutation "+name);fs.writeFileSync(file,original.replaceAll(from,to));const r=spawnSync(process.execPath,[guard,"--contracts-only","--root",base],{cwd:root,encoding:"utf8"});fs.writeFileSync(file,original);const pass=r.status===1&&r.stdout.includes("FAIL "+expected);checks.push({name,pass});console.log(`${pass?"PASS":"FAIL"} ${name}`);if(!pass)throw Error(name);}
 // Exact successor tests run only in a disposable clone; product bytes are never mutated.
 const clone=path.join(base,"exact-clone");execFileSync("git",["clone","--shared","--no-hardlinks",root,clone],{stdio:"ignore"});
 for(const p of PC2_ALL_PATHS){fs.mkdirSync(path.dirname(path.join(clone,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(clone,p));}
 if(!isExactPc2(clone))throw Error("exact mutation control must match sealed PC2");checks.push({name:"exact isolated successor control accepted",pass:true});
 for(const rel of ["node_modules","apps/mobile/node_modules"]){if(fs.existsSync(path.join(root,rel))){fs.mkdirSync(path.dirname(path.join(clone,rel)),{recursive:true});fs.symlinkSync(path.join(root,rel),path.join(clone,rel),"dir");}}
 const historical="scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs";
 const exactControl=spawnSync(process.execPath,[historical],{cwd:clone,encoding:"utf8",maxBuffer:32*1024*1024});
 if(!exactControl.stdout.includes("PC2_EXACT_HISTORICAL_EVIDENCE"))throw Error("actual historical branch control missing: "+exactControl.stdout+exactControl.stderr);checks.push({name:"actual exact historical branch preserves labelled original baseline result",pass:true});
 const large=spawnSync(process.execPath,["scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs"],{cwd:clone,encoding:"utf8",maxBuffer:32*1024*1024,env:process.env});
 let complete=null;for(const match of large.stdout.matchAll(/(?:^|\n)\s*\{/g)){try{complete=JSON.parse(large.stdout.slice(match.index).trim());}catch{}}
 if(!large.stdout.includes("PC2_EXACT_HISTORICAL_EVIDENCE")||complete?.totalChecks!==76||!Array.isArray(complete.failedChecks))throw Error("Historical large JSON must be flushed completely: "+large.stdout+large.stderr);checks.push({name:"large historical JSON fully delivered before exit without masking inherited failure",pass:true});
 const file=path.join(clone,"apps/mobile/features/consumer-onboarding/copy.ts"),original=fs.readFileSync(file);
 fs.writeFileSync(file,Buffer.concat([original,Buffer.from("\n// unauthorized byte\n")]));if(isExactPc2(clone))throw Error("changed byte accepted");checks.push({name:"changed byte cannot claim exact successor",pass:true});
 const wrongBytes=spawnSync(process.execPath,[historical],{cwd:clone,encoding:"utf8",maxBuffer:32*1024*1024});if(wrongBytes.stdout.includes("PC2_EXACT_HISTORICAL_EVIDENCE"))throw Error("changed byte delegated historical evidence");checks.push({name:"changed byte disables actual historical delegation",pass:true});fs.writeFileSync(file,original);
 fs.writeFileSync(path.join(clone,"unauthorized-future-successor.txt"),"SYNTHETIC inventory mutation\n");if(isExactPc2(clone))throw Error("extra path accepted");checks.push({name:"extra future path cannot claim exact successor",pass:true});
 const extraPath=spawnSync(process.execPath,[historical],{cwd:clone,encoding:"utf8",maxBuffer:32*1024*1024});if(extraPath.stdout.includes("PC2_EXACT_HISTORICAL_EVIDENCE"))throw Error("extra future path delegated historical evidence");checks.push({name:"extra future path disables actual historical delegation",pass:true});
 console.log(JSON.stringify({suite:"pc2-consumer-onboarding-mutations",total:checks.length,failed:0,checks,networkUsed:false}));
}finally{fs.rmSync(base,{recursive:true,force:true});}
