// Exact PC-2 local implementation successor. No legal activation or independent approval claim.
import fs from "node:fs";import path from "node:path";import {createHash} from "node:crypto";import {execFileSync,spawnSync} from "node:child_process";
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
const pc2RawArtifact="docs/planning/pc2-onboarding-preparation/pc2-remediation-raw-output.zip";
const supplementalIgnoredEvidence=root=>fs.existsSync(path.join(root,pc2RawArtifact))?[pc2RawArtifact]:[];
export function pc2ChangedPaths(root=process.cwd()){return [...new Set([...supplementalIgnoredEvidence(root),...lines(git(root,"diff","--name-only",PC2_BASELINE)),...lines(git(root,"ls-files","--others","--exclude-standard"))])].sort();}
export function pc2Record(root=process.cwd()){const s=fs.readFileSync(path.join(root,"scripts/pc2-consumer-onboarding-record.mjs"),"utf8");return JSON.parse(s.match(/\/\/ PC2-SEAL-BEGIN\nconst seal = ([\s\S]*?);\n\/\/ PC2-SEAL-END/)[1]);}
function matchesOriginalPc2(root=process.cwd()){
 try{
  if(spawnSync("git",["merge-base","--is-ancestor",PC2_BASELINE,"HEAD"],{cwd:root,stdio:"ignore"}).status!==0)return false;
  const changed=pc2ChangedPaths(root);if(JSON.stringify(changed)!==JSON.stringify(PC2_ALL_PATHS))return false;
  const r=pc2Record(root),payload=PC2_ALL_PATHS.filter(p=>p!=="scripts/pc2-consumer-onboarding-record.mjs");
  if(r.baseline!==PC2_BASELINE||r.kind!=="EXECUTOR_LOCAL_NOT_PLANNER_ACCEPTANCE"||JSON.stringify(Object.keys(r.sha256).sort())!==JSON.stringify(payload))return false;
  return payload.every(p=>fs.existsSync(path.join(root,p))&&rawSha(fs.readFileSync(path.join(root,p)))===r.sha256[p]);
 }catch{return false;}
}
// Supplemental correction: preserve the original implementation seal as immutable historical evidence.
export const PC2_IMPLEMENTATION="d38e66ad8c8e10d69977873cd815f71aec374cdc";
export const PC2_REMEDIATION_PATHS=Object.freeze([
  "docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md",
  "docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md",
  "docs/planning/pc2-onboarding-preparation/08_VALIDATION_INTEGRITY_REMEDIATION.md",
  "docs/planning/pc2-onboarding-preparation/pc2-remediation-differential.json",
  "docs/planning/pc2-onboarding-preparation/pc2-remediation-raw-output.zip",
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
  "scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-b-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs",
  "scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs",
  "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs",
  "scripts/consumer-ux-u1-guard.mjs",
  "scripts/gqa5-restaurant-read-repair-manifest.mjs",
  "scripts/gqa6r-stable-demo-repair-manifest.mjs",
  "scripts/gqa6r-stable-demo-repair-mutations.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs",
  "scripts/meal-identification-mi-c-a-guard.mjs",
  "scripts/meal-identification-mi-c-d-guard.mjs",
  "scripts/meal-identification-mi-d-a-guard.mjs",
  "scripts/meal-identification-mi-d-b-guard.mjs",
  "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs",
  "scripts/pc1-consumer-closure-guard.mjs",
  "scripts/pc1-consumer-closure-manifest.mjs",
  "scripts/pc2-consumer-onboarding-differential.mjs",
  "scripts/pc2-consumer-onboarding-guard.mjs",
  "scripts/pc2-consumer-onboarding-manifest.mjs",
  "scripts/pc2-consumer-onboarding-mutations.mjs",
  "scripts/pc2-remediation-failure-evidence.mjs",
  "scripts/pc2-remediation-inventory.json",
  "scripts/pc2-remediation-recognition-mutations.mjs",
  "scripts/pc2-remediation-record.json",
  "scripts/pc2-remediation-record.mjs",
  "scripts/pc2-remediation-workspace.cjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-guard.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs",
  "scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-guard.mjs",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-guard.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-guard.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2d-smoke.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
]);
export const pc2AuthorizedPaths=()=>[...new Set([...PC2_ALL_PATHS,...PC2_REMEDIATION_PATHS])].sort();
export function isExactPc2(root=process.cwd()){
 if(matchesOriginalPc2(root))return true;
 try{
  if(spawnSync("git",["merge-base","--is-ancestor",PC2_IMPLEMENTATION,"HEAD"],{cwd:root,stdio:"ignore"}).status!==0)return false;
  const supplement=JSON.parse(fs.readFileSync(path.join(root,"scripts/pc2-remediation-record.json"),"utf8"));
  const inventory=JSON.parse(fs.readFileSync(path.join(root,"scripts/pc2-remediation-inventory.json"),"utf8"));
  if(supplement.implementation!==PC2_IMPLEMENTATION||supplement.kind!=="EXECUTOR_REMEDIATION_NOT_ACCEPTANCE"||JSON.stringify(inventory.paths)!==JSON.stringify(PC2_REMEDIATION_PATHS))return false;
  const delta=[...new Set([...supplementalIgnoredEvidence(root),...lines(git(root,"diff","--name-only",PC2_IMPLEMENTATION)),...lines(git(root,"ls-files","--others","--exclude-standard"))])].sort();
  if(JSON.stringify(delta)!==JSON.stringify(PC2_REMEDIATION_PATHS)||JSON.stringify(pc2ChangedPaths(root))!==JSON.stringify(pc2AuthorizedPaths()))return false;
  const payload=PC2_REMEDIATION_PATHS.filter(p=>p!=="scripts/pc2-remediation-record.json");
  if(JSON.stringify(Object.keys(supplement.sha256).sort())!==JSON.stringify(payload))return false;
  if(!payload.every(p=>fs.existsSync(path.join(root,p))&&rawSha(fs.readFileSync(path.join(root,p)))===supplement.sha256[p]))return false;
  // Every original byte outside this explicit validation correction remains pinned to implementation.
  const recordPath="scripts/pc2-consumer-onboarding-record.mjs",historicalBytes=execFileSync("git",["show",PC2_IMPLEMENTATION+":"+recordPath],{cwd:root,maxBuffer:32*1024*1024});
  const historicalSeal=JSON.parse(historicalBytes.toString("utf8").match(/\/\/ PC2-SEAL-BEGIN\nconst seal = ([\s\S]*?);\n\/\/ PC2-SEAL-END/)[1]);
  return PC2_ALL_PATHS.filter(p=>!PC2_REMEDIATION_PATHS.includes(p)).every(p=>fs.existsSync(path.join(root,p))&&rawSha(fs.readFileSync(path.join(root,p)))===(p===recordPath?rawSha(historicalBytes):historicalSeal.sha256[p]));
 }catch{return false;}
}
// Actual current product evidence. No baseline projection or caller-provided expected hashes.
export function pc2PredecessorEvidence(root,predecessor,roots){
 if(!isExactPc2(root))return null;
 const productDelta=[...new Set([...lines(git(root,"diff","--name-only",predecessor,"--",...roots)),...lines(git(root,"ls-files","--others","--exclude-standard","--",...roots))])].sort();
 const sha256={};for(const p of productDelta)sha256[p]=fs.existsSync(path.join(root,p))?lfSha(fs.readFileSync(path.join(root,p))):null;
 return {predecessorInHistory:spawnSync("git",["merge-base","--is-ancestor",predecessor,"HEAD"],{cwd:root,stdio:"ignore"}).status===0,productDelta,sha256,pc2:true};
}
export function matchesPc2ProductSuccessor(evidence,priorHashes){
 if(!evidence||evidence.pc2!==true||evidence.predecessorInHistory!==true)return false;
 // These hashes come from the immutable implementation, never from a collected/mutated record.
 const original=JSON.parse(execFileSync("git",["show",PC2_IMPLEMENTATION+":scripts/pc2-consumer-onboarding-record.mjs"],{encoding:"utf8",maxBuffer:32*1024*1024}).match(/\/\/ PC2-SEAL-BEGIN\nconst seal = ([\s\S]*?);\n\/\/ PC2-SEAL-END/)[1]);
 const expected={...priorHashes};for(const p of [...PC2_PRODUCT_PATHS,...PC2_MIGRATIONS_PATHS])expected[p]=original.sha256[p];
 const keys=Object.keys(expected).sort(),delta=evidence.productDelta;
 return Array.isArray(delta)&&delta.length===keys.length&&JSON.stringify([...delta].sort())===JSON.stringify(keys)&&keys.every(p=>evidence.sha256?.[p]===expected[p]);
}
// Validate actual candidate source, then return to this guard's original assertions. Never exit/replay.
export async function verifyExactPc2CandidateGuard(root,file){
 if(!PC2_HISTORICAL_GUARD_PATHS.includes(file))throw Error("Unrecognized PC2 guard: "+file);
 if(spawnSync("git",["merge-base","--is-ancestor",PC2_IMPLEMENTATION,"HEAD"],{cwd:root,stdio:"ignore"}).status!==0)return false;
 if(!isExactPc2(root))throw Error("PC2_CANDIDATE_EXACT_INVENTORY_OR_BYTES_REJECTED: "+file);
 const current=spawnSync(process.execPath,[path.join(root,"scripts/pc2-consumer-onboarding-guard.mjs"),"--contracts-only","--root",root],{cwd:root,encoding:"utf8",maxBuffer:32*1024*1024});
 if(current.status!==0)throw Error("PC2_CANDIDATE_CONTRACT_REJECTED: "+current.stdout+current.stderr);
 console.log("PC2_ACTUAL_CANDIDATE_CHECKS "+file+" source="+rawSha(fs.readFileSync(path.join(root,file)))+"; original assertions continue in current tree");
 return true;
}

// Only an independently byte-exact authorized successor can exempt these individually recorded paths.
export function pc2RetainedPaths(text,root=process.cwd()){
 const values=lines(text);if(!isExactPc2(root))return values;
 const allowed=new Set(pc2AuthorizedPaths());return values.filter(p=>!allowed.has(p));
}
