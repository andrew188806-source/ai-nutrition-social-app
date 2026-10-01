#!/usr/bin/env node
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{execFileSync,spawnSync}from'node:child_process';
import{failureEvidence}from'./pc2-remediation-failure-evidence.mjs';
import{pc2AuthorizedPaths,isExactPc2,PC2_IMPLEMENTATION,PC2_BASELINE}from'./pc2-consumer-onboarding-manifest.mjs';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'pc2-current-negatives-')),clone=path.join(dir,'candidate'),checks=[];
const check=(name,pass)=>checks.push({name,pass:!!pass});
try{
 execFileSync('git',['clone','--shared','--quiet',root,clone]);
 execFileSync('git',['config','core.filemode','false'],{cwd:clone});
 // Keep lifecycle metadata stable before/after corrective commit; all executed sources are overlaid from the current candidate.
 execFileSync('git',['checkout','--quiet','--detach',PC2_IMPLEMENTATION],{cwd:clone});
 execFileSync('git',['update-ref','refs/remotes/origin/main',PC2_BASELINE],{cwd:clone});
 for(const p of pc2AuthorizedPaths()){fs.mkdirSync(path.dirname(path.join(clone,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(clone,p));}
 for(const rel of ['node_modules','apps/mobile/node_modules'])if(fs.existsSync(path.join(root,rel))){fs.mkdirSync(path.dirname(path.join(clone,rel)),{recursive:true});fs.symlinkSync(path.join(root,rel),path.join(clone,rel));}
 const run=()=>spawnSync(process.execPath,['scripts/social-candidate-sr2f-guard.mjs'],{cwd:clone,env:{...process.env,NODE_OPTIONS:'--require '+path.join(clone,'scripts/pc2-remediation-workspace.cjs')},encoding:'utf8',maxBuffer:32*1024*1024});
 const control=run();check('control executes current guard assertions after candidate verification',isExactPc2(clone)&&control.stdout.includes('PC2_ACTUAL_CANDIDATE_CHECKS')&&control.stdout.includes('42. the bound authPort'));
 for(const [name,file,mutate]of[
  ['unauthorized candidate composition byte','apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts',b=>Buffer.concat([b,Buffer.from('\n// unauthorized candidate mutation\n')])],
  ['deleted required candidate product','apps/mobile/features/consumer-onboarding/copy.ts',()=>null],
  ['deleted required candidate guard','scripts/consumer-favorites-phase-2x-a-guard.mjs',()=>null]
 ]){const p=path.join(clone,file),original=fs.readFileSync(p),next=mutate(original);if(next===null)fs.unlinkSync(p);else fs.writeFileSync(p,next);const r=run();check(name+' rejected by actual candidate-check path',!isExactPc2(clone)&&r.status!==0&&r.stderr.includes('PC2_CANDIDATE_EXACT_INVENTORY_OR_BYTES_REJECTED')&&!r.stdout.includes('PC2_EXACT_HISTORICAL_EVIDENCE'));fs.writeFileSync(p,original);}
 fs.writeFileSync(path.join(clone,'unauthorized-future-successor.txt'),'synthetic negative control\n');const extra=run();check('extra future path rejected by actual candidate-check path',!isExactPc2(clone)&&extra.status!==0&&extra.stderr.includes('PC2_CANDIDATE_EXACT_INVENTORY_OR_BYTES_REJECTED'));
 fs.unlinkSync(path.join(clone,'unauthorized-future-successor.txt'));
 // Require a newly failed actual assertion, not merely a nonzero exit from an inherited failure.
 for(const [guard,expected,file]of[
  ['restaurant-owner-sold-out-ra-2a-p1-guard.mjs','no predecessor migration is modified by this round','supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql'],
  ['restaurant-owner-sold-out-preview-ra-2a-p1-r1-guard.mjs','no predecessor migration is touched','supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql'],
  ['restaurant-owner-availability-ra-2b-p1-guard.mjs','no predecessor migration is touched by this round','supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql'],
  ['consumer-recommendation-feedback-phase-2y-b-guard.mjs','Working tree clean vs HEAD for frozen file: consumer-recommendation-feedback-phase-2y-a-guard.mjs','scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs'],
  ['consumer-recommendation-feedback-phase-2y-d-a-guard.mjs','Phase 2Y-A frozen: working tree clean (consumer-recommendation-feedback-phase-2y-a-guard.mjs)','scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs'],
  ['consumer-recommendation-feedback-phase-2y-d-b-guard.mjs','D-A final guard remains frozen with 202-check committed-state contract','scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs']
 ]){
  const execute=()=>spawnSync(process.execPath,['scripts/'+guard],{cwd:clone,env:{...process.env,NODE_OPTIONS:'--require '+path.join(clone,'scripts/pc2-remediation-workspace.cjs')},encoding:'utf8',maxBuffer:32*1024*1024});
  const control=execute(),before=failureEvidence(control.stdout??'',control.stderr??'',control.status),p=path.join(clone,file),original=fs.readFileSync(p);
  try{fs.appendFileSync(p,'\n// unauthorized exact-scope negative control\n');const mutant=execute(),after=failureEvidence(mutant.stdout??'',mutant.stderr??'',mutant.status);check(guard+' retains actual outside-seal scope assertion',before.verified&&!before.failedChecks.includes('CHECK:'+expected)&&!isExactPc2(clone)&&after.verified&&after.failedChecks.includes('CHECK:'+expected));}finally{fs.writeFileSync(p,original);}
 }
 const failed=checks.filter(c=>!c.pass);console.log(JSON.stringify({suite:'pc2-remediation-recognition-mutations',total:checks.length,failures:failed.map(c=>c.name),checks,fixtureHead:PC2_IMPLEMENTATION,sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),executedSources:'CURRENT_CANDIDATE_OVERLAY_NOT_HISTORICAL_REPLAY',networkUsed:false}));if(failed.length)process.exitCode=1;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
