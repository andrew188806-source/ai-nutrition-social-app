#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CONTRACT = Object.freeze({
  authorityId: "P2V-PERF-001B-C01-CONTRACT-REAUTHORIZATION-CANDIDATE-1",
  frozenHead: "957be8a5a114d5f818d5f02fbab7f87a534da130",
  postgresVersion: "17.6",
  serverVersionNum: 170006,
  trackedMigrationCount: 41,
  migrationCount: 42,
  migrationCandidatePath: "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql",
  migrationCandidateSha256: "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72",
  evidenceSchemaSha256: "14ab4c43e3c13c171be16279cc60de246da544dff9128107c6f119b86a5c511c",
  baseAuthorityPath: "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json",
  baseAuthoritySha256: "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade",
  datasetSemanticHash: "3e5dc3180770097f389a0a9d668a33f3bd0f1a6df43bcbc114b5fb88127eedc2",
  suiteIds: Object.freeze(["suite-a", "suite-b"]),
  warmupLabels: Object.freeze(["warm-up-1", "warm-up-2"]),
  measuredLabels: Object.freeze(["measured-1", "measured-2", "measured-3", "measured-4", "measured-5", "measured-6", "measured-7"]),
  discardSequence: Object.freeze(["before-discard", "first-after-discard-plans", "second-after-discard-plans"]),
  directInnerOwner: "restaurant_membership_context_reader",
  precheckCount: 29,
  noRetroactivePass: true
});

export const CASE_IDS = Object.freeze(["C01","C02","R01","R02","B01","B02","M01","M02","K01","K02","I01","I02","I03","J01","J02","J03","N01","N02","N03","D01","D02","D03","D04","D05","D06","D07","D08","D09","D10","P01","P02","P03","P04","P05","P06"]);
export const PROFILE_IDS = Object.freeze(["accessTypical","accessWorst","smallTypical","smallWorst","itemsWorst","branchItemsWorst","nutritionWorst","denial","pageDiagnostic"]);

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "..");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const finiteNonNegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

export function loadFrozenMatrix(root = repositoryRoot) {
  const absolute = path.join(root, CONTRACT.baseAuthorityPath);
  const raw = fs.readFileSync(absolute);
  if (digest(raw) !== CONTRACT.baseAuthoritySha256) throw new Error("base authority SHA-256 mismatch");
  const authority = JSON.parse(raw.toString("utf8"));
  const cases = authority.cases;
  const profiles = Object.keys(authority.thresholdProfiles);
  if (cases.map(value => value.caseId).join("\0") !== CASE_IDS.join("\0")) throw new Error("Frozen 35-case inventory mismatch");
  if (profiles.join("\0") !== PROFILE_IDS.join("\0")) throw new Error("Frozen 9-profile inventory mismatch");
  if (authority.postgresVersion !== CONTRACT.postgresVersion || authority.suiteRepetitions !== 2 || authority.warmupRunsPerTrack !== 2 || authority.measuredWarmRunsPerTrack !== 7) throw new Error("Frozen execution contract mismatch");
  return { cases, thresholdProfiles: authority.thresholdProfiles, actors: authority.actors, generation: authority.generation, dataset: authority.dataset };
}

export function medianSeven(values) {
  if (!Array.isArray(values) || values.length !== 7 || !values.every(finiteNonNegative)) throw new Error("warm evidence must contain exactly seven finite non-negative values");
  return [...values].sort((a, b) => a - b)[3];
}

