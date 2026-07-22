#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { addValidIsolationProof, positiveFixture, validateEvidence } from "./restaurant-performance-p2v-perf-001b-evidence-validator.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const selfPath=fileURLToPath(import.meta.url);
const digest=value=>crypto.createHash("sha256").update(value).digest("hex");
const read=relative=>fs.readFileSync(path.join(root,relative));
const sha=relative=>digest(read(relative));

export const IMPLEMENTATION_PATHS=Object.freeze([
  "scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json",
  "scripts/restaurant-performance-p2v-perf-001b-evidence-validator.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-c01-contract-implementation-guard.mjs"
]);
const migration="supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const EXPECTED_UNTRACKED=Object.freeze([migration,...IMPLEMENTATION_PATHS].sort());
const EXPECTED_HEAD="957be8a5a114d5f818d5f02fbab7f87a534da130";
const EXPECTED_PARENT="a6394ac32702c301016b5cbdef9f03d49a109ea0";

const FROZEN=Object.freeze({
  "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json":"049fddc767ededc7a202beadead885606389d1ebfa0d1bf0dfb2c0e4bf79163c",
  "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md":"e906cdc21917f03a7a899de35c89d812bd0e4e1b6a191afae0c81447df21c39b",
  "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json":"bff5009d76878f2e459ac81db63b0ca935d205b7dc2db198d70285a55c49e5a1",
  "scripts/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-guard.mjs":"c34d8be0e3ab7413102c014670ce6349f86d4f7a2d3635ae65f618b2f8cf728b",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-authority.json":"f7babca2616f5a901a6c5946770029a39630e46f2e168977fa0b31e82abc4430",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-contract.md":"fac68f9258e8a58fcba6392e61e59274ce39efd57aca386c0d477904127b8a5c",
  "scripts/restaurant-performance-p2v-perf-001b-c01-remediation-guard.mjs":"1f92fc6785285fdc4fac09be39d2a69caa3fd4c28a65c1512f8b400ace69af3b",
  "docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md":"81af13e4078a7ed820a7088472ab449b00bc50514fdeef11fdeaecc4170e28f2",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json":"4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade",
  "scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs":"dc18308ff9735fabf266cef0f4591a34bf099bf2527753146000baddee319292",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-authority.json":"ce9236f9a5855b041fa9edb8dc667378e8303168a12b782a1a52510cf1a22067",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-contract.md":"a9429e148c7bbfdb3e13465847a8ef60aafbc8d864344ce8dae8b67fa09ab7c4",
  "scripts/restaurant-performance-p2v-perf-001a-d1-plan-metric-semantics-guard.mjs":"137744cc9282333c691a22e206bec04e32fd540015cc7e6b303f218917687f00",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-authority.json":"a9b6c7669291c6ae8ebd1e09fa50c412c3b5c651b0ba3b511f783f8f4afe4a9f",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-contract.md":"f1b8bd99629e98a2bbf244060bc2c1034942a1e6f687b9137f3778941e17c4d4",
  "scripts/restaurant-performance-p2v-perf-001b-dataset-semantics-guard.mjs":"ac7da82a0870b490e39ad0a953c32ddac66b819ca03058b110ef4ea6ea724601"
});
const IMPLEMENTATION_SHA=Object.freeze({
  "scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs":"bd84ce143a8d1223effae3dedc73b330c023dcfbcfb3354044155bfa3a3a6a78",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json":"14ab4c43e3c13c171be16279cc60de246da544dff9128107c6f119b86a5c511c",
  "scripts/restaurant-performance-p2v-perf-001b-evidence-validator.mjs":"e2c3084f6fcb79a93f5ddb905248f9bf5214368c570fd8dba1cb6fb6e8b8d50d"
});

const git=(...args)=>{const result=spawnSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]});if(result.status!==0)throw new Error(`git ${args.join(" ")} failed`);return result.stdout.trimEnd();};

