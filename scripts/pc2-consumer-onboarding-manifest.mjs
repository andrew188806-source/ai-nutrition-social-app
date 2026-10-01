// Exact PC-2 local implementation successor. No legal activation or independent approval claim.
import fs from "node:fs";import os from "node:os";import path from "node:path";import {createHash} from "node:crypto";import {execFileSync,spawnSync} from "node:child_process";
export const PC2_BASELINE="30268ee4de59a8d8855c1dcaa01795d2f1ce33b1";
export const PC2_PRODUCT_PATHS=Object.freeze([
  "apps/mobile/app/login.tsx",
  "apps/mobile/app/onboarding.tsx",
  "apps/mobile/app/consent-document.tsx",
  "apps/mobile/app/auth-callback.tsx",
  "apps/mobile/app/participation-settings.tsx",
  "apps/mobile/app/account-support.tsx",
  "apps/mobile/app/me.tsx",
  "apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts",
  "apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts",
  "apps/mobile/features/consumer-auth/supabaseAuthContracts.ts",
  "apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts",
  "apps/mobile/features/consumer-auth/supabaseProfileContracts.ts",
  "apps/mobile/features/consumer-auth/supabaseProfileMappers.ts",
  "apps/mobile/features/consumer-auth/sessionStateStore.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-onboarding/types.ts",
  "apps/mobile/features/consumer-onboarding/controller.ts",
  "apps/mobile/features/consumer-onboarding/ConsumerOnboardingProvider.tsx",
  "apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx",
  "apps/mobile/features/consumer-onboarding/copy.ts",
  "apps/mobile/features/consumer-onboarding/authRedirect.ts",
  "supabase/functions/_shared/auth/authenticateCaller.ts"
]);
export const PC2_MIGRATIONS_PATHS=Object.freeze([
  "supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql",
  "supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql"
]);
export const PC2_DOCS_PATHS=Object.freeze([
  "docs/planning/pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md",
  "docs/planning/pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md",
  "docs/planning/pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md",
  "docs/planning/pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md",
  "docs/planning/pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md",
  "docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md",
  "docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md"
]);
export const PC2_VALIDATION_PATHS=Object.freeze([
  "scripts/pc2-consumer-onboarding-manifest.mjs",
  "scripts/pc2-consumer-onboarding-record.mjs",
  "scripts/pc2-consumer-onboarding-guard.mjs",
  "scripts/pc2-consumer-onboarding-smoke.mjs",
  "scripts/pc2-consumer-onboarding-postgres.mjs",
  "scripts/pc2-consumer-onboarding-fixtures.mjs",
  "scripts/pc2-consumer-onboarding-mutations.mjs",
  "scripts/pc2-consumer-onboarding-differential.mjs",
  "scripts/pc2-consumer-onboarding-validation.json"
]);
export const PC2_HISTORICAL_GUARD_PATHS=Object.freeze([
  "scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs",
  "scripts/consumer-favorites-phase-2x-a-guard.mjs",
  "scripts/consumer-favorites-phase-2x-b-guard.mjs",
  "scripts/consumer-favorites-phase-2x-c-a-guard.mjs",
  "scripts/consumer-favorites-phase-2x-c-b-guard.mjs",
  "scripts/consumer-favorites-phase-2x-d-a-guard.mjs",
  "scripts/consumer-favorites-phase-2x-d-b-guard.mjs",
  "scripts/consumer-favorites-phase-2x-e-guard.mjs",
  "scripts/consumer-ratings-phase-2w-a-guard.mjs",
  "scripts/consumer-ratings-phase-2w-b-guard.mjs",
  "scripts/consumer-ratings-phase-2w-c-guard.mjs",
  "scripts/consumer-ratings-phase-2w-e-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs",
  "scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs",
  "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs",
  "scripts/consumer-ux-u1-guard.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs",
  "scripts/meal-identification-mi-c-a-guard.mjs",
  "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-guard.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
]);
export const PC2_RECOGNITION_PATHS=Object.freeze([
  ...PC2_HISTORICAL_GUARD_PATHS,
  "scripts/consumer-profile-phase-1d-guard.mjs",
  "scripts/consumer-auth-phase-1c-guard.mjs",
  "scripts/pc1-consumer-closure-manifest.mjs",
  "scripts/pc1-consumer-closure-guard.mjs",
  "scripts/gqa6r-stable-demo-repair-manifest.mjs",
  "scripts/gqa6r-stable-demo-repair-guard.mjs",
  "scripts/restaurant-catalog-authoring-r2b-guard.mjs",
  "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs",
  "scripts/admin-operational-read-permissions-ae1-guard.mjs",
  "scripts/admin-dashboard-social-policies-d-guard.mjs",
  "scripts/admin-operational-review-queues-c-guard.mjs",
  "scripts/gqa5-restaurant-read-repair-manifest.mjs"
]);
export const PC2_ALL_PATHS=Object.freeze([...PC2_PRODUCT_PATHS,...PC2_MIGRATIONS_PATHS,...PC2_DOCS_PATHS,...PC2_VALIDATION_PATHS,...PC2_RECOGNITION_PATHS].sort());
export const rawSha=bytes=>createHash("sha256").update(bytes).digest("hex");
export const lfSha=bytes=>rawSha(Buffer.from(bytes.toString("utf8").replace(/\r\n/g,"\n")));
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","ignore"],maxBuffer:32*1024*1024}).trim();
const lines=s=>s.split(/\r?\n/).filter(Boolean);
export function pc2ChangedPaths(root=process.cwd()){return [...new Set([...lines(git(root,"diff","--name-only",PC2_BASELINE)),...lines(git(root,"ls-files","--others","--exclude-standard"))])].sort();}
export function pc2Record(root=process.cwd()){const s=fs.readFileSync(path.join(root,"scripts/pc2-consumer-onboarding-record.mjs"),"utf8");return JSON.parse(s.match(/\/\/ PC2-SEAL-BEGIN\nconst seal = ([\s\S]*?);\n\/\/ PC2-SEAL-END/)[1]);}
export function isExactPc2(root=process.cwd()){
 try{
  if(spawnSync("git",["merge-base","--is-ancestor",PC2_BASELINE,"HEAD"],{cwd:root,stdio:"ignore"}).status!==0)return false;
  const changed=pc2ChangedPaths(root);if(JSON.stringify(changed)!==JSON.stringify(PC2_ALL_PATHS))return false;
  const r=pc2Record(root),payload=PC2_ALL_PATHS.filter(p=>p!=="scripts/pc2-consumer-onboarding-record.mjs");
  if(r.baseline!==PC2_BASELINE||r.kind!=="EXECUTOR_LOCAL_NOT_PLANNER_ACCEPTANCE"||JSON.stringify(Object.keys(r.sha256).sort())!==JSON.stringify(payload))return false;
  return payload.every(p=>fs.existsSync(path.join(root,p))&&rawSha(fs.readFileSync(path.join(root,p)))===r.sha256[p]);
 }catch{return false;}
}
// Reconstruct a historical product-only proof from the fixed Git baseline ONLY after the entire
// current PC-2 delta is exact. An extra future path or one changed byte refuses this seam.
export function pc2PredecessorEvidence(root,predecessor,roots){
 if(!isExactPc2(root))return null;
 const productDelta=lines(git(root,"diff","--name-only",predecessor,PC2_BASELINE,"--",...roots));const sha256={};
 for(const p of productDelta)sha256[p]=lfSha(Buffer.from(execFileSync("git",["show",`${PC2_BASELINE}:${p}`],{cwd:root,maxBuffer:32*1024*1024})));
 return {predecessorInHistory:true,productDelta,sha256};
}