export function classifyEstimateRatio({ planRows, actualRows, actualLoops, isolationProofComplete = false }) {
  if (!finiteNonNegative(planRows)) return { order: 1, id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
  if (!finiteNonNegative(actualRows)) return { order: 2, id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
  if (planRows === 0 && actualRows > 0) return { order: 3, id: "ZERO_ESTIMATE_WITH_ACTUAL_ROWS", verdict: "FAIL" };
  if (planRows === 0 && actualRows === 0) return { order: 4, id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
  if (planRows > 0 && actualRows === 0 && finiteNonNegative(actualLoops) && isolationProofComplete === true) return { order: 5, id: "EXPECTED_ZERO_ACTUAL_ISOLATION", verdict: "SEMANTIC_NA" };
  if (planRows > 0 && actualRows === 0) return { order: 6, id: "UNEXPECTED_ZERO_ACTUAL", verdict: "FAIL" };
  if (planRows > 0 && actualRows > 0 && finiteNonNegative(actualLoops)) {
    const planned = planRows * actualLoops;
    const actual = actualRows * actualLoops;
    const ratio = planned === 0 && actual === 0 ? 1 : Math.max(planned / actual, actual / planned);
    if (Number.isFinite(ratio)) return { order: 7, id: "FINITE_EVALUATED", verdict: "APPLY_EXISTING_FROZEN_THRESHOLD", ratio };
  }
  return { order: 8, id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
}

const BUFFER_FIELDS = Object.freeze(["sharedHit","sharedRead","sharedDirtied","sharedWritten","localHit","localRead","localDirtied","localWritten","tempRead","tempWritten"]);

export function extractExplainObservation(explainJson, { sequenceLabel, backendPid, sessionId, clientWallTimeMs }) {
  if (!Array.isArray(explainJson) || explainJson.length !== 1 || !explainJson[0] || typeof explainJson[0] !== "object") throw new Error("EXPLAIN must be a one-element PostgreSQL FORMAT JSON array");
  const summary = explainJson[0];
  const plan = summary.Plan;
  if (!plan || typeof plan !== "object") throw new Error("EXPLAIN Plan missing");
  const number = (object, field) => {
    const value = object?.[field];
    if (!finiteNonNegative(value)) throw new Error(`missing/non-finite ${field}`);
    return value;
  };
  const buffers = object => ({
    sharedHit: number(object, "Shared Hit Blocks"), sharedRead: number(object, "Shared Read Blocks"),
    sharedDirtied: number(object, "Shared Dirtied Blocks"), sharedWritten: number(object, "Shared Written Blocks"),
    localHit: number(object, "Local Hit Blocks"), localRead: number(object, "Local Read Blocks"),
    localDirtied: number(object, "Local Dirtied Blocks"), localWritten: number(object, "Local Written Blocks"),
    tempRead: number(object, "Temp Read Blocks"), tempWritten: number(object, "Temp Written Blocks")
  });
  if (!Number.isInteger(backendPid) || backendPid < 1 || typeof sessionId !== "string" || sessionId.length === 0 || !finiteNonNegative(clientWallTimeMs)) throw new Error("invalid backend/session/client identity");
  return {
    sequenceLabel,
    backendPid,
    sessionId,
    planningTimeMs: number(summary, "Planning Time"),
    executionTimeMs: number(summary, "Execution Time"),
    clientWallTimeMs,
    planningBuffers: buffers(summary.Planning),
    executionBuffers: buffers(plan),
    explainJson,
    explainSha256: digest(Buffer.from(JSON.stringify(explainJson)))
  };
}

export function aggregateTrack(cold, warmups, measuredWarm) {
  if (cold?.sequenceLabel !== "cold") throw new Error("cold must be first");
  if (!Array.isArray(warmups) || warmups.length !== 2 || warmups.map(value => value.sequenceLabel).join("\0") !== CONTRACT.warmupLabels.join("\0")) throw new Error("warm-up sequence mismatch");
  if (!Array.isArray(measuredWarm) || measuredWarm.length !== 7 || measuredWarm.map(value => value.sequenceLabel).join("\0") !== CONTRACT.measuredLabels.join("\0")) throw new Error("measured warm sequence mismatch");
  const pid = cold.backendPid;
  const sessionId = cold.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0 || ![...warmups, ...measuredWarm].every(value => value.backendPid === pid && value.sessionId === sessionId)) throw new Error("track reconnected; persistent backend/session required");
  const warmExecutionTimesMs = measuredWarm.map(value => value.executionTimeMs);
  if (!warmExecutionTimesMs.every(finiteNonNegative)) throw new Error("invalid warm Execution Time");
  const hits = measuredWarm.map(value => value.executionBuffers?.sharedHit);
  if (!hits.every(finiteNonNegative)) throw new Error("invalid measured warm execution buffers");
  return {
    warmExecutionTimesMs,
    warmMedianMs: medianSeven(warmExecutionTimesMs),
    warmMaximumMs: Math.max(...warmExecutionTimesMs),
    warmMaxExecutionSharedHitBlocks: Math.max(...hits),
    coldClassification: "COLD_FIRST_SESSION_PLAN_INITIALIZATION"
  };
}

export function assertSecureIdentity(identity, trackKind) {
  const keys = ["backendPid","sessionId","sessionUser","currentUser","executionRole","rolsuper","rolbypassrls","rowSecurityOn","tenantPredicateEffective"];
  if (!exactKeys(identity, keys)) throw new Error("identity evidence is not closed");
  if (!Number.isInteger(identity.backendPid) || identity.backendPid < 1 || typeof identity.sessionId !== "string" || identity.sessionId.length === 0 || identity.rowSecurityOn !== true || identity.tenantPredicateEffective !== true) throw new Error("identity/RLS proof incomplete");
  if (trackKind === "secure-direct-inner" && (identity.executionRole !== CONTRACT.directInnerOwner || identity.currentUser !== CONTRACT.directInnerOwner || identity.rolsuper !== false || identity.rolbypassrls !== false)) throw new Error("direct-inner identity is not the NOBYPASSRLS function owner");
  if (trackKind === "outer-security-definer" && identity.executionRole === "postgres") throw new Error("superuser formal threshold evidence prohibited");
  return true;
}

export function validateDiscardSequence(sequence) {
  if (!Array.isArray(sequence) || sequence.length !== 3 || sequence.map(value => value.step).join("\0") !== CONTRACT.discardSequence.join("\0")) throw new Error("DISCARD PLANS sequence mismatch");
  const values = sequence.map(value => value.executionSharedHitBlocks);
  if (JSON.stringify(values) !== JSON.stringify([52, 842, 52])) throw new Error("DISCARD PLANS observations differ from bound diagnosis");
  return true;
}

export function createEvidenceSkeleton() {
  const matrix = loadFrozenMatrix();
  return {
    schemaVersion: 1,
    contract: {
      authorityId: CONTRACT.authorityId, frozenHead: CONTRACT.frozenHead, postgresVersion: CONTRACT.postgresVersion,
      migrationCount: CONTRACT.migrationCount, migrationCandidatePath: CONTRACT.migrationCandidatePath,
      migrationCandidateSha256: CONTRACT.migrationCandidateSha256, datasetSemanticHash: CONTRACT.datasetSemanticHash,
      noRetroactivePass: true
    },
    environments: [], caseInventory: [...CASE_IDS], profileInventory: [...PROFILE_IDS], suites: [],
    rawObservations: { discardPlansSharedHitSequence: {} }, technicalInferences: [], finalDisposition: "INCOMPLETE",
    _frozenCaseDefinitions: matrix.cases
  };
}

export async function executeFormalSuites(adapter) {
  const requiredMethods = ["rebuildFresh","generateFrozenDataset","captureCatalog","runPrechecks","restartForTrack","openPersistentTrack","measureExplain","measureOuterAuthorization","openSecondFreshBackend","buildIsolationProof","measureDiscardPlansSequence","close"];
  if (!adapter || requiredMethods.some(name => typeof adapter[name] !== "function")) throw new Error("formal adapter is missing a required operation");
  const matrix = loadFrozenMatrix();
  const evidence = createEvidenceSkeleton();
  delete evidence._frozenCaseDefinitions;
  try {
    for (let suiteIndex = 0; suiteIndex < CONTRACT.suiteIds.length; suiteIndex++) {
      const suiteId = CONTRACT.suiteIds[suiteIndex];
      const rebuilt = await adapter.rebuildFresh({suiteId,postgresVersion:CONTRACT.postgresVersion,trackedMigrationCount:41,candidate:{path:CONTRACT.migrationCandidatePath,sha256:CONTRACT.migrationCandidateSha256}});
      if (!rebuilt || rebuilt.postgresVersion !== CONTRACT.postgresVersion || rebuilt.serverVersionNum !== CONTRACT.serverVersionNum || rebuilt.trackedMigrationCount !== 41 || rebuilt.candidateMigrationSha256 !== CONTRACT.migrationCandidateSha256 || rebuilt.freshRebuild !== true) throw new Error(`${suiteId} rebuild identity mismatch`);
      const dataset = await adapter.generateFrozenDataset({suiteId,generation:matrix.generation,dataset:matrix.dataset});
      if (!dataset || dataset.semanticHash !== CONTRACT.datasetSemanticHash) throw new Error(`${suiteId} dataset semantic hash mismatch`);
      const catalog = await adapter.captureCatalog({suiteId});
      if (!catalog || catalog.functionOwner !== CONTRACT.directInnerOwner || catalog.ownerRolsuper !== false || catalog.ownerRolbypassrls !== false || catalog.functionIdentityPass !== true || catalog.returnShapePass !== true || catalog.aclPass !== true || catalog.rlsPass !== true || catalog.indexesPass !== true) throw new Error(`${suiteId} catalog/security capture failed`);
      const environmentId = rebuilt.environmentId;
      if (typeof environmentId !== "string" || environmentId.length === 0) throw new Error(`${suiteId} environment identity missing`);
      evidence.environments.push({suiteId,environmentId,databaseSystem:"PostgreSQL",postgresVersion:"17.6",serverVersionNum:170006,freshRebuild:true,trackedMigrationCount:41,candidateMigrationSha256:CONTRACT.migrationCandidateSha256,datasetSemanticHash:CONTRACT.datasetSemanticHash,developmentTouched:false,productionTouched:false});
      const prechecks = await adapter.runPrechecks({suiteId,count:29,cases:matrix.cases,actors:matrix.actors,catalog});
      if (!Array.isArray(prechecks) || prechecks.length !== 29 || prechecks.some((item,index) => item.precheckId !== `PRE-${String(index+1).padStart(2,"0")}` || item.passed !== true)) throw new Error(`${suiteId} 29-case prechecks incomplete`);
      const caseEvidence=[];
      const freshTrackReferences=[];
      for (let caseIndex=0; caseIndex<matrix.cases.length; caseIndex++) {
        const frozenCase=matrix.cases[caseIndex];
        const outerAuthorization = await adapter.measureOuterAuthorization({suiteId,caseDefinition:frozenCase});
        if (!outerAuthorization || outerAuthorization.rowCount !== frozenCase.expectedRows || outerAuthorization.rowCountPass !== true || outerAuthorization.payloadSemanticsPass !== true || outerAuthorization.authorizationPass !== true) throw new Error(`${suiteId}/${frozenCase.caseId} outer authorization failed`);
        const tracks={outer:null,inner:null};
        for (const trackName of ["outer","inner"]) {
          const required = trackName === "outer" ? frozenCase.outerEvidenceRequired : frozenCase.innerEvidenceRequired;
          if (!required) continue;
          const trackKind=trackName === "outer" ? "outer-security-definer" : "secure-direct-inner";
          await adapter.restartForTrack({suiteId,caseDefinition:frozenCase,trackKind,sequence:["CHECKPOINT","clean-stop","port-closed-proof","restart"]});
          const session=await adapter.openPersistentTrack({suiteId,caseDefinition:frozenCase,trackKind,executionRole:trackName === "inner" ? CONTRACT.directInnerOwner : undefined});
          assertSecureIdentity(session?.identity,trackKind);
          const observe=async label=>{
            const raw=await adapter.measureExplain({suiteId,caseDefinition:frozenCase,trackKind,session,sequenceLabel:label,explainOptions:["ANALYZE","BUFFERS","VERBOSE","FORMAT JSON"]});
            if (raw.backendPid !== session.identity.backendPid || raw.sessionId !== session.identity.sessionId) throw new Error(`${suiteId}/${frozenCase.caseId}/${trackName} backend/session changed`);
            return extractExplainObservation(raw.explainJson,{sequenceLabel:label,backendPid:raw.backendPid,sessionId:raw.sessionId,clientWallTimeMs:raw.clientWallTimeMs});
          };
          const cold=await observe("cold");
          const warmups=[]; for (const label of CONTRACT.warmupLabels) warmups.push(await observe(label));
          const measuredWarm=[]; for (const label of CONTRACT.measuredLabels) measuredWarm.push(await observe(label));
          const second=await adapter.openSecondFreshBackend({suiteId,caseDefinition:frozenCase,trackKind,firstBackendPid:session.identity.backendPid});
          if (!second || !exactKeys(second,["sessionIdentity","executionSharedHitBlocks"]) || !finiteNonNegative(second.executionSharedHitBlocks)) throw new Error(`${suiteId}/${frozenCase.caseId}/${trackName} second fresh backend proof incomplete`);
          assertSecureIdentity(second.sessionIdentity,trackKind);
          if (second.sessionIdentity.backendPid === session.identity.backendPid || second.sessionIdentity.sessionId === session.identity.sessionId) throw new Error(`${suiteId}/${frozenCase.caseId}/${trackName} second backend is not fresh`);
          const aggregation=aggregateTrack(cold,warmups,measuredWarm);
          const allRuns=[cold,...warmups,...measuredWarm];
          const trackPointer=`/suites/${suiteIndex}/cases/${caseIndex}/tracks/${trackName}`;
          const planNodes=rawPlanNodes(allRuns.map((run,runIndex)=>({run,runPointer:`${trackPointer}/${runIndex===0?"cold":runIndex<3?`warmups/${runIndex-1}`:`measuredWarm/${runIndex-3}`}`})));
          const zeroRowClassifications=[];
          for (const node of planNodes.filter(value=>value.actualRows===0)) {
            const isolationProof=await adapter.buildIsolationProof({suiteId,caseDefinition:frozenCase,trackKind,node,outerAuthorization,catalog});
            const { proofComplete }=await import("./restaurant-performance-p2v-perf-001b-evidence-validator.mjs");
            const complete=proofComplete(isolationProof,repositoryRoot,{caseId:frozenCase.caseId,trackKind,node,outerAuthorization,sessionIdentity:session.identity});
            const classification=classifyEstimateRatio({...node,isolationProofComplete:complete});
            zeroRowClassifications.push({...node,classification:classification.id,verdict:classification.verdict,isolationProof:complete?isolationProof:null});
            if (classification.verdict === "FAIL") throw new Error(`${suiteId}/${frozenCase.caseId}/${trackName} ${classification.id}`);
          }
          assertFrozenTrackThresholds({cold,measuredWarm,aggregation},matrix.thresholdProfiles[frozenCase.thresholdProfile][trackName]);
          tracks[trackName]={trackKind,sessionIdentity:session.identity,cold,warmups,measuredWarm,secondFreshBackend:second,aggregation,semanticEvidence:{planNodes,zeroRowClassifications},trackDisposition:"PASS"};
          freshTrackReferences.push({caseId:frozenCase.caseId,trackName,primaryBackendPid:session.identity.backendPid,primarySessionId:session.identity.sessionId,secondBackendPid:second.sessionIdentity.backendPid,secondSessionId:second.sessionIdentity.sessionId});
          await adapter.close(session);
        }
        caseEvidence.push({caseId:frozenCase.caseId,thresholdProfile:frozenCase.thresholdProfile,expectedRows:frozenCase.expectedRows,outerAuthorization,tracks,caseDisposition:frozenCase.classification === "diagnostic" ? "DIAGNOSTIC_REVIEW_REQUIRED" : "PASS"});
      }
      const discardSequence=await adapter.measureDiscardPlansSequence({suiteId,expectedSteps:CONTRACT.discardSequence});
      validateDiscardSequence(discardSequence);
      evidence.rawObservations.discardPlansSharedHitSequence[suiteId]=discardSequence;
      evidence.suites.push({suiteId,environmentId,freshBackendProof:{trackReferences:freshTrackReferences},prechecks,cases:caseEvidence,suiteDisposition:"PASS"});
    }
    evidence.technicalInferences.push({inferenceId:"cold-first-use",statement:"Cold first-session plan initialization is reported separately and excluded from steady-state warm aggregation.",supportingRawPointers:["/suites/0/cases/0/tracks/outer/cold","/suites/1/cases/0/tracks/outer/cold"],authoritativeForPass:false});
    evidence.finalDisposition="PASS";
    return evidence;
  } catch (error) {
    evidence.finalDisposition="FAIL";
    throw error;
  } finally {
    await adapter.close();
  }
}

function assertFrozenTrackThresholds(track, threshold) {
  if (!threshold) throw new Error("missing Frozen threshold profile");
  const measured=[track.cold,...track.measuredWarm];
  const maximum=(selector)=>Math.max(...measured.map(selector));
  if (track.cold.executionTimeMs > threshold.coldExecutionMs || track.aggregation.warmMedianMs > threshold.warmMedianExecutionMs || track.aggregation.warmMaximumMs > threshold.warmMaxExecutionMs || maximum(run=>run.planningTimeMs) > threshold.maxPlanningMs) throw new Error("Frozen server timing threshold failed");
  if (track.aggregation.warmMaxExecutionSharedHitBlocks > threshold.maxSharedHitBlocks || track.cold.executionBuffers.sharedRead > threshold.maxColdReadBlocks || Math.max(...track.measuredWarm.map(run=>run.executionBuffers.sharedRead)) > threshold.maxWarmReadBlocks) throw new Error("Frozen execution buffer threshold failed");
  const limits=[["localHit","maxLocalHitBlocks"],["localRead","maxLocalReadBlocks"],["tempRead","maxTempReadBlocks"],["tempWritten","maxTempWrittenBlocks"]];
  for (const [field,limit] of limits) if (maximum(run=>run.executionBuffers[field]) > threshold[limit]) throw new Error(`Frozen ${field} threshold failed`);
}

export function rawPlanNodes(runBindings) {
  const nodes=[];
  const visit=(node,nodePath,runPointer,explainSha256)=>{
    if (!node || typeof node !== "object") throw new Error(`invalid plan node ${nodePath}`);
    for (const field of ["Plan Rows","Actual Rows","Actual Loops"]) if (!finiteNonNegative(node[field])) throw new Error(`missing/non-finite ${field} at ${nodePath}`);
    nodes.push({runPointer,explainSha256,nodePath,nodeType:String(node["Node Type"] ?? "UNKNOWN"),planRows:node["Plan Rows"],actualRows:node["Actual Rows"],actualLoops:node["Actual Loops"]});
    (node.Plans ?? []).forEach((child,index)=>visit(child,`${nodePath}/Plans/${index}`,runPointer,explainSha256));
  };
  for (const binding of runBindings) {
    if (!exactKeys(binding,["run","runPointer"]) || typeof binding.runPointer !== "string" || !binding.runPointer.startsWith("/suites/")) throw new Error("plan run binding incomplete");
    const computed=digest(Buffer.from(JSON.stringify(binding.run.explainJson)));
    if (computed !== binding.run.explainSha256) throw new Error("EXPLAIN SHA-256 mismatch");
    visit(binding.run.explainJson?.[0]?.Plan,"/Plan",binding.runPointer,computed);
  }
  return nodes;
}

export function validateCollectionEnvelope(value) {
  const allowed = ["schemaVersion","suiteId","environment","prechecks","cases","discardPlansSharedHitSequence"];
  if (!exactKeys(value, allowed) || value.schemaVersion !== 1 || !CONTRACT.suiteIds.includes(value.suiteId)) throw new Error("collection envelope is not closed");
  if (!Array.isArray(value.prechecks) || value.prechecks.length !== 29) throw new Error("exactly 29 prechecks required");
  if (!Array.isArray(value.cases) || value.cases.map(item => item.caseId).join("\0") !== CASE_IDS.join("\0")) throw new Error("35 cases missing, extra, or reordered");
  validateDiscardSequence(value.discardPlansSharedHitSequence);
  return true;
}

function fakeBuffers(sharedHit = 52) {
  return Object.fromEntries(BUFFER_FIELDS.map(key => [key, key === "sharedHit" ? sharedHit : 0]));
}

function fakeRun(sequenceLabel, backendPid = 101, executionTimeMs = 10, sharedHit = 52) {
  const postgresBuffers=(hit)=>({"Shared Hit Blocks":hit,"Shared Read Blocks":0,"Shared Dirtied Blocks":0,"Shared Written Blocks":0,"Local Hit Blocks":0,"Local Read Blocks":0,"Local Dirtied Blocks":0,"Local Written Blocks":0,"Temp Read Blocks":0,"Temp Written Blocks":0});
  const explainJson=[{Plan:{"Node Type":"Result","Plan Rows":1,"Actual Rows":1,"Actual Loops":1,...postgresBuffers(sharedHit)},Planning:postgresBuffers(1),"Planning Time":1,"Execution Time":executionTimeMs}];
  return { sequenceLabel, backendPid, sessionId:`session-${backendPid}`, planningTimeMs: 1, executionTimeMs, clientWallTimeMs: 11, planningBuffers: fakeBuffers(1), executionBuffers: fakeBuffers(sharedHit), explainJson, explainSha256: digest(Buffer.from(JSON.stringify(explainJson))) };
}

export function runSelfTest() {
  const results = [];
  const test = (name, action) => {
    let pass = false;
    try { pass = action() === true; } catch { pass = false; }
    results.push(pass); console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`);
  };
  const rejected = action => { try { action(); return false; } catch { return true; } };
  const warmups = CONTRACT.warmupLabels.map(label => fakeRun(label));
  const measured = CONTRACT.measuredLabels.map((label, index) => fakeRun(label, 101, 10 + index, 52));
  test("Frozen 35 cases and 9 profiles", () => { const matrix = loadFrozenMatrix(); return matrix.cases.length === 35 && Object.keys(matrix.thresholdProfiles).length === 9; });
  test("exact seven warm aggregation", () => aggregateTrack(fakeRun("cold", 101, 20, 1224), warmups, measured).warmMedianMs === 13);
  for (const length of [0, 6, 8]) test(`reject ${length} measured warm values`, () => rejected(() => medianSeven(Array(length).fill(1))));
  test("reject wrong warm order", () => rejected(() => aggregateTrack(fakeRun("cold"), warmups, [...measured].reverse())));
  test("reject reconnect", () => rejected(() => aggregateTrack(fakeRun("cold"), warmups, measured.map((value, index) => ({...value, backendPid:index ? 101 : 999})))));
  test("cold excluded from warm max hits", () => aggregateTrack(fakeRun("cold", 101, 20, 1224), warmups, measured).warmMaxExecutionSharedHitBlocks === 52);
  test("planning is not execution", () => fakeRun("cold").planningTimeMs !== fakeRun("cold").executionTimeMs);
  test("secure direct-inner owner", () => assertSecureIdentity({backendPid:1,sessionId:"session-1",sessionUser:"formal",currentUser:CONTRACT.directInnerOwner,executionRole:CONTRACT.directInnerOwner,rolsuper:false,rolbypassrls:false,rowSecurityOn:true,tenantPredicateEffective:true}, "secure-direct-inner"));
  test("reject BYPASSRLS direct-inner", () => rejected(() => assertSecureIdentity({backendPid:1,sessionId:"session-1",sessionUser:"formal",currentUser:CONTRACT.directInnerOwner,executionRole:CONTRACT.directInnerOwner,rolsuper:false,rolbypassrls:true,rowSecurityOn:true,tenantPredicateEffective:true}, "secure-direct-inner")));
  test("reject session substitution", () => rejected(() => aggregateTrack(fakeRun("cold"),warmups.map(value=>({...value,sessionId:"other"})),measured)));
  test("DISCARD sequence exact", () => validateDiscardSequence([{step:"before-discard",executionSharedHitBlocks:52},{step:"first-after-discard-plans",executionSharedHitBlocks:842},{step:"second-after-discard-plans",executionSharedHitBlocks:52}]));
  for (const mutation of [[], [{step:"before-discard",executionSharedHitBlocks:52}], [{step:"first-after-discard-plans",executionSharedHitBlocks:842},{step:"before-discard",executionSharedHitBlocks:52},{step:"second-after-discard-plans",executionSharedHitBlocks:52}], [{step:"before-discard",executionSharedHitBlocks:52},{step:"first-after-discard-plans",executionSharedHitBlocks:999},{step:"second-after-discard-plans",executionSharedHitBlocks:52}]]) test("reject malformed DISCARD sequence", () => rejected(() => validateDiscardSequence(mutation)));
  const fixtures = [
    [{planRows:NaN,actualRows:1,actualLoops:1},1,"NON_FINITE_OR_UNCLASSIFIED"],
    [{planRows:1,actualRows:NaN,actualLoops:1},2,"NON_FINITE_OR_UNCLASSIFIED"],
    [{planRows:0,actualRows:1,actualLoops:1},3,"ZERO_ESTIMATE_WITH_ACTUAL_ROWS"],
    [{planRows:0,actualRows:0,actualLoops:1},4,"NON_FINITE_OR_UNCLASSIFIED"],
    [{planRows:1,actualRows:0,actualLoops:5,isolationProofComplete:true},5,"EXPECTED_ZERO_ACTUAL_ISOLATION"],
    [{planRows:1,actualRows:0,actualLoops:5,isolationProofComplete:false},6,"UNEXPECTED_ZERO_ACTUAL"],
    [{planRows:1,actualRows:1,actualLoops:1},7,"FINITE_EVALUATED"],
    [{planRows:1,actualRows:1,actualLoops:NaN},8,"NON_FINITE_OR_UNCLASSIFIED"]
  ];
  for (const [input, order, id] of fixtures) test(`classifier rule ${order}`, () => { const result = classifyEstimateRatio(input); return result.order === order && result.id === id; });
  test("FINITE_EVALUATED excludes Actual Rows zero", () => classifyEstimateRatio({planRows:1,actualRows:0,actualLoops:1}).id === "UNEXPECTED_ZERO_ACTUAL");
  test("missing isolation proof fails closed", () => classifyEstimateRatio({planRows:1,actualRows:0,actualLoops:5}).verdict === "FAIL");
  const pass = results.every(Boolean);
  console.log(`SELFTEST RESULT ${results.filter(Boolean).length}/${results.length} ${pass ? "PASS" : "FAIL"}`);
  return pass;
}

function usage() {
  console.error("Usage: formal-runner.mjs --self-test | --print-manifest | --validate-collection <artifact.json>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, artifact, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw new Error("unexpected arguments");
    if (command === "--self-test" && !artifact) process.exitCode = runSelfTest() ? 0 : 1;
    else if (command === "--print-manifest" && !artifact) {
      const value = createEvidenceSkeleton(); delete value._frozenCaseDefinitions; console.log(`${JSON.stringify(value, null, 2)}\n`);
    } else if (command === "--validate-collection" && artifact) {
      validateCollectionEnvelope(JSON.parse(fs.readFileSync(path.resolve(artifact), "utf8"))); console.log("P2V-PERF-001B COLLECTION PASS");
    } else { usage(); process.exitCode = 2; }
  } catch (error) { console.error(`P2V-PERF-001B FORMAL RUNNER FAIL: ${error.message}`); process.exitCode = 1; }
}
