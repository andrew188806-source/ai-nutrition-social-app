#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CASE_IDS, PROFILE_IDS, CONTRACT, aggregateTrack, assertSecureIdentity, classifyEstimateRatio, extractExplainObservation, loadFrozenMatrix, rawPlanNodes, validateDiscardSequence } from "./restaurant-performance-p2v-perf-001b-formal-runner.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, "..");
export const schemaPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json";
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const canonicalTargetDigest = value => sha256(Buffer.from(JSON.stringify(value)));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = value => typeof value === "number" && Number.isFinite(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const FROZEN_AUTHORITY_PATH = "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json";
const FROZEN_AUTHORITY_SHA256 = "049fddc767ededc7a202beadead885606389d1ebfa0d1bf0dfb2c0e4bf79163c";

const frozenTrust = loadFrozenTrustRoot(repositoryRoot);
export const TRUSTED_ARTIFACTS = frozenTrust.artifacts;
export const EXPECTED_TARGETS = frozenTrust.targets;

export function safeRepositoryFile(root, relative) {
  if (typeof relative !== "string" || relative.length === 0 || relative.trim() !== relative || relative.includes("\0") || relative.includes("\\") || path.posix.isAbsolute(relative) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(relative)) throw new Error("unsafe sourceArtifact");
  const segments = relative.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) throw new Error("noncanonical sourceArtifact");
  const rootReal = fs.realpathSync(root);
  const absolute = path.resolve(rootReal, ...segments);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("sourceArtifact must be a non-symlink regular file");
  const real = fs.realpathSync(absolute);
  if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) throw new Error("sourceArtifact escapes repository root");
  return real;
}

export function loadFrozenTrustRoot(root = repositoryRoot) {
  const authorityFile=safeRepositoryFile(root,FROZEN_AUTHORITY_PATH);
  const raw=fs.readFileSync(authorityFile);
  if (sha256(raw)!==FROZEN_AUTHORITY_SHA256) throw new Error("Frozen reauthorization authority SHA mismatch");
  let authority;
  try { authority=JSON.parse(raw.toString("utf8")); } catch { throw new Error("Frozen reauthorization authority JSON parse failed"); }
  const resolution=authority?.estimateRatioClassifications?.referenceResolution;
  if (authority.authorityId!==CONTRACT.authorityId || authority.immutableMigrationCandidateSha256!==CONTRACT.migrationCandidateSha256 || resolution?.callerSuppliedResolutionFlagsAuthoritative!==false || !Array.isArray(resolution.closedArtifactAllowlist) || !Array.isArray(resolution.expectedTargets)) throw new Error("Frozen trust-root semantics mismatch");
  const artifacts=Object.create(null);
  for (const entry of resolution.closedArtifactAllowlist) {
    if (!object(entry) || typeof entry.path!=="string" || !/^[0-9a-f]{64}$/.test(entry.sha256) || !Array.isArray(entry.referenceKinds) || entry.referenceKinds.length===0 || artifacts[entry.path]) throw new Error("Frozen artifact allowlist malformed");
    artifacts[entry.path]=Object.freeze({sha256:entry.sha256,referenceKinds:Object.freeze([...entry.referenceKinds])});
  }
  const targets=resolution.expectedTargets.map(entry=>{
    if (!object(entry) || typeof entry.referenceKind!=="string" || typeof entry.sourceArtifact!=="string" || typeof entry.jsonPointer!=="string" || !/^[0-9a-f]{64}$/.test(entry.targetSha256)) throw new Error("Frozen expected target malformed");
    return Object.freeze({...entry});
  });
  return Object.freeze({artifacts:Object.freeze(artifacts),targets:Object.freeze(targets)});
}

export function resolveJsonPointer(document, pointer) {
  if (typeof pointer !== "string" || pointer === "" || !pointer.startsWith("/")) throw new Error("non-root RFC 6901 pointer required");
  let current = document;
  for (const raw of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(raw)) throw new Error("illegal RFC 6901 escape");
    const token = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(token)) throw new Error("noncanonical array index");
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= current.length) throw new Error("array index missing");
      current = current[index];
    } else if (object(current) && Object.prototype.hasOwnProperty.call(current, token)) current = current[token];
    else throw new Error("pointer target missing");
  }
  return {exists:true,value:current};
}

export function resolveTrustedReference(reference, root = repositoryRoot, context = {}) {
  const allowed = new Set(["referenceKind","sourceArtifact","jsonPointer",...(reference?.referenceKind === "diagnosis-evidence"?["claimId"]:[])]);
  if (!object(reference) || Object.keys(reference).some(key => !allowed.has(key))) throw new Error("unknown authorization/reference field");
  const trusted = (context.artifacts ?? TRUSTED_ARTIFACTS)[reference.sourceArtifact];
  if (!trusted || !trusted.referenceKinds.includes(reference.referenceKind)) throw new Error("artifact/reference kind not trusted");
  const absolute = safeRepositoryFile(root, reference.sourceArtifact);
  const raw = fs.readFileSync(absolute);
  if (sha256(raw) !== trusted.sha256) throw new Error("trusted artifact SHA mismatch");
  let document;
  try { document = JSON.parse(raw.toString("utf8")); } catch { throw new Error("trusted artifact JSON parse failed"); }
  const resolved = resolveJsonPointer(document, reference.jsonPointer);
  const targets = context.targets ?? EXPECTED_TARGETS;
  const target = targets.find(value => value.referenceKind === reference.referenceKind && value.sourceArtifact === reference.sourceArtifact && value.jsonPointer === reference.jsonPointer && (value.claimId ?? null) === (reference.claimId ?? null));
  if (!target || canonicalTargetDigest(resolved.value) !== target.targetSha256) throw new Error("reference semantic binding mismatch");
  return resolved.value;
}