// Exact local successor branch for the individually frozen historical guards ONLY.
// Validates current PC-2 contracts, then labels ORIGINAL baseline results as predecessor evidence.
// It never claims those old assertions describe changed current runtime behavior.
export async function runExactPc2PredecessorGuard(root,file){
 if(!PC2_HISTORICAL_GUARD_PATHS.includes(file)||!isExactPc2(root))return false;
 const current=spawnSync(process.execPath,[path.join(root,"scripts/pc2-consumer-onboarding-guard.mjs"),"--contracts-only","--root",root],{cwd:root,encoding:"utf8",maxBuffer:32*1024*1024});
 if(current.status!==0){await new Promise(resolve=>process.stdout.write(current.stdout??"",resolve));await new Promise(resolve=>process.stderr.write(current.stderr??"",resolve));process.exit(1);}
 const snapshot=fs.mkdtempSync(path.join(os.tmpdir(),"pc2-predecessor-evidence-"));let result;
 try{
  const archive=execFileSync("git",["archive",PC2_BASELINE],{cwd:root,maxBuffer:64*1024*1024});
  execFileSync("tar",["-xf","-","-C",snapshot],{input:archive});
  const command=(...args)=>execFileSync("git",args,{cwd:snapshot,stdio:["ignore","pipe","pipe"]});
  command("init","--initial-branch=main","--quiet");
  const objects=path.resolve(root,git(root,"rev-parse","--git-path","objects"));
  fs.mkdirSync(path.join(snapshot,".git/objects/info"),{recursive:true});fs.writeFileSync(path.join(snapshot,".git/objects/info/alternates"),objects+"\n");
  command("update-ref","refs/heads/main",PC2_BASELINE);command("update-ref","refs/remotes/origin/main",PC2_BASELINE);command("read-tree",PC2_BASELINE);command("remote","add","origin",root);
  for(const rel of ["node_modules","apps/mobile/node_modules","apps/admin-web/node_modules","apps/restaurant-web/node_modules"]){const installed=path.join(root,rel);if(fs.existsSync(installed)){fs.mkdirSync(path.dirname(path.join(snapshot,rel)),{recursive:true});fs.symlinkSync(installed,path.join(snapshot,rel),"dir");}}
  if(git(snapshot,"status","--porcelain"))throw Error("Historical evidence snapshot must be clean");
  result=spawnSync(process.execPath,[path.join(snapshot,file)],{cwd:snapshot,encoding:"utf8",maxBuffer:32*1024*1024,timeout:600000,env:process.env});
  // Normalize only the disposable root in raw diagnostic errors; preserve the missing relative file.
  console.log("PC2_EXACT_HISTORICAL_EVIDENCE "+file+" baseline="+PC2_BASELINE+"; current successor contracts passed; independent Planner acceptance pending");
  await new Promise(resolve=>process.stdout.write((result.stdout??"").split(snapshot).join("<ISOLATED_TREE>"),resolve));await new Promise(resolve=>process.stderr.write((result.stderr??"").split(snapshot).join("<ISOLATED_TREE>"),resolve));
 }finally{fs.rmSync(snapshot,{recursive:true,force:true});}
 process.exit(result?.status??1);
}