export function validateCanonicalAuthority(authority) {
  const issues=[];
  const future=authority.authorizedFuturePaths?.map(item=>item.path);
  if(JSON.stringify(future)!==JSON.stringify(IMPLEMENTATION_PATHS))issues.push("future-whitelist");
  if(authority.immutableMigrationCandidatePath!==migration||authority.immutableMigrationCandidateSha256!=="4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72")issues.push("migration-binding");
  if(authority.noRetroactivePass!==true||authority.requiredFreezeBeforeImplementation!==true)issues.push("lifecycle");
  const table=authority.estimateRatioClassifications;
  const ids=["NON_FINITE_OR_UNCLASSIFIED","NON_FINITE_OR_UNCLASSIFIED","ZERO_ESTIMATE_WITH_ACTUAL_ROWS","NON_FINITE_OR_UNCLASSIFIED","EXPECTED_ZERO_ACTUAL_ISOLATION","UNEXPECTED_ZERO_ACTUAL","FINITE_EVALUATED","NON_FINITE_OR_UNCLASSIFIED"];
  if(table?.kind!=="ordered-closed-decision-table"||table?.firstMatchWins!==true||table?.rules?.length!==8||table.rules.some((rule,index)=>rule.order!==index+1||rule.id!==ids[index]))issues.push("8-rule-classifier");
  if(table?.rules?.[6]?.when?.actualRows!=="greater-than-zero"||table?.finiteEvaluatedExcludesZeroActual!==true)issues.push("finite-zero-exclusion");
  if(table?.rules?.[5]?.verdict!=="FAIL"||table?.rules?.[5]?.id!=="UNEXPECTED_ZERO_ACTUAL")issues.push("incomplete-isolation-fail");
  if(table?.isolationProof?.truthySubstitutionProhibited!==true||table?.referenceResolution?.callerSuppliedResolutionFlagsAuthoritative!==false)issues.push("trusted-resolution");
  if(authority.warmAggregationDefinition?.maxSharedHitBlocks?.runs!=="exactly seven measured warm runs"||authority.warmAggregationDefinition?.forbiddenInputs?.includes("cold")!==true)issues.push("warm-only");
  if(authority.directInnerIdentityRequirements?.executionRole!=="exact function owner restaurant_membership_context_reader"||authority.directInnerIdentityRequirements?.postgresSuperuserProhibited!==true||authority.directInnerIdentityRequirements?.bypassRlsProhibited!==true)issues.push("secure-inner");
  return issues;
}

export function validateImplementationSources(runner,schema,validator) {
  const issues=[];
  const requiredRunner=["cold","warm-up-1","warm-up-2","measured-7","secure-direct-inner","COLD_FIRST_SESSION_PLAN_INITIALIZATION","FINITE_EVALUATED","UNEXPECTED_ZERO_ACTUAL","actualRows > 0","planningTimeMs","executionTimeMs","clientWallTimeMs","sessionId","freshTrackReferences","proofComplete","explainSha256"];
  for(const token of requiredRunner)if(!runner.includes(token))issues.push(`runner:${token}`);
  if(!runner.includes("identity.rolsuper !== false")||!runner.includes("identity.rolbypassrls !== false")||!runner.includes("superuser formal threshold evidence prohibited"))issues.push("runner:unsafe-role");
  const casePrefix=schema?.properties?.caseInventory?.prefixItems?.map(item=>item.const);
  const profilePrefix=schema?.properties?.profileInventory?.prefixItems?.map(item=>item.const);
  if(casePrefix?.length!==35||profilePrefix?.length!==9)issues.push("schema:inventory");
  if(schema?.additionalProperties!==false||schema?.$defs?.isolationProof?.additionalProperties!==false||schema?.$defs?.reference?.additionalProperties!==false)issues.push("schema:not-closed");
  if(schema?.$defs?.track?.properties?.measuredWarm?.minItems!==7||schema?.$defs?.track?.properties?.measuredWarm?.maxItems!==7)issues.push("schema:warm-count");
  for(const token of ["loadFrozenTrustRoot","safeRepositoryFile","resolveJsonPointer","resolveTrustedReference","proofComplete","validateJsonSchema","caller fake resolved flag","symlink","canonical array index","assertRunObservation","zero-row metrics/node binding mismatch","trackReferences","trackDisposition===\"PASS\""])if(!validator.includes(token))issues.push(`validator:${token}`);
  if(!validator.includes("actualRows:classification.actualRows")||!validator.includes("isolationProofComplete:complete")||!validator.includes("run.explainSha256!==classification.explainSha256"))issues.push("validator:classifier-binding");
  return issues;
}