function localRef(schema, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported schema ref ${ref}`);
  return ref.slice(2).split("/").reduce((value, token) => value[token.replace(/~1/g,"/").replace(/~0/g,"~")], schema);
}

export function validateJsonSchema(value, schema, rule = schema, at = "$") {
  const issues = [];
  const visit = (subject, spec, pointer) => {
    if (spec.$ref) return visit(subject, localRef(schema, spec.$ref), pointer);
    if (spec.allOf) for (const child of spec.allOf) visit(subject, child, pointer);
    if (spec.anyOf) {
      const branches = spec.anyOf.map(child => { const before=issues.length; visit(subject,child,pointer); const branch=issues.splice(before); return branch; });
      if (!branches.some(branch => branch.length === 0)) issues.push(`${pointer}: no anyOf branch matched`);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(spec,"const") && !equal(subject,spec.const)) issues.push(`${pointer}: const mismatch`);
    if (spec.enum && !spec.enum.some(item => equal(subject,item))) issues.push(`${pointer}: enum mismatch`);
    if (spec.type) {
      const ok = spec.type === "object" ? object(subject) : spec.type === "array" ? Array.isArray(subject) : spec.type === "integer" ? Number.isInteger(subject) : spec.type === "number" ? finite(subject) : spec.type === "null" ? subject === null : typeof subject === spec.type;
      if (!ok) { issues.push(`${pointer}: expected ${spec.type}`); return; }
    }
    if (typeof subject === "number") { if (spec.minimum !== undefined && subject < spec.minimum) issues.push(`${pointer}: below minimum`); }
    if (typeof subject === "string") { if (spec.minLength !== undefined && subject.length < spec.minLength) issues.push(`${pointer}: too short`); if (spec.pattern && !new RegExp(spec.pattern,"u").test(subject)) issues.push(`${pointer}: pattern mismatch`); }
    if (Array.isArray(subject)) {
      if (spec.minItems !== undefined && subject.length < spec.minItems) issues.push(`${pointer}: too few items`);
      if (spec.maxItems !== undefined && subject.length > spec.maxItems) issues.push(`${pointer}: too many items`);
      if (spec.prefixItems) spec.prefixItems.forEach((child,index) => { if (index < subject.length) visit(subject[index],child,`${pointer}/${index}`); });
      if (spec.items === false && subject.length > (spec.prefixItems?.length ?? 0)) issues.push(`${pointer}: extra items`);
      else if (object(spec.items)) subject.forEach((item,index) => visit(item,spec.items,`${pointer}/${index}`));
    }
    if (object(subject)) {
      for (const key of spec.required ?? []) if (!Object.prototype.hasOwnProperty.call(subject,key)) issues.push(`${pointer}: missing ${key}`);
      if (spec.additionalProperties === false) for (const key of Object.keys(subject)) if (!Object.prototype.hasOwnProperty.call(spec.properties ?? {},key)) issues.push(`${pointer}: unknown ${key}`);
      for (const [key,child] of Object.entries(spec.properties ?? {})) if (Object.prototype.hasOwnProperty.call(subject,key)) visit(subject[key],child,`${pointer}/${key}`);
    }
  };
  visit(value,rule,at);
  return issues;
}

const expectedSequence = Object.freeze(["cold","warm-up-1","warm-up-2",...CONTRACT.measuredLabels]);
const exactObjectKeys=(value,keys)=>object(value)&&Object.keys(value).sort().join("\0")===[...keys].sort().join("\0");
const descriptor=(reference,extraKeys=[])=>{
  const keys=[...extraKeys,"referenceKind","sourceArtifact","jsonPointer"];
  if (!exactObjectKeys(reference,keys)) throw new Error("reference fields incomplete or unknown");
  return Object.fromEntries(["referenceKind","sourceArtifact","jsonPointer",...(reference.referenceKind==="diagnosis-evidence"?["claimId"]:[])].map(key=>[key,reference[key]]));
};

export function proofComplete(proof, root = repositoryRoot, context = {}) {
  try {
    const keys = ["frozenCaseIsolationRequirement","outerAuthorizationPass","outerRowCountSemanticsPass","outerPayloadSemanticsPass","auditableNodeIsolationPredicateReference","directInnerFunctionOwner","directInnerOwnerRolsuper","directInnerOwnerRolbypassrls","actorFrozenDatasetReference","tenantFrozenDatasetReference","branchFrozenDatasetReference","claimsFrozenDatasetReference","planRows","actualRows","actualLoops","evidenceReferences"];
    if (!exactObjectKeys(proof,keys)) return false;
    if (proof.outerAuthorizationPass !== true || proof.outerRowCountSemanticsPass !== true || proof.outerPayloadSemanticsPass !== true || proof.directInnerFunctionOwner !== CONTRACT.directInnerOwner || proof.directInnerOwnerRolsuper !== false || proof.directInnerOwnerRolbypassrls !== false || proof.actualRows !== 0 || !finite(proof.planRows) || proof.planRows < 0 || !finite(proof.actualLoops) || proof.actualLoops < 0) return false;
    if (!Array.isArray(proof.evidenceReferences) || proof.evidenceReferences.length !== 5) return false;
    const caseReference=proof.frozenCaseIsolationRequirement;
    const predicateReference=proof.auditableNodeIsolationPredicateReference;
    const actorReference=proof.actorFrozenDatasetReference;
    const tenantReference=proof.tenantFrozenDatasetReference;
    const branchReference=proof.branchFrozenDatasetReference;
    const claimsReference=proof.claimsFrozenDatasetReference;
    const frozenCase=resolveTrustedReference(descriptor(caseReference,["caseId","requirementId","isolationKind"]),root);
    const frozenPredicate=resolveTrustedReference(descriptor(predicateReference,["nodePath","predicateField","predicateText","policyOrJoinReference"]),root);
    const frozenActor=resolveTrustedReference(descriptor(actorReference,["actorId"]),root);
    const frozenTenant=resolveTrustedReference(descriptor(tenantReference,["tenantId"]),root);
    const frozenBranches=resolveTrustedReference(descriptor(branchReference,["branchDisposition"]),root);
    const frozenClaims=resolveTrustedReference(descriptor(claimsReference,["claimSubject"]),root);
    const claims=proof.evidenceReferences.map(reference=>{
      if (!exactObjectKeys(reference,["claimId","referenceKind","sourceArtifact","jsonPointer"])) throw new Error("diagnosis evidence reference incomplete");
      resolveTrustedReference(reference,root);
      return reference.claimId;
    });
    const expectedClaims=EXPECTED_TARGETS.filter(value=>value.referenceKind==="diagnosis-evidence").map(value=>value.claimId);
    if (!equal(claims,expectedClaims) || new Set(claims).size!==5) return false;
    const node=context.node, rawNode=context.rawNode, outer=context.outerAuthorization, identity=context.sessionIdentity;
    if (!node || context.trackKind!=="secure-direct-inner" || caseReference.caseId!==context.caseId || frozenCase.caseId!==context.caseId || caseReference.requirementId!==`${context.caseId}:${caseReference.isolationKind}` || caseReference.isolationKind!=="branch") return false;
    if (!outer || outer.authorizationPass!==proof.outerAuthorizationPass || outer.rowCountPass!==proof.outerRowCountSemanticsPass || outer.payloadSemanticsPass!==proof.outerPayloadSemanticsPass) return false;
    if (!identity || identity.currentUser!==proof.directInnerFunctionOwner || identity.rolsuper!==proof.directInnerOwnerRolsuper || identity.rolbypassrls!==proof.directInnerOwnerRolbypassrls) return false;
    if (predicateReference.nodePath!==node.nodePath || predicateReference.policyOrJoinReference!==frozenPredicate || !object(rawNode) || rawNode[predicateReference.predicateField]!==predicateReference.predicateText) return false;
    if (actorReference.actorId!==frozenActor.actorId || frozenActor.actorId!==frozenCase.actorId || tenantReference.tenantId!==frozenTenant.restaurantUuid || branchReference.branchDisposition!=="NO_ACTIVE_BRANCH_SCOPES" || !Array.isArray(frozenBranches) || frozenBranches.length!==0 || claimsReference.claimSubject!==frozenClaims || frozenActor.authUserUuid!==frozenClaims) return false;
    return proof.planRows===node.planRows && proof.actualRows===node.actualRows && proof.actualLoops===node.actualLoops;
  } catch { return false; }
}

function assertExactInventory(actual, expected, label) {
  if (!Array.isArray(actual) || actual.join("\0") !== expected.join("\0")) throw new Error(`${label} missing, extra, or reordered`);
}

function runBindings(track,suiteIndex,caseIndex,name) {
  const trackPointer=`/suites/${suiteIndex}/cases/${caseIndex}/tracks/${name}`;
  return [
    {run:track.cold,runPointer:`${trackPointer}/cold`},
    ...track.warmups.map((run,index)=>({run,runPointer:`${trackPointer}/warmups/${index}`})),
    ...track.measuredWarm.map((run,index)=>({run,runPointer:`${trackPointer}/measuredWarm/${index}`}))
  ];
}

function assertRunObservation(run) {
  const extracted=extractExplainObservation(run.explainJson,{sequenceLabel:run.sequenceLabel,backendPid:run.backendPid,sessionId:run.sessionId,clientWallTimeMs:run.clientWallTimeMs});
  for (const field of ["planningTimeMs","executionTimeMs","planningBuffers","executionBuffers","explainSha256"]) if (!equal(run[field],extracted[field])) throw new Error(`run ${field} is not bound to EXPLAIN bytes`);
}

export function validateEvidence(value, root = repositoryRoot) {
  loadFrozenTrustRoot(root);
  const schemaRaw = fs.readFileSync(safeRepositoryFile(root,schemaPath),"utf8");
  if (sha256(Buffer.from(schemaRaw))!==CONTRACT.evidenceSchemaSha256) throw new Error("evidence schema SHA mismatch");
  const schema = JSON.parse(schemaRaw);
  const schemaIssues = validateJsonSchema(value,schema);
  if (schemaIssues.length) throw new Error(`schema validation: ${schemaIssues.slice(0,8).join("; ")}`);
  assertExactInventory(value.caseInventory,CASE_IDS,"case inventory");
  assertExactInventory(value.profileInventory,PROFILE_IDS,"profile inventory");
  const matrix = loadFrozenMatrix(root);
  if (value.environments.map(item=>item.suiteId).join("\0") !== CONTRACT.suiteIds.join("\0")) throw new Error("environment inventory mismatch");
  if (value.suites.map(item=>item.suiteId).join("\0") !== CONTRACT.suiteIds.join("\0")) throw new Error("suite inventory mismatch");
  if (new Set(value.environments.map(item=>item.environmentId)).size!==2) throw new Error("fresh suite environments are not independent");
  const allSessionIds=new Set();
  for (let suiteIndex=0; suiteIndex<value.suites.length; suiteIndex++) {
    const suite=value.suites[suiteIndex];
    const environment = value.environments.find(item => item.environmentId === suite.environmentId && item.suiteId === suite.suiteId);
    if (!environment) throw new Error("suite/environment identity mismatch");
    const preIds = suite.prechecks.map(item=>item.precheckId);
    assertExactInventory(preIds,Array.from({length:29},(_,index)=>`PRE-${String(index+1).padStart(2,"0")}`),"precheck inventory");
    assertExactInventory(suite.cases.map(item=>item.caseId),CASE_IDS,"suite case inventory");
    for (let index=0; index<suite.cases.length; index++) {
      const item=suite.cases[index], frozen=matrix.cases[index];
      if (item.thresholdProfile !== frozen.thresholdProfile || item.expectedRows !== frozen.expectedRows) throw new Error(`${item.caseId} Frozen semantic mismatch`);
      if (item.outerAuthorization.rowCount !== frozen.expectedRows || item.outerAuthorization.rowCountPass !== true || item.outerAuthorization.payloadSemanticsPass !== true || item.outerAuthorization.authorizationPass !== true) throw new Error(`${item.caseId} outer authorization incomplete`);
      for (const [name,track] of Object.entries(item.tracks)) {
        const required = name === "outer" ? frozen.outerEvidenceRequired : frozen.innerEvidenceRequired;
        if (required && track === null) throw new Error(`${item.caseId} missing required ${name} track`);
        if (!required && track !== null) throw new Error(`${item.caseId} unexpected ${name} track`);
        if (!track) continue;
        const expectedKind=name==="outer"?"outer-security-definer":"secure-direct-inner";
        if (track.trackKind!==expectedKind) throw new Error(`${item.caseId} ${name} track kind mismatch`);
        const runs=[track.cold,...track.warmups,...track.measuredWarm];
        assertExactInventory(runs.map(run=>run.sequenceLabel),expectedSequence,`${item.caseId} ${name} run sequence`);
        assertSecureIdentity(track.sessionIdentity,track.trackKind);
        if (runs.some(run=>run.backendPid!==track.sessionIdentity.backendPid || run.sessionId!==track.sessionIdentity.sessionId)) throw new Error(`${item.caseId} ${name} run/session identity mismatch`);
        for (const run of runs) assertRunObservation(run);
        const aggregation=aggregateTrack(track.cold,track.warmups,track.measuredWarm);
        if (!equal(aggregation,track.aggregation)) throw new Error(`${item.caseId} ${name} aggregation mismatch`);
        assertSecureIdentity(track.secondFreshBackend.sessionIdentity,track.trackKind);
        if (track.secondFreshBackend.sessionIdentity.backendPid===track.sessionIdentity.backendPid || track.secondFreshBackend.sessionIdentity.sessionId===track.sessionIdentity.sessionId) throw new Error(`${item.caseId} second backend is not fresh`);
        for (const sessionId of [track.sessionIdentity.sessionId,track.secondFreshBackend.sessionIdentity.sessionId]) { if (allSessionIds.has(sessionId)) throw new Error("session identity reused across tracks"); allSessionIds.add(sessionId); }
        const bindings=runBindings(track,suiteIndex,index,name);
        const observedNodes=rawPlanNodes(bindings);
        if (!equal(observedNodes,track.semanticEvidence.planNodes)) throw new Error(`${item.caseId} ${name} plan nodes are not bound to EXPLAIN artifacts`);
        const observedZeroNodes=observedNodes.filter(node=>node.actualRows===0);
        if (track.semanticEvidence.zeroRowClassifications.length!==observedZeroNodes.length) throw new Error(`${item.caseId} ${name} zero-row classification coverage mismatch`);
        for (let classificationIndex=0; classificationIndex<track.semanticEvidence.zeroRowClassifications.length; classificationIndex++) {
          const classification=track.semanticEvidence.zeroRowClassifications[classificationIndex];
          const observedNode=observedZeroNodes[classificationIndex];
          const run=resolveJsonPointer(value,classification.runPointer).value;
          if (!equal(Object.fromEntries(["runPointer","explainSha256","nodePath","nodeType","planRows","actualRows","actualLoops"].map(key=>[key,classification[key]])),observedNode)) throw new Error(`${item.caseId} zero-row metrics/node binding mismatch`);
          if (run.explainSha256!==classification.explainSha256) throw new Error(`${item.caseId} zero-row EXPLAIN digest binding mismatch`);
          const rawNode=resolveJsonPointer(run.explainJson[0],classification.nodePath).value;
          const complete=proofComplete(classification.isolationProof,root,{caseId:item.caseId,trackKind:track.trackKind,node:observedNode,rawNode,outerAuthorization:item.outerAuthorization,sessionIdentity:track.sessionIdentity});
          const expected=classifyEstimateRatio({planRows:classification.planRows,actualRows:classification.actualRows,actualLoops:classification.actualLoops,isolationProofComplete:complete});
          if (classification.classification !== expected.id || classification.verdict !== expected.verdict) throw new Error(`${item.caseId} zero-row classification mismatch`);
          if (expected.verdict!=="SEMANTIC_NA") throw new Error(`${item.caseId} unproven zero-row evidence fails closed`);
        }
      }
    }
    const actualTrackReferences=[];
    for (const item of suite.cases) for (const [name,track] of Object.entries(item.tracks)) if (track) actualTrackReferences.push({caseId:item.caseId,trackName:name,primaryBackendPid:track.sessionIdentity.backendPid,primarySessionId:track.sessionIdentity.sessionId,secondBackendPid:track.secondFreshBackend.sessionIdentity.backendPid,secondSessionId:track.secondFreshBackend.sessionIdentity.sessionId});
    if (!equal(suite.freshBackendProof.trackReferences,actualTrackReferences)) throw new Error("suite fresh-backend references do not match actual tracks");
  }
  validateDiscardSequence(value.rawObservations.discardPlansSharedHitSequence["suite-a"]);
  validateDiscardSequence(value.rawObservations.discardPlansSharedHitSequence["suite-b"]);
  if (value.finalDisposition === "PASS") {
    if (!value.suites.every(suite=>suite.suiteDisposition==="PASS" && suite.prechecks.every(item=>item.passed===true) && suite.cases.every(item=>(item.caseDisposition==="PASS" || item.caseDisposition==="DIAGNOSTIC_REVIEW_REQUIRED") && Object.values(item.tracks).every(track=>track===null || track.trackDisposition==="PASS")))) throw new Error("PASS inferred from incomplete or failing evidence");
  }
  return true;
}

const emptyBuffers = hit => ({sharedHit:hit,sharedRead:0,sharedDirtied:0,sharedWritten:0,localHit:0,localRead:0,localDirtied:0,localWritten:0,tempRead:0,tempWritten:0});
const postgresBuffers = hit => ({"Shared Hit Blocks":hit,"Shared Read Blocks":0,"Shared Dirtied Blocks":0,"Shared Written Blocks":0,"Local Hit Blocks":0,"Local Read Blocks":0,"Local Dirtied Blocks":0,"Local Written Blocks":0,"Temp Read Blocks":0,"Temp Written Blocks":0});
const fakeRun = (label,pid,time=10,hit=52) => {
  const explainJson=[{Plan:{"Node Type":"Result","Plan Rows":1,"Actual Rows":1,"Actual Loops":1,...postgresBuffers(hit)},Planning:postgresBuffers(1),"Planning Time":1,"Execution Time":time}];
  return {sequenceLabel:label,backendPid:pid,sessionId:`session-${pid}`,planningTimeMs:1,executionTimeMs:time,clientWallTimeMs:time+1,planningBuffers:emptyBuffers(1),executionBuffers:emptyBuffers(hit),explainJson,explainSha256:sha256(Buffer.from(JSON.stringify(explainJson)))};
};
const identity = (pid,kind) => ({backendPid:pid,sessionId:`session-${pid}`,sessionUser:"formal_runner",currentUser:kind==="secure-direct-inner"?CONTRACT.directInnerOwner:"formal_runner",executionRole:kind==="secure-direct-inner"?CONTRACT.directInnerOwner:"formal_runner",rolsuper:false,rolbypassrls:false,rowSecurityOn:true,tenantPredicateEffective:true});
const discard = () => [{step:"before-discard",executionSharedHitBlocks:52},{step:"first-after-discard-plans",executionSharedHitBlocks:842},{step:"second-after-discard-plans",executionSharedHitBlocks:52}];

export function positiveFixture(root = repositoryRoot) {
  const matrix=loadFrozenMatrix(root);
  const environments=CONTRACT.suiteIds.map(suiteId=>({suiteId,environmentId:`local-${suiteId}`,databaseSystem:"PostgreSQL",postgresVersion:"17.6",serverVersionNum:170006,freshRebuild:true,trackedMigrationCount:41,candidateMigrationSha256:CONTRACT.migrationCandidateSha256,datasetSemanticHash:CONTRACT.datasetSemanticHash,developmentTouched:false,productionTouched:false}));
  const suites=CONTRACT.suiteIds.map((suiteId,suiteIndex)=>{
    const basePid=1000+suiteIndex*100;
    const cases=matrix.cases.map((frozen,caseIndex)=>{
      const makeTrack=name=>{
        const kind=name==="outer"?"outer-security-definer":"secure-direct-inner", pid=basePid+caseIndex*2+(name==="inner"?1:0);
        const cold=fakeRun("cold",pid,20,1224), warmups=CONTRACT.warmupLabels.map(label=>fakeRun(label,pid)), measuredWarm=CONTRACT.measuredLabels.map((label,index)=>fakeRun(label,pid,10+index));
        return {trackKind:kind,sessionIdentity:identity(pid,kind),cold,warmups,measuredWarm,secondFreshBackend:{sessionIdentity:identity(pid+10000,kind),executionSharedHitBlocks:1949},aggregation:aggregateTrack(cold,warmups,measuredWarm),semanticEvidence:{planNodes:[],zeroRowClassifications:[]},trackDisposition:"PASS"};
      };
      return {caseId:frozen.caseId,thresholdProfile:frozen.thresholdProfile,expectedRows:frozen.expectedRows,outerAuthorization:{rowCount:frozen.expectedRows,rowCountPass:true,payloadSemanticsPass:true,authorizationPass:true,rawPayloadSha256:"0".repeat(64)},tracks:{outer:frozen.outerEvidenceRequired?makeTrack("outer"):null,inner:frozen.innerEvidenceRequired?makeTrack("inner"):null},caseDisposition:frozen.classification==="diagnostic"?"DIAGNOSTIC_REVIEW_REQUIRED":"PASS"};
    });
    for (let caseIndex=0;caseIndex<cases.length;caseIndex++) for (const [name,track] of Object.entries(cases[caseIndex].tracks)) if (track) track.semanticEvidence.planNodes=rawPlanNodes(runBindings(track,suiteIndex,caseIndex,name));
    const trackReferences=[];
    for (const item of cases) for (const [name,track] of Object.entries(item.tracks)) if (track) trackReferences.push({caseId:item.caseId,trackName:name,primaryBackendPid:track.sessionIdentity.backendPid,primarySessionId:track.sessionIdentity.sessionId,secondBackendPid:track.secondFreshBackend.sessionIdentity.backendPid,secondSessionId:track.secondFreshBackend.sessionIdentity.sessionId});
    return {suiteId,environmentId:`local-${suiteId}`,freshBackendProof:{trackReferences},prechecks:Array.from({length:29},(_,index)=>({precheckId:`PRE-${String(index+1).padStart(2,"0")}`,passed:true,rawEvidence:{observed:true}})),cases,suiteDisposition:"PASS"};
  });
  return {schemaVersion:1,contract:{authorityId:CONTRACT.authorityId,frozenHead:CONTRACT.frozenHead,postgresVersion:"17.6",migrationCount:42,migrationCandidatePath:CONTRACT.migrationCandidatePath,migrationCandidateSha256:CONTRACT.migrationCandidateSha256,datasetSemanticHash:CONTRACT.datasetSemanticHash,noRetroactivePass:true},environments,caseInventory:[...CASE_IDS],profileInventory:[...PROFILE_IDS],suites,rawObservations:{discardPlansSharedHitSequence:{"suite-a":discard(),"suite-b":discard()}},technicalInferences:[{inferenceId:"cold-init",statement:"Cold first-session initialization is not steady-state warm evidence.",supportingRawPointers:["/rawObservations/discardPlansSharedHitSequence"],authoritativeForPass:false}],finalDisposition:"PASS"};
}

export function addValidIsolationProof(evidence, root = repositoryRoot) {
  const suiteIndex=0, caseIndex=0, name="inner";
  const item=evidence.suites[suiteIndex].cases[caseIndex], track=item.tracks[name], run=track.cold;
  if (!track) throw new Error("C01 inner fixture track missing");
  run.explainJson[0].Plan["Actual Rows"]=0;
  run.explainJson[0].Plan.Filter="(branch_id IS NULL)";
  const rebuilt=extractExplainObservation(run.explainJson,{sequenceLabel:run.sequenceLabel,backendPid:run.backendPid,sessionId:run.sessionId,clientWallTimeMs:run.clientWallTimeMs});
  Object.assign(run,rebuilt);
  track.semanticEvidence.planNodes=rawPlanNodes(runBindings(track,suiteIndex,caseIndex,name));
  const node=track.semanticEvidence.planNodes.find(value=>value.runPointer.endsWith("/cold")&&value.nodePath==="/Plan");
  const frozenPredicate=resolveTrustedReference({referenceKind:"isolation-predicate",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/functions/0/filter"},root);
  const proof={
    frozenCaseIsolationRequirement:{caseId:"C01",requirementId:"C01:branch",isolationKind:"branch",referenceKind:"frozen-case-isolation",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/cases/0"},
    outerAuthorizationPass:true,outerRowCountSemanticsPass:true,outerPayloadSemanticsPass:true,
    auditableNodeIsolationPredicateReference:{nodePath:"/Plan",predicateField:"Filter",predicateText:"(branch_id IS NULL)",policyOrJoinReference:frozenPredicate,referenceKind:"isolation-predicate",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/functions/0/filter"},
    directInnerFunctionOwner:CONTRACT.directInnerOwner,directInnerOwnerRolsuper:false,directInnerOwnerRolbypassrls:false,
    actorFrozenDatasetReference:{actorId:"A04",referenceKind:"actor",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/actors/3"},
    tenantFrozenDatasetReference:{tenantId:"cb327052-b06e-5fe2-9ce7-f6299ec61db8",referenceKind:"tenant",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/targets/noiseTenant01"},
    branchFrozenDatasetReference:{branchDisposition:"NO_ACTIVE_BRANCH_SCOPES",referenceKind:"branch",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/actors/3/branchUuids"},
    claimsFrozenDatasetReference:{claimSubject:"d9cf8c5b-f853-5e44-be48-d1d070430e3d",referenceKind:"claims",sourceArtifact:CONTRACT.baseAuthorityPath,jsonPointer:"/actors/3/authUserUuid"},
    planRows:node.planRows,actualRows:node.actualRows,actualLoops:node.actualLoops,
    evidenceReferences:EXPECTED_TARGETS.filter(value=>value.referenceKind==="diagnosis-evidence").map(({claimId,referenceKind,sourceArtifact,jsonPointer})=>({claimId,referenceKind,sourceArtifact,jsonPointer}))
  };
  track.semanticEvidence.zeroRowClassifications=[{...node,classification:"EXPECTED_ZERO_ACTUAL_ISOLATION",verdict:"SEMANTIC_NA",isolationProof:proof}];
  return evidence;
}

export function runSelfTest() {
  const results=[];
  const test=(name,fn)=>{let pass=false;try{pass=fn()===true;}catch{}results.push(pass);console.log(`${pass?"PASS":"FAIL"} SELFTEST ${name}`);};
  const rejects=fn=>{try{fn();return false;}catch{return true;}};
  const clone=value=>structuredClone(value);
  const base=positiveFixture();
  test("positive complete evidence",()=>validateEvidence(base));
  const isolationBase=addValidIsolationProof(clone(base));
  test("positive fully bound isolation evidence",()=>validateEvidence(isolationBase));
  const mutations=[
    ["missing case",v=>v.caseInventory.pop()],["extra case",v=>v.caseInventory.push("X01")],["reordered case",v=>v.caseInventory.reverse()],
    ["missing profile",v=>v.profileInventory.pop()],["extra profile",v=>v.profileInventory.push("extra")],["reordered profile",v=>v.profileInventory.reverse()],
    ["missing environment",v=>v.environments.pop()],["extra environment",v=>v.environments.push(clone(v.environments[0]))],
    ["planning execution substitution",v=>{v.suites[0].cases[0].tracks.outer.measuredWarm[0].executionTimeMs=1;v.suites[0].cases[0].tracks.outer.measuredWarm[0].planningTimeMs=10;}],
    ["six warm values",v=>v.suites[0].cases[0].tracks.outer.measuredWarm.pop()],["eight warm values",v=>v.suites[0].cases[0].tracks.outer.measuredWarm.push(clone(v.suites[0].cases[0].tracks.outer.measuredWarm[0]))],
    ["wrong warm value",v=>v.suites[0].cases[0].tracks.outer.measuredWarm[0].executionBuffers.sharedHit=999],
    ["missing isolation reference",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications.push({nodePath:"/Plan",planRows:1,actualRows:0,actualLoops:5,classification:"EXPECTED_ZERO_ACTUAL_ISOLATION",verdict:"SEMANTIC_NA",isolationProof:null})],
    ["caller fake authorization field",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications.push({runPointer:"/suites/0/cases/0/tracks/inner/cold",explainSha256:"0".repeat(64),nodePath:"/Plan",nodeType:"Result",planRows:1,actualRows:0,actualLoops:5,classification:"EXPECTED_ZERO_ACTUAL_ISOLATION",verdict:"SEMANTIC_NA",isolationProof:{resolved:true}})],
    ["FAIL track under PASS",v=>v.suites[0].cases[0].tracks.outer.trackDisposition="FAIL"],
    ["run PID differs from session",v=>v.suites[0].cases[0].tracks.outer.cold.backendPid+=1],
    ["run session differs from identity",v=>v.suites[0].cases[0].tracks.outer.cold.sessionId="substituted-session"],
    ["fresh backend reference differs from track",v=>v.suites[0].freshBackendProof.trackReferences[0].secondBackendPid+=1],
    ["EXPLAIN SHA forged",v=>v.suites[0].cases[0].tracks.outer.cold.explainSha256="f".repeat(64)],
    ["plan node metric detached",v=>v.suites[0].cases[0].tracks.outer.semanticEvidence.planNodes[0].actualRows=0],
    ["unknown top-level field",v=>v.authorized=true],["no retroactive pass",v=>v.contract.noRetroactivePass=false]
  ];
  for(const [name,mutate] of mutations)test(`reject ${name}`,()=>{const v=clone(base);mutate(v);return rejects(()=>validateEvidence(v));});
  const isolationMutations=[
    ["proof missing required field",v=>delete v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].isolationProof.actorFrozenDatasetReference],
    ["proof metric differs from raw node",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].isolationProof.planRows=2],
    ["proof predicate differs from EXPLAIN",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].isolationProof.auditableNodeIsolationPredicateReference.predicateText="caller assertion"],
    ["proof reference target unrelated",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].isolationProof.actorFrozenDatasetReference.jsonPointer="/actors/2"],
    ["FINITE_EVALUATED with Actual Rows zero",v=>{const c=v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0];c.classification="FINITE_EVALUATED";c.verdict="APPLY_EXISTING_FROZEN_THRESHOLD";}],
    ["classification EXPLAIN pointer detached",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].runPointer="/suites/0/cases/0/tracks/inner/measuredWarm/0"],
    ["classification digest detached",v=>v.suites[0].cases[0].tracks.inner.semanticEvidence.zeroRowClassifications[0].explainSha256="e".repeat(64)]
  ];
  for(const [name,mutate] of isolationMutations)test(`reject ${name}`,()=>{const v=clone(isolationBase);mutate(v);return rejects(()=>validateEvidence(v));});
  const temp=fs.mkdtempSync(path.join("/tmp","p2v-perf-001b-validator-negative-"));
  try {
    fs.mkdirSync(path.join(temp,"fixtures"));
    fs.writeFileSync(path.join(temp,"fixtures","values.json"),'{"false":false,"zero":0,"null":null,"empty":[],"a/b":{"~key":null}}\n');
    const raw=fs.readFileSync(path.join(temp,"fixtures","values.json"));
    const artifacts={"fixtures/values.json":{sha256:sha256(raw),referenceKinds:["test"]}};
    for(const [token,target] of [["false",false],["zero",0],["null",null],["empty",[]]]) {
      const targets=[{referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:`/${token}`,targetSha256:canonicalTargetDigest(target)}];
      test(`falsy target ${token} exists`,()=>resolveTrustedReference({referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:`/${token}`},temp,{artifacts,targets})===target || equal(resolveTrustedReference({referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:`/${token}`},temp,{artifacts,targets}),target));
    }
    test("RFC 6901 escapes",()=>{const targets=[{referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:"/a~1b/~0key",targetSha256:canonicalTargetDigest(null)}];return resolveTrustedReference({referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:"/a~1b/~0key"},temp,{artifacts,targets})===null;});
    for(const pointer of ["","/missing","/a~2b","/empty/-","/empty/00"]) test(`reject pointer ${JSON.stringify(pointer)}`,()=>rejects(()=>resolveJsonPointer(JSON.parse(raw),pointer)));
    const outside=path.join(temp,"outside.json");fs.writeFileSync(outside,"{}\n");fs.symlinkSync(outside,path.join(temp,"fixtures","link.json"));
    for(const attack of ["/etc/passwd","../outside.json","fixtures/../outside.json","fixtures\\values.json","file:///etc/passwd","https://example.invalid/a","fixtures/link.json"]) test(`reject path ${attack}`,()=>rejects(()=>safeRepositoryFile(temp,attack)));
    test("reject SHA mismatch",()=>{const bad={"fixtures/values.json":{sha256:"0".repeat(64),referenceKinds:["test"]}};return rejects(()=>resolveTrustedReference({referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:"/false"},temp,{artifacts:bad,targets:[{referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:"/false",targetSha256:canonicalTargetDigest(false)}]}));});
    test("reject caller fake resolved flag",()=>rejects(()=>resolveTrustedReference({referenceKind:"test",sourceArtifact:"fixtures/values.json",jsonPointer:"/false",resolved:true},temp,{artifacts,targets:[]})));
  } finally { fs.rmSync(temp,{recursive:true,force:true}); console.log(`SELFTEST TEMP CLEANED ${temp}`); }
  const pass=results.every(Boolean); console.log(`SELFTEST RESULT ${results.filter(Boolean).length}/${results.length} ${pass?"PASS":"FAIL"}`); return pass;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  try {
    if(args.length===1 && args[0]==="--self-test") process.exitCode=runSelfTest()?0:1;
    else if(args.length===1 && !args[0].startsWith("-")){const absolute=path.resolve(args[0]);const evidence=JSON.parse(fs.readFileSync(absolute,"utf8"));validateEvidence(evidence);console.log("P2V-PERF-001B EVIDENCE VALIDATION PASS");}
    else {console.error("Usage: evidence-validator.mjs --self-test | <evidence.json>");process.exitCode=2;}
  } catch(error){console.error(`P2V-PERF-001B EVIDENCE VALIDATION FAIL: ${error.message}`);process.exitCode=1;}
}