export function validateRepository() {
  const checks=[];
  const check=(name,fn)=>{let pass=false,detail="";try{pass=fn()===true;}catch(error){detail=error.message;}checks.push({name,pass,detail});console.log(`${pass?"PASS":"FAIL"} ${name}${detail?` [${detail}]`:""}`);};
  check("main Frozen HEAD and parent",()=>git("branch","--show-current")==="main"&&git("rev-parse","HEAD")===EXPECTED_HEAD&&git("rev-parse","HEAD^")===EXPECTED_PARENT&&git("log","-1","--format=%s")==="Freeze P2V-PERF-001B C01 contract reauthorization");
  check("Git identity",()=>git("config","user.name")==="Andrew"&&git("config","user.email")==="andrew188806@gmail.com");
  check("tracked and staged diffs empty",()=>git("diff","--name-only")===""&&git("diff","--cached","--name-only")==="");
  check("exact five untracked paths",()=>{const actual=git("ls-files","--others","--exclude-standard").split("\n").filter(Boolean).sort();return JSON.stringify(actual)===JSON.stringify(EXPECTED_UNTRACKED);});
  check("all Frozen artifacts byte-identical",()=>Object.entries(FROZEN).every(([file,expected])=>sha(file)===expected));
  check("migration candidate byte-identical",()=>sha(migration)==="4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72");
  check("41 tracked migrations byte-identical to HEAD",()=>git("ls-files","supabase/migrations").split("\n").filter(Boolean).length===41&&git("diff","--name-only","HEAD","--","supabase/migrations")==="");
  check("three externally hash-bound implementation artifacts",()=>Object.entries(IMPLEMENTATION_SHA).every(([file,expected])=>sha(file)===expected));
  const authority=JSON.parse(read("docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json"));
  const markdown=read("docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md").toString("utf8");
  const runner=read(IMPLEMENTATION_PATHS[0]).toString("utf8"),schema=JSON.parse(read(IMPLEMENTATION_PATHS[1])),validator=read(IMPLEMENTATION_PATHS[2]).toString("utf8");
  check("canonical Frozen authority semantics",()=>validateCanonicalAuthority(authority).length===0);
  check("Authority and Markdown exact external anchors",()=>sha("docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json")===FROZEN["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json"]&&sha("docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md")===FROZEN["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md"]&&IMPLEMENTATION_PATHS.every(file=>markdown.includes(`\`${file}\``)));
  check("runner schema validator canonical consistency",()=>validateImplementationSources(runner,schema,validator).length===0);
  check("no package lock tracked authorization",()=>{const tracked=new Set(git("ls-files").split("\n"));return !authority.authorizedFuturePaths.some(item=>item.path==="package.json"||/lock/i.test(item.path)||tracked.has(item.path));});
  check("LF final newline whitespace NUL",()=>[...Object.keys(FROZEN),migration,...IMPLEMENTATION_PATHS].every(file=>{const raw=read(file),text=raw.toString("utf8");return !raw.includes(0)&&!text.includes("\r")&&text.endsWith("\n")&&!text.split("\n").some(line=>/[ \t]+$/.test(line));}));
  check("no credential JWT or target material",()=>{const text=[runner,validator,JSON.stringify(schema)].join("\n");return !/(eyJ[A-Za-z0-9_-]{10,}|service[_ -]?role|password\s*=|postgres(?:ql)?:\/\/|Development target|Production target)/i.test(text);});
  const failures=checks.filter(item=>!item.pass);console.log(`RESULT ${checks.length-failures.length}/${checks.length} ${failures.length?"FAIL":"PASS"}`);return failures.length===0;
}

export function runSelfTest() {
  const results=[];const test=(name,fn)=>{let pass=false;try{pass=fn()===true;}catch{}results.push(pass);console.log(`${pass?"PASS":"FAIL"} SELFTEST ${name}`);};
  const clone=value=>structuredClone(value);const authority=JSON.parse(read("docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json"));
  const mutations=[
    ["classification reorder",a=>a.estimateRatioClassifications.rules.reverse(),"8-rule-classifier"],
    ["ninth classification",a=>a.estimateRatioClassifications.rules.push({order:9,id:"PASS_ALL"}),"8-rule-classifier"],
    ["FINITE accepts zero",a=>a.estimateRatioClassifications.rules[6].when.actualRows="valid-non-negative-number","finite-zero-exclusion"],
    ["incomplete isolation passes",a=>a.estimateRatioClassifications.rules[5].verdict="SEMANTIC_NA","incomplete-isolation-fail"],
    ["caller flags trusted",a=>a.estimateRatioClassifications.referenceResolution.callerSuppliedResolutionFlagsAuthoritative=true,"trusted-resolution"],
    ["fifth future path",a=>a.authorizedFuturePaths.push({path:"scripts/fifth.mjs"}),"future-whitelist"],
    ["tracked path authorized",a=>a.authorizedFuturePaths[0].path="package.json","future-whitelist"],
    ["lockfile authorized",a=>a.authorizedFuturePaths[0].path="package-lock.json","future-whitelist"]
  ];
  for(const [name,mutate,issue] of mutations)test(`reject ${name}`,()=>{const value=clone(authority);mutate(value);return validateCanonicalAuthority(value).includes(issue);});
  const runner=read(IMPLEMENTATION_PATHS[0]).toString("utf8"),schema=JSON.parse(read(IMPLEMENTATION_PATHS[1])),validator=read(IMPLEMENTATION_PATHS[2]).toString("utf8");
  test("reject Authority and Markdown synchronized unsafe modification",()=>{const value=clone(authority);value.authorizedFuturePaths.push({path:"scripts/fifth.mjs"});const synchronized=`${JSON.stringify(value)}\n${IMPLEMENTATION_PATHS.concat("scripts/fifth.mjs").join("\n")}`;return digest(Buffer.from(JSON.stringify(value)))!==FROZEN["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json"]&&digest(Buffer.from(synchronized))!==FROZEN["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md"]&&validateCanonicalAuthority(value).includes("future-whitelist");});
  test("reject schema unknown authorization field",()=>{const value=clone(schema);value.$defs.reference.additionalProperties=true;return validateImplementationSources(runner,value,validator).includes("schema:not-closed");});
  test("reject validator caller-trust regression",()=>validateImplementationSources(runner,schema,validator.replaceAll("resolveTrustedReference","trustedCallerFlag")).some(issue=>issue.startsWith("validator:")));
  const rejects=fn=>{try{fn();return false;}catch{return true;}};
  const positive=positiveFixture(root), isolation=addValidIsolationProof(clone(positive),root);
  test("accept complete evidence",()=>validateEvidence(positive,root));
  test("accept complete semantically bound isolation proof",()=>validateEvidence(isolation,root));
  const evidenceMutations=[
    ["incomplete isolation proof",v=>delete v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].isolationProof.claimsFrozenDatasetReference],
    ["proof metric detached",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].isolationProof.actualLoops+=1],
    ["plan node detached from EXPLAIN",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.planNodes[0].planRows+=1],
    ["EXPLAIN digest detached",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].explainSha256="0".repeat(64)],
    ["FAIL track under PASS",v=>v.suites[0].cases[0].tracks.inner.trackDisposition="FAIL"],
    ["run PID session mismatch",v=>v.suites[0].cases[0].tracks.inner.cold.backendPid+=1],
    ["suite fresh backend reference mismatch",v=>v.suites[0].freshBackendProof.trackReferences[1].secondSessionId="caller-session"],
    ["FINITE zero-row classification",v=>{const c=v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0];c.classification="FINITE_EVALUATED";c.verdict="APPLY_EXISTING_FROZEN_THRESHOLD";}]
  ];
  for(const [name,mutate] of evidenceMutations)test(`reject ${name}`,()=>{const value=clone(isolation);mutate(value);return rejects(()=>validateEvidence(value,root));});
  const temp=fs.mkdtempSync("/tmp/p2v-perf-001b-implementation-negative-");
  try { for(const file of [...Object.keys(FROZEN),migration,...IMPLEMENTATION_PATHS]){const destination=path.join(temp,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,file),destination);}fs.appendFileSync(path.join(temp,IMPLEMENTATION_PATHS[0]),"// adversarial mutation\n");test("independent copy runner SHA mismatch",()=>digest(fs.readFileSync(path.join(temp,IMPLEMENTATION_PATHS[0])))!==IMPLEMENTATION_SHA[IMPLEMENTATION_PATHS[0]]); } finally {fs.rmSync(temp,{recursive:true,force:true});console.log(`SELFTEST TEMP CLEANED ${temp}`);}
  const pass=results.every(Boolean);console.log(`SELFTEST RESULT ${results.filter(Boolean).length}/${results.length} ${pass?"PASS":"FAIL"}`);return pass;
}

function expectedSelfSha(args){const index=args.indexOf("--expected-self-sha256");if(index<0||!args[index+1]||!/^[0-9a-f]{64}$/.test(args[index+1]))throw new Error("--expected-self-sha256 requires 64 lowercase hexadecimal characters");if(digest(fs.readFileSync(selfPath))!==args[index+1])throw new Error("implementation guard self SHA-256 mismatch");return args.filter((_,position)=>position!==index&&position!==index+1);}

try {
  const args=expectedSelfSha(process.argv.slice(2));
  if(args.length===0)process.exitCode=validateRepository()?0:1;
  else if(args.length===1&&args[0]==="--self-test"){const positive=validateRepository();const negative=runSelfTest();process.exitCode=positive&&negative?0:1;}
  else throw new Error("Usage: implementation-guard.mjs --expected-self-sha256 <sha> [--self-test]");
} catch(error){console.error(`P2V-PERF-001B C01 CONTRACT IMPLEMENTATION GUARD FAIL: ${error.message}`);process.exitCode=1;}
