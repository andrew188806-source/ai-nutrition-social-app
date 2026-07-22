#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorityPath = "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json";
const contractPath = "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md";
const provenancePath = "docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json";
const guardPath = "scripts/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-guard.mjs";
const migrationCandidate = "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const candidatePaths = [authorityPath, contractPath, provenancePath, guardPath].sort();
const expectedUntracked = [...candidatePaths, migrationCandidate].sort();
const expectedFuturePaths = [
  "scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json",
  "scripts/restaurant-performance-p2v-perf-001b-evidence-validator.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-c01-contract-implementation-guard.mjs"
];
const head = "a6394ac32702c301016b5cbdef9f03d49a109ea0";
const parent = "3c36c5c64d6b02b8da807f5715d67065ba3f7de6";
const migrationSha = "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";
const diagnosisSha = "73e749c1fb67a85e735cc4d44d444a3f4c7ec4c479d482e7cbbae8d516894fb2";
const focusedSha = "96eda96fef9b287284b98db2fe644e08996af39d9f032bfd48c1e9b23c1724cd";
const datasetHash = "3e5dc3180770097f389a0a9d668a33f3bd0f1a6df43bcbc114b5fb88127eedc2";
const frozen = {
  remediationAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-authority.json", "f7babca2616f5a901a6c5946770029a39630e46f2e168977fa0b31e82abc4430"],
  remediationContract: ["docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-contract.md", "fac68f9258e8a58fcba6392e61e59274ce39efd57aca386c0d477904127b8a5c"],
  remediationGuard: ["scripts/restaurant-performance-p2v-perf-001b-c01-remediation-guard.mjs", "1f92fc6785285fdc4fac09be39d2a69caa3fd4c28a65c1512f8b400ace69af3b"],
  baseContract: ["docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md", "81af13e4078a7ed820a7088472ab449b00bc50514fdeef11fdeaecc4170e28f2"],
  baseAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json", "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade"],
  baseGuard: ["scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs", "dc18308ff9735fabf266cef0f4591a34bf099bf2527753146000baddee319292"],
  planAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-authority.json", "ce9236f9a5855b041fa9edb8dc667378e8303168a12b782a1a52510cf1a22067"],
  planContract: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-contract.md", "a9429e148c7bbfdb3e13465847a8ef60aafbc8d864344ce8dae8b67fa09ab7c4"],
  planGuard: ["scripts/restaurant-performance-p2v-perf-001a-d1-plan-metric-semantics-guard.mjs", "137744cc9282333c691a22e206bec04e32fd540015cc7e6b303f218917687f00"],
  datasetAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-authority.json", "a9b6c7669291c6ae8ebd1e09fa50c412c3b5c651b0ba3b511f783f8f4afe4a9f"],
  datasetContract: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-contract.md", "f1b8bd99629e98a2bbf244060bc2c1034942a1e6f687b9137f3778941e17c4d4"],
  datasetGuard: ["scripts/restaurant-performance-p2v-perf-001b-dataset-semantics-guard.mjs", "ac7da82a0870b490e39ad0a953c32ddac66b819ca03058b110ef4ea6ea724601"]
};

const baseAuthorityPath = frozen.baseAuthority[0];
const baseAuthoritySha = frozen.baseAuthority[1];
const provenanceSha = "bff5009d76878f2e459ac81db63b0ca935d205b7dc2db198d70285a55c49e5a1";
const canonicalReferenceArtifacts = {
  [baseAuthorityPath]: { sha256: baseAuthoritySha, referenceKinds: ["frozen-case-isolation", "isolation-predicate", "actor", "tenant", "branch", "claims"] },
  [provenancePath]: { sha256: provenanceSha, referenceKinds: ["diagnosis-evidence"] }
};
const canonicalReferenceTargets = [
  { referenceKind: "frozen-case-isolation", sourceArtifact: baseAuthorityPath, jsonPointer: "/cases/0", targetSha256: "dd979d2bd0cf13f95a6d26a10d76667c7d4d1022e5da9e6ef9bad8e95e5f4acd" },
  { referenceKind: "isolation-predicate", sourceArtifact: baseAuthorityPath, jsonPointer: "/functions/0/filter", targetSha256: "24644038ce8bfc0e526fc7a3b1eb3d3d38c35c04122d902aab255dd77f4611aa" },
  { referenceKind: "actor", sourceArtifact: baseAuthorityPath, jsonPointer: "/actors/3", targetSha256: "133141294623fb507ebe692879e1451c93cc78dff547eec7bfe9fe9ea5acd276" },
  { referenceKind: "tenant", sourceArtifact: baseAuthorityPath, jsonPointer: "/targets/noiseTenant01", targetSha256: "9b19dca6f15fbacd6ad915fce397e8b7c40d9445896741c180339d9cb46c88f5" },
  { referenceKind: "branch", sourceArtifact: baseAuthorityPath, jsonPointer: "/actors/3/branchUuids", targetSha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" },
  { referenceKind: "claims", sourceArtifact: baseAuthorityPath, jsonPointer: "/actors/3/authUserUuid", targetSha256: "a24ab25ae82fb620ab6f5ab70ae9c9c22129fe481252c3518b3df771ec1b0220" },
  { referenceKind: "diagnosis-evidence", claimId: "candidate-cold-suite-a", sourceArtifact: provenancePath, jsonPointer: "/verifiedRawEvidence/candidateColdSharedHitBlocks/candidate-suite-a", targetSha256: "0d866ba9f9fd0f2cbb2134daf52356d2021a3686352d5c19d967305bf9e4bbdc" },
  { referenceKind: "diagnosis-evidence", claimId: "candidate-warm-suite-a-first", sourceArtifact: provenancePath, jsonPointer: "/verifiedRawEvidence/candidateMeasuredWarmSharedHitBlocks/candidate-suite-a/0", targetSha256: "41cfc0d1f2d127b04555b7246d84019b4d27710a3f3aff6e7764375b1e06e05d" },
  { referenceKind: "diagnosis-evidence", claimId: "second-backend-suite-a", sourceArtifact: provenancePath, jsonPointer: "/verifiedRawEvidence/secondFreshBackendSharedHitBlocks/candidate-suite-a", targetSha256: "82887006d04d939ffca870bc268a940df6cf01dbdf12e228ccf476d07d7c9424" },
  { referenceKind: "diagnosis-evidence", claimId: "discard-sequence-suite-a", sourceArtifact: provenancePath, jsonPointer: "/verifiedRawEvidence/discardPlansSharedHitSequence/candidate-suite-a", targetSha256: "a428267c8338c5f1f060e7147c2e1fbe184301baa7ef3f5fc703302616b86e82" },
  { referenceKind: "diagnosis-evidence", claimId: "c01-inner-zero-node", sourceArtifact: provenancePath, jsonPointer: "/verifiedRawEvidence/infinityNodes/0", targetSha256: "68d853c9d02e3301cf00248802a896bd2a90f827a785fb283a6ac049a6ab0d41" }
];
const expectedReferenceResolution = {
  callerSuppliedResolutionFlagsAuthoritative: false,
  completenessDeterminedBy: "Guard runtime artifact identity, RFC 6901 pointer, and expected-target semantic resolution",
  descriptorFields: ["referenceKind", "sourceArtifact", "jsonPointer"],
  failureDisposition: "FAIL",
  closedArtifactAllowlist: Object.entries(canonicalReferenceArtifacts).map(([artifactPath, value]) => ({ path: artifactPath, sha256: value.sha256, referenceKinds: value.referenceKinds })),
  pathSafety: { repositoryRelativePosixOnly: true, absoluteTraversalBackslashNulUriRejected: true, regularFileRequired: true, symlinkRejected: true, realpathContainmentRequired: true },
  jsonPointer: { standard: "RFC 6901", rootPointerAllowed: false, tildeZeroAndOneDecoded: true, illegalEscapeRejected: true, canonicalArrayIndexesOnly: true, dashRejected: true, existenceIndependentOfTruthiness: true },
  expectedTargets: canonicalReferenceTargets
};

const expectedEstimateRatioClassifications = {
  kind: "ordered-closed-decision-table",
  firstMatchWins: true,
  formulaPreserved: "planned = Plan Rows * Actual Loops; actual = Actual Rows * Actual Loops; ratio = zeroAwareSymmetricRatio(planned, actual)",
  frozenThresholdPreserved: true,
  finiteEvaluatedExcludesZeroActual: true,
  rules: [
    { order: 1, id: "NON_FINITE_OR_UNCLASSIFIED", when: { planRows: "missing-or-not-number-or-non-finite-or-negative", actualRows: "any", actualLoops: "any", isolationProof: "any" }, verdict: "FAIL" },
    { order: 2, id: "NON_FINITE_OR_UNCLASSIFIED", when: { planRows: "valid-non-negative-number", actualRows: "missing-or-not-number-or-non-finite-or-negative", actualLoops: "any", isolationProof: "any" }, verdict: "FAIL" },
    { order: 3, id: "ZERO_ESTIMATE_WITH_ACTUAL_ROWS", when: { planRows: "equal-zero", actualRows: "greater-than-zero", actualLoops: "any", isolationProof: "any" }, verdict: "FAIL" },
    { order: 4, id: "NON_FINITE_OR_UNCLASSIFIED", when: { planRows: "equal-zero", actualRows: "equal-zero", actualLoops: "any", isolationProof: "any" }, verdict: "FAIL" },
    { order: 5, id: "EXPECTED_ZERO_ACTUAL_ISOLATION", when: { planRows: "greater-than-zero", actualRows: "equal-zero", actualLoops: "valid-non-negative-number", isolationProof: "complete-and-resolved" }, verdict: "SEMANTIC_NA" },
    { order: 6, id: "UNEXPECTED_ZERO_ACTUAL", when: { planRows: "greater-than-zero", actualRows: "equal-zero", actualLoops: "any-other-value", isolationProof: "missing-incomplete-failed-or-unresolved" }, verdict: "FAIL" },
    { order: 7, id: "FINITE_EVALUATED", when: { planRows: "greater-than-zero", actualRows: "greater-than-zero", actualLoops: "valid-non-negative-number", existingFrozenRatio: "finite" }, verdict: "APPLY_EXISTING_FROZEN_THRESHOLD" },
    { order: 8, id: "NON_FINITE_OR_UNCLASSIFIED", when: { classification: "not-matched-by-orders-1-through-7" }, verdict: "FAIL" }
  ],
  isolationProof: {
    allRequired: true,
    truthySubstitutionProhibited: true,
    requiredFields: [
      { id: "frozenCaseIsolationRequirement", type: "object", requiredKeys: ["caseId", "requirementId", "isolationKind", "referenceKind", "sourceArtifact", "jsonPointer"], allowedIsolationKinds: ["branch", "tenant"], referenceMustResolve: true },
      { id: "outerAuthorizationPass", type: "boolean", const: true },
      { id: "outerRowCountSemanticsPass", type: "boolean", const: true },
      { id: "outerPayloadSemanticsPass", type: "boolean", const: true },
      { id: "auditableNodeIsolationPredicateReference", type: "object", requiredKeys: ["nodePath", "predicateField", "predicateText", "policyOrJoinReference", "referenceKind", "sourceArtifact", "jsonPointer"], referenceMustResolve: true },
      { id: "directInnerFunctionOwner", type: "string", const: "restaurant_membership_context_reader" },
      { id: "directInnerOwnerRolsuper", type: "boolean", const: false },
      { id: "directInnerOwnerRolbypassrls", type: "boolean", const: false },
      { id: "actorFrozenDatasetReference", type: "object", requiredKeys: ["actorId", "referenceKind", "sourceArtifact", "jsonPointer"], referenceMustResolve: true },
      { id: "tenantFrozenDatasetReference", type: "object", requiredKeys: ["tenantId", "referenceKind", "sourceArtifact", "jsonPointer"], referenceMustResolve: true },
      { id: "branchFrozenDatasetReference", type: "object", requiredKeys: ["branchDisposition", "referenceKind", "sourceArtifact", "jsonPointer"], referenceMustResolve: true },
      { id: "claimsFrozenDatasetReference", type: "object", requiredKeys: ["claimSubject", "referenceKind", "sourceArtifact", "jsonPointer"], referenceMustResolve: true },
      { id: "planRows", type: "finite-non-negative-number", preservedInRawEvidence: true },
      { id: "actualRows", type: "finite-non-negative-number", const: 0, preservedInRawEvidence: true },
      { id: "actualLoops", type: "finite-non-negative-number", preservedInRawEvidence: true },
      { id: "evidenceReferences", type: "array", minimumItems: 5, requiredKeys: ["claimId", "referenceKind", "sourceArtifact", "jsonPointer"], eachReferenceMustExistAndResolve: true }
    ]
  },
  referenceResolution: expectedReferenceResolution,
  partitionProperties: {
    deterministic: true,
    mutuallyExclusiveByFirstMatch: true,
    completeByFinalFailClosedRule: true,
    zeroEstimatePositiveActualCannotFallThrough: true,
    zeroEstimateZeroActualFails: true,
    unclassifiedFails: true
  }
};

const requiredCandidateSuiteKeys = ["candidate-suite-a", "candidate-suite-b"];
const validNonNegativeNumber = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const nonBlankString = value => typeof value === "string" && value.trim().length > 0 && value === value.trim();
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const callerClaimKeys = ["resolved", "exists", "verified", "valid", "expectedHash", "sha256"];

function validReferenceShape(value, requiredKeys) {
  return isPlainObject(value)
    && requiredKeys.every(key => nonBlankString(value[key]))
    && callerClaimKeys.every(key => !Object.prototype.hasOwnProperty.call(value, key));
}

function resolveJsonPointer(document, pointer) {
  if (typeof pointer !== "string" || pointer.length === 0 || !pointer.startsWith("/")) return { ok: false };
  let value = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/.test(rawToken)) return { ok: false };
    const token = rawToken.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(value)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(token)) return { ok: false };
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= value.length) return { ok: false };
      value = value[index];
    } else if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, token)) {
      value = value[token];
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value };
}

function resolveCanonicalReference(reference, context = {}) {
  const repositoryRoot = path.resolve(context.root ?? root);
  const artifacts = context.artifacts ?? canonicalReferenceArtifacts;
  const targets = context.targets ?? canonicalReferenceTargets;
  if (!validReferenceShape(reference, ["referenceKind", "sourceArtifact", "jsonPointer"])) return { ok: false };
  const source = reference.sourceArtifact;
  if (source.includes("\\") || source.includes("\0") || path.posix.isAbsolute(source) || /^[a-z][a-z0-9+.-]*:/i.test(source)) return { ok: false };
  if (source.split("/").some(segment => segment === ".." || segment === "") || path.posix.normalize(source) !== source) return { ok: false };
  const trusted = artifacts[source];
  if (!trusted || !trusted.referenceKinds.includes(reference.referenceKind)) return { ok: false };
  const expected = targets.find(target => target.referenceKind === reference.referenceKind
    && target.sourceArtifact === source
    && target.jsonPointer === reference.jsonPointer
    && (reference.referenceKind !== "diagnosis-evidence" || target.claimId === reference.claimId));
  if (!expected) return { ok: false };
  try {
    const fullPath = path.resolve(repositoryRoot, ...source.split("/"));
    const relative = path.relative(repositoryRoot, fullPath);
    if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return { ok: false };
    const linkInfo = fs.lstatSync(fullPath);
    if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) return { ok: false };
    const realRoot = fs.realpathSync(repositoryRoot);
    const realFile = fs.realpathSync(fullPath);
    if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) return { ok: false };
    const bytes = fs.readFileSync(realFile);
    if (digest(bytes) !== trusted.sha256) return { ok: false };
    const document = JSON.parse(bytes.toString("utf8"));
    const resolved = resolveJsonPointer(document, reference.jsonPointer);
    if (!resolved.ok || digest(JSON.stringify(resolved.value)) !== expected.targetSha256) return { ok: false };
    return resolved;
  } catch {
    return { ok: false };
  }
}

function completeIsolationProof(proof) {
  if (!isPlainObject(proof) || Object.keys(proof).length !== expectedEstimateRatioClassifications.isolationProof.requiredFields.length) return false;
  const frozenCase = proof.frozenCaseIsolationRequirement;
  if (!validReferenceShape(frozenCase, ["caseId", "requirementId", "isolationKind", "referenceKind", "sourceArtifact", "jsonPointer"])) return false;
  if (frozenCase.caseId !== "C01" || frozenCase.requirementId !== "c01-access-context-same-tenant-active-branch-scope" || frozenCase.isolationKind !== "branch" || frozenCase.referenceKind !== "frozen-case-isolation") return false;
  const caseResolution = resolveCanonicalReference(frozenCase);
  if (!caseResolution.ok || caseResolution.value.caseId !== "C01" || caseResolution.value.actorId !== "A04" || caseResolution.value.functionName !== "restaurant_current_access_context_v1" || caseResolution.value.expectedAuthorizationDisposition !== "allow exact rows") return false;
  if (proof.outerAuthorizationPass !== true || proof.outerRowCountSemanticsPass !== true || proof.outerPayloadSemanticsPass !== true) return false;
  const predicate = proof.auditableNodeIsolationPredicateReference;
  if (!validReferenceShape(predicate, ["nodePath", "predicateField", "predicateText", "policyOrJoinReference", "referenceKind", "sourceArtifact", "jsonPointer"])) return false;
  if (predicate.nodePath !== "verifiedRawEvidence.infinityNodes[0]" || predicate.predicateField !== "filter" || predicate.policyOrJoinReference !== "restaurant_membership_branch_scopes" || predicate.referenceKind !== "isolation-predicate") return false;
  const predicateResolution = resolveCanonicalReference(predicate);
  if (!predicateResolution.ok || predicate.predicateText !== predicateResolution.value || !predicateResolution.value.includes("same-tenant active branch scope")) return false;
  if (proof.directInnerFunctionOwner !== "restaurant_membership_context_reader" || proof.directInnerOwnerRolsuper !== false || proof.directInnerOwnerRolbypassrls !== false) return false;
  const bindings = [
    [proof.actorFrozenDatasetReference, "actor", "actorId", "A04"],
    [proof.tenantFrozenDatasetReference, "tenant", "tenantId", "noise-01"],
    [proof.branchFrozenDatasetReference, "branch", "branchDisposition", "owner-has-no-active-branch-scope"],
    [proof.claimsFrozenDatasetReference, "claims", "claimSubject", "A04-auth-user"]
  ];
  for (const [reference, kind, semanticKey, semanticValue] of bindings) {
    if (!validReferenceShape(reference, [semanticKey, "referenceKind", "sourceArtifact", "jsonPointer"]) || reference.referenceKind !== kind || reference[semanticKey] !== semanticValue || !resolveCanonicalReference(reference).ok) return false;
  }
  if (proof.planRows !== 1 || proof.actualRows !== 0 || proof.actualLoops !== 5) return false;
  if (!Array.isArray(proof.evidenceReferences) || proof.evidenceReferences.length !== 5) return false;
  const expectedClaims = canonicalReferenceTargets.filter(target => target.referenceKind === "diagnosis-evidence").map(target => target.claimId);
  if (!same(proof.evidenceReferences.map(reference => reference.claimId), expectedClaims)) return false;
  if (!proof.evidenceReferences.every(reference => validReferenceShape(reference, ["claimId", "referenceKind", "sourceArtifact", "jsonPointer"])
    && reference.referenceKind === "diagnosis-evidence" && resolveCanonicalReference(reference).ok)) return false;
  return true;
}

function classifyEstimateRatio({ planRows, actualRows, actualLoops, isolationProof, ratio }) {
  if (!validNonNegativeNumber(planRows)) return { id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
  if (!validNonNegativeNumber(actualRows)) return { id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
  if (planRows === 0 && actualRows > 0) return { id: "ZERO_ESTIMATE_WITH_ACTUAL_ROWS", verdict: "FAIL" };
  if (planRows === 0 && actualRows === 0) return { id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
  if (planRows > 0 && actualRows === 0 && validNonNegativeNumber(actualLoops) && completeIsolationProof(isolationProof)) return { id: "EXPECTED_ZERO_ACTUAL_ISOLATION", verdict: "SEMANTIC_NA" };
  if (planRows > 0 && actualRows === 0) return { id: "UNEXPECTED_ZERO_ACTUAL", verdict: "FAIL" };
  if (planRows > 0 && actualRows > 0 && validNonNegativeNumber(actualLoops) && typeof ratio === "number" && Number.isFinite(ratio)) return { id: "FINITE_EVALUATED", verdict: "APPLY_EXISTING_FROZEN_THRESHOLD" };
  return { id: "NON_FINITE_OR_UNCLASSIFIED", verdict: "FAIL" };
}

function completeProofFixture() {
  const baseReference = (referenceKind, jsonPointer, values = {}) => ({ ...values, referenceKind, sourceArtifact: baseAuthorityPath, jsonPointer });
  return {
    frozenCaseIsolationRequirement: baseReference("frozen-case-isolation", "/cases/0", { caseId: "C01", requirementId: "c01-access-context-same-tenant-active-branch-scope", isolationKind: "branch" }),
    outerAuthorizationPass: true,
    outerRowCountSemanticsPass: true,
    outerPayloadSemanticsPass: true,
    auditableNodeIsolationPredicateReference: baseReference("isolation-predicate", "/functions/0/filter", { nodePath: "verifiedRawEvidence.infinityNodes[0]", predicateField: "filter", predicateText: "request actor UUID plus enabled restaurant user, active membership, active role, frozen permissions and same-tenant active branch scope", policyOrJoinReference: "restaurant_membership_branch_scopes" }),
    directInnerFunctionOwner: "restaurant_membership_context_reader",
    directInnerOwnerRolsuper: false,
    directInnerOwnerRolbypassrls: false,
    actorFrozenDatasetReference: baseReference("actor", "/actors/3", { actorId: "A04" }),
    tenantFrozenDatasetReference: baseReference("tenant", "/targets/noiseTenant01", { tenantId: "noise-01" }),
    branchFrozenDatasetReference: baseReference("branch", "/actors/3/branchUuids", { branchDisposition: "owner-has-no-active-branch-scope" }),
    claimsFrozenDatasetReference: baseReference("claims", "/actors/3/authUserUuid", { claimSubject: "A04-auth-user" }),
    planRows: 1,
    actualRows: 0,
    actualLoops: 5,
    evidenceReferences: canonicalReferenceTargets.filter(target => target.referenceKind === "diagnosis-evidence").map(({ claimId, referenceKind, sourceArtifact, jsonPointer }) => ({ claimId, referenceKind, sourceArtifact, jsonPointer }))
  };
}

function classificationFixtureIssues() {
  const proof = completeProofFixture();
  const fixtures = [
    ["missing-plan", { actualRows: 1, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["missing-actual", { planRows: 1, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["negative-plan", { planRows: -1, actualRows: 1, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["negative-actual", { planRows: 1, actualRows: -1, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["nan-actual", { planRows: 1, actualRows: Number.NaN, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["infinite-plan", { planRows: Infinity, actualRows: 1, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["infinite-actual", { planRows: 1, actualRows: Infinity, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["zero-estimate-positive-actual", { planRows: 0, actualRows: 1, actualLoops: 1, ratio: Infinity }, "ZERO_ESTIMATE_WITH_ACTUAL_ROWS", "FAIL"],
    ["both-zero", { planRows: 0, actualRows: 0, actualLoops: 1, ratio: 1 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["expected-isolation", { planRows: 1, actualRows: 0, actualLoops: 5, isolationProof: proof, ratio: Infinity }, "EXPECTED_ZERO_ACTUAL_ISOLATION", "SEMANTIC_NA"],
    ["missing-isolation-proof", { planRows: 1, actualRows: 0, actualLoops: 5, ratio: Infinity }, "UNEXPECTED_ZERO_ACTUAL", "FAIL"],
    ["invalid-loops-isolation", { planRows: 1, actualRows: 0, actualLoops: -1, isolationProof: proof, ratio: Infinity }, "UNEXPECTED_ZERO_ACTUAL", "FAIL"],
    ["finite", { planRows: 2, actualRows: 1, actualLoops: 5, ratio: 2 }, "FINITE_EVALUATED", "APPLY_EXISTING_FROZEN_THRESHOLD"],
    ["missing-loops", { planRows: 2, actualRows: 1, ratio: 2 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["negative-loops", { planRows: 2, actualRows: 1, actualLoops: -1, ratio: 2 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["nan-loops", { planRows: 2, actualRows: 1, actualLoops: Number.NaN, ratio: 2 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["infinite-loops", { planRows: 2, actualRows: 1, actualLoops: Infinity, ratio: 2 }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"],
    ["positive-non-finite-ratio", { planRows: 2, actualRows: 1, actualLoops: 5, ratio: Infinity }, "NON_FINITE_OR_UNCLASSIFIED", "FAIL"]
  ];
  return fixtures.flatMap(([name, input, expectedId, expectedVerdict]) => {
    const actual = classifyEstimateRatio(input);
    return actual.id === expectedId && actual.verdict === expectedVerdict ? [] : [`${name}:${actual.id}:${actual.verdict}`];
  });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => JSON.parse(JSON.stringify(value));
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const fileDigest = relativePath => digest(fs.readFileSync(path.join(root, relativePath)));
const git = (args, allowFailure = false) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
};

function parseJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function validateAuthority(a) {
  const issues = [];
  const add = (condition, code) => { if (!condition) issues.push(code); };
  add(a?.schemaVersion === 1 && a?.authorityId === "P2V-PERF-001B-C01-CONTRACT-REAUTHORIZATION-CANDIDATE-1" && a?.status === "candidate", "identity");
  add(a?.nature?.supplemental === true && a?.nature?.prospective === true && a?.nature?.rewritesExistingFrozenAuthority === false && /independent review and Freeze/.test(a?.nature?.supersedingEffect ?? "") && /BLOCKED remains BLOCKED/.test(a?.nature?.existingBlockedSuiteDisposition ?? ""), "supplemental-prospective");
  add(a?.parentFrozenHead === head && a?.parentCommit === parent, "head-binding");
  add(a?.immutableMigrationCandidatePath === migrationCandidate && a?.immutableMigrationCandidateSha256 === migrationSha, "candidate-sha");
  add(a?.sourceDiagnosisReportSha256 === diagnosisSha && a?.sourceFocusedEvidenceSha256 === focusedSha && a?.datasetSemanticHash === datasetHash, "source-bindings");
  add(same(Object.keys(a?.frozenBindings ?? {}).sort(), Object.keys(frozen).sort()) && Object.entries(frozen).every(([key, [p, sha]]) => a.frozenBindings[key]?.path === p && a.frozenBindings[key]?.sha256 === sha), "frozen-bindings");
  add(Array.isArray(a?.supersededClauseIds) && a.supersededClauseIds.length === 5 && a.supersededClauseIds.some(x => x.includes("maxSharedHitBlocks")) && a.supersededClauseIds.some(x => x.includes("one-zero")) && a.supersededClauseIds.some(x => x.includes("direct-inner")), "superseded-clauses");
  add(Array.isArray(a?.preservedClauseIds) && a.preservedClauseIds.some(x => x.includes("35-cases-and-9-profiles")) && a.preservedClauseIds.some(x => x.includes("two-fresh")) && a.preservedClauseIds.some(x => x.includes("RLS")), "preserved-clauses");
  add(Array.isArray(a?.authorizedFuturePaths) && a.authorizedFuturePaths.length === 4 && same(a.authorizedFuturePaths.map(x => x.path), expectedFuturePaths) && a.authorizedFuturePaths.every(x => x.status === "new path allowed to create"), "future-whitelist");
  add(a?.authorizedFuturePaths?.every(x => !git(["ls-files", "--error-unmatch", x.path], true).stdout.trim()), "future-new-only");
  add(Array.isArray(a?.forbiddenPaths) && a.forbiddenPaths.includes(migrationCandidate) && a.forbiddenPaths.includes("package.json") && a.forbiddenPaths.includes("/tmp"), "forbidden-paths");
  add(Array.isArray(a?.forbiddenChangeClasses) && ["existing-tracked-migration", "dataset-case-or-profile", "RLS-policy-or-tenant-predicate", "application-code", "package-or-lockfile", "git-remote-state"].every(x => a.forbiddenChangeClasses.includes(x)), "forbidden-classes");
  const cold = a?.coldRunDefinition;
  add(cold?.samePersistentBackend === true && cold?.required === true && cold?.primingProhibited === true && /unchanged/.test(cold?.serverLatencyGate ?? "") && Array.isArray(cold?.requiredEvidence) && cold.requiredEvidence.length === 9, "cold-required");
  const warm = a?.warmRunDefinition;
  add(same(warm?.warmups, ["warm-up-1", "warm-up-2"]) && same(warm?.measured, ["measured-1", "measured-2", "measured-3", "measured-4", "measured-5", "measured-6", "measured-7"]) && warm?.samePersistentBackendAsCold === true && warm?.reconnectProhibited === true, "persistent-run-sequence");
  const aggregation = a?.warmAggregationDefinition;
  add(/exactly seven/.test(aggregation?.warmMedianMs ?? "") && /exactly seven/.test(aggregation?.warmMaximumMs ?? "") && aggregation?.maxSharedHitBlocks?.threshold === 256 && aggregation?.maxSharedHitBlocks?.operator === "<=" && aggregation?.maxSharedHitBlocks?.runs === "exactly seven measured warm runs" && aggregation?.maxSharedHitBlocks?.aggregation === "maximum" && aggregation?.maxSharedHitBlocks?.allRunsMustPass === true && same(aggregation?.forbiddenInputs, ["cold", "warm-ups", "Planning buffers", "clientWallTimeMs"]) && aggregation?.selectionOrMedianSubstitutionProhibited === true, "warm-only-aggregation");
  const coldBuffers = a?.coldBufferClassification;
  add(coldBuffers?.classification === "COLD_FIRST_SESSION_PLAN_INITIALIZATION" && coldBuffers?.planningAndExecutionBuffersPreservedSeparately === true && coldBuffers?.warm256GateApplies === false && coldBuffers?.newColdBufferLimitInvented === false && coldBuffers?.coldExecutionTimeGatePreserved === true && coldBuffers?.twoSuitesReportedSideBySide === true && coldBuffers?.byteIdentityRequired === false && coldBuffers?.missingNonFiniteOrUnparseable === "FAIL", "cold-buffer-classification");
  add(same(a?.estimateRatioClassifications, expectedEstimateRatioClassifications), "estimate-ratio-canonical-table");
  const identity = a?.directInnerIdentityRequirements;
  add(identity?.executionRole === "exact function owner restaurant_membership_context_reader" && identity?.postgresSuperuserProhibited === true && identity?.bypassRlsProhibited === true && identity?.serviceRoleShortcutProhibited === true && same(identity?.requiredRoleProof, { rolsuper: false, rolbypassrls: false }) && Array.isArray(identity?.requiredEvidence) && identity.requiredEvidence.includes("current_user") && identity.requiredEvidence.includes("session_user") && identity?.missingIdentityClaimsOrRlsProof === "FAIL", "secure-direct-inner");
  const suites = a?.twoSuiteRequirements;
  add(suites?.count === 2 && suites?.fresh === true && suites?.independent === true && suites?.postgresVersion === "17.6" && suites?.rerunAfterFreeze === true && /all 35 cases, all 9 profiles/.test(suites?.coverage ?? "") && suites?.suiteSeparationRequired === true, "two-suites");
  add(Array.isArray(a?.securityInvariants) && a.securityInvariants.some(x => x.includes("NOBYPASSRLS")) && a.securityInvariants.some(x => x.includes("RLS")) && a.securityInvariants.some(x => x.includes("cross-tenant")), "security-invariants");
  add(a?.requiredIndependentReview === true && a?.requiredFreezeBeforeImplementation === true && a?.noRetroactivePass === true, "lifecycle");
  add(a?.failureSemantics?.missingEvidence === "FAIL" && a?.failureSemantics?.invalidOrNonFiniteMetric === "FAIL" && a?.failureSemantics?.identityOrSecurityProofMissing === "FAIL" && a?.failureSemantics?.inventoryOrHashMismatch === "FAIL" && a?.failureSemantics?.unauthorizedChange === "FAIL", "failure-semantics");
  return issues;
}

function validateContract(contract, a) {
  const required = [
    "supplemental, prospective reauthorization", "noRetroactivePass = true", "existing BLOCKED suite remains BLOCKED",
    "1,224 shared hits", "52 shared hits", "1,949 hits", "52 -> 842 -> 52", "790 planning hits plus 52 execution hits",
    "Plan Rows 1, Actual Rows 0, and Actual Loops 5", "BYPASSRLS-defective", "SECURITY DEFINER",
    "cold-first-session -> warm-up 1 -> warm-up 2 -> seven measured warm runs", "maxSharedHitBlocks <= 256",
    "EXPECTED_ZERO_ACTUAL_ISOLATION", "UNEXPECTED_ZERO_ACTUAL", "ZERO_ESTIMATE_WITH_ACTUAL_ROWS", "NON_FINITE_OR_UNCLASSIFIED",
    "rolsuper = false", "rolbypassrls = false", "all 35 cases", "all 9 profiles", "Future implementation files have not been created"
  ];
  const issues = [];
  if (!required.every(token => contract.includes(token))) issues.push("required-language");
  if (!candidatePaths.slice(0, 3).every(p => contract.includes(path.basename(p)))) issues.push("candidate-cross-reference");
  if (!expectedFuturePaths.every(p => contract.includes(p))) issues.push("future-whitelist-language");
  if (a.authorizedFuturePaths.length !== 4 || (contract.match(/Status: `new path allowed to create`/g) ?? []).length !== 4) issues.push("future-whitelist-count");
  const canonicalMatch = contract.match(/```json contract-estimate-ratio-decision-table\n([\s\S]*?)\n```/);
  let markdownTable = null;
  try { markdownTable = canonicalMatch === null ? null : JSON.parse(canonicalMatch[1]); } catch { markdownTable = null; }
  if (!same(markdownTable, expectedEstimateRatioClassifications) || !same(markdownTable, a.estimateRatioClassifications)) issues.push("estimate-ratio-markdown-deep-binding");
  if (!contract.includes("auditably linked") || contract.includes("audibly linked")) issues.push("auditable-link-language");
  if (!contract.includes("all sixteen typed fields") || !contract.includes("truthy flag")) issues.push("isolation-proof-language");
  return issues;
}

function validateProvenance(p) {
  const issues = [];
  if (p?.postgresVersion !== "17.6" || p?.candidateSha256 !== migrationSha || p?.datasetSemanticHash !== datasetHash) issues.push("identity");
  if (!Array.isArray(p?.environmentIdentities) || !same(p.environmentIdentities, ["baseline-suite-a", "baseline-suite-b", "candidate-suite-a", "candidate-suite-b"])) issues.push("environment-inventory");
  if (!Array.isArray(p?.sources) || p.sources.length !== 2 || !same(p.sources.map(x => x.sha256), [diagnosisSha, focusedSha])) issues.push("source-shas");
  const raw = p?.verifiedRawEvidence;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [...issues, "raw-evidence-group"];
  const cold = raw.candidateColdSharedHitBlocks;
  if (cold === null || typeof cold !== "object" || Array.isArray(cold) || !same(Object.keys(cold), requiredCandidateSuiteKeys) || !same(cold, { "candidate-suite-a": 1224, "candidate-suite-b": 1224 })) issues.push("cold");
  const warm = raw.candidateMeasuredWarmSharedHitBlocks;
  if (warm === null || typeof warm !== "object" || Array.isArray(warm) || !same(Object.keys(warm), requiredCandidateSuiteKeys)) {
    issues.push("warm-group");
  } else if (!requiredCandidateSuiteKeys.every(key => Array.isArray(warm[key]) && warm[key].length === 7 && warm[key].every(value => value === 52))) {
    issues.push("warm-runs");
  }
  const backend = raw.secondFreshBackendSharedHitBlocks;
  if (backend === null || typeof backend !== "object" || Array.isArray(backend) || !same(Object.keys(backend), requiredCandidateSuiteKeys) || !same(backend, { "candidate-suite-a": 1949, "candidate-suite-b": 1949 })) issues.push("new-backend");
  const discard = raw.discardPlansSharedHitSequence;
  if (discard === null || typeof discard !== "object" || Array.isArray(discard) || !same(Object.keys(discard), [...requiredCandidateSuiteKeys, "notation"])) {
    issues.push("discard-plans-group");
  } else if (discard.notation !== "52 -> 842 -> 52" || !requiredCandidateSuiteKeys.every(key => Array.isArray(discard[key]) && discard[key].length === 3 && same(discard[key], [52, 842, 52]))) {
    issues.push("discard-plans-sequence");
  }
  if (raw?.secureDirectInnerWarm?.planningSharedHitBlocks !== 790 || raw?.secureDirectInnerWarm?.executionSharedHitBlocks !== 52) issues.push("secure-inner");
  if (raw?.oldCold?.executionSharedHitBlocks !== 1753 || raw?.oldCold?.executionSharedReadBlocks !== 179) issues.push("old-cold");
  if (!Array.isArray(raw?.infinityNodes) || raw.infinityNodes.length < 1 || raw.infinityNodes.some(x => x.caseId !== "C01" || x.thresholdProfile !== "accessTypical" || x.track !== "inner" || x.planRows !== 1 || x.actualRows !== 0 || x.actualLoops !== 5)) issues.push("infinity-node");
  if (raw?.secureFunctionOwner?.rolsuper !== false || raw?.secureFunctionOwner?.rolbypassrls !== false || !/BYPASSRLS/.test(raw?.oldDirectInnerEvidenceDefect ?? "")) issues.push("identity-defect");
  if (!Array.isArray(p?.inferences) || p.inferences.length < 2) issues.push("raw-inference-separation");
  const sanitizationKeys = ["credentialsIncluded", "tokensIncluded", "passwordsIncluded", "connectionStringsIncluded", "jwtIncluded", "serviceRoleKeysIncluded", "personalDataIncluded", "developmentOrProductionSecretsIncluded"];
  if (p?.sanitization === null || typeof p?.sanitization !== "object" || Array.isArray(p.sanitization) || !same(Object.keys(p.sanitization), sanitizationKeys) || !sanitizationKeys.every(key => p.sanitization[key] === false)) issues.push("sanitization");
  return issues;
}

function snapshot() {
  const entries = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.split(/\r?\n/).filter(Boolean).map(line => ({ status: line.slice(0, 2), path: line.slice(3) }));
  return {
    branch: git(["branch", "--show-current"]).stdout.trim(),
    head: git(["rev-parse", "HEAD"]).stdout.trim(),
    parent: git(["rev-parse", "HEAD^"]).stdout.trim(),
    staged: git(["diff", "--cached", "--quiet"], true).status !== 0,
    tracked: git(["diff", "--quiet", "HEAD", "--"], true).status !== 0,
    entries
  };
}

function validateSnapshot(s) {
  const issues = [];
  if (s.branch !== "main") issues.push("branch");
  if (s.head !== head || s.parent !== parent) issues.push("head");
  if (s.staged) issues.push("staged");
  if (s.tracked) issues.push("tracked-modification");
  if (!same(s.entries.map(x => x.path).sort(), expectedUntracked)) issues.push("five-untracked-inventory");
  if (s.entries.some(x => x.status !== "??")) issues.push("untracked-status");
  return issues;
}

function formatIssues(text, label) {
  const issues = [];
  if (text.includes("\r")) issues.push(`${label}:crlf`);
  if (!text.endsWith("\n")) issues.push(`${label}:final-newline`);
  if (text.includes("\0")) issues.push(`${label}:nul`);
  if (text.split("\n").some(line => /[ \t]+$/.test(line))) issues.push(`${label}:trailing-whitespace`);
  return issues;
}

const authority = parseJson(authorityPath);
const contract = read(contractPath);
const provenance = parseJson(provenancePath);
const checks = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};

const authorityIssues = validateAuthority(authority);
record("authority schema lifecycle and narrow reauthorization semantics", authorityIssues.length === 0, authorityIssues);
const classificationIssues = classificationFixtureIssues();
record("estimate-ratio ordered partition and fail-closed fixtures", classificationIssues.length === 0, classificationIssues);
const contractIssues = validateContract(contract, authority);
record("authority and Markdown key clauses agree", contractIssues.length === 0, contractIssues);
const provenanceIssues = validateProvenance(provenance);
record("sanitized diagnosis provenance and re-derived values", provenanceIssues.length === 0, provenanceIssues);
record("Frozen remediation and nine base plan dataset artifacts byte-identical", Object.values(frozen).every(([p, sha]) => fileDigest(p) === sha));
record("migration candidate path and SHA immutable", fileDigest(migrationCandidate) === migrationSha);
record("diagnosis artifacts still present and SHA-bound", digest(fs.readFileSync("/tmp/p2v-perf-001b-diagnosis-019f895b/evidence/failure-diagnosis-report.md")) === diagnosisSha && digest(fs.readFileSync("/tmp/p2v-perf-001b-diagnosis-019f895b/evidence/focused-diagnosis.json")) === focusedSha);

const migrations = git(["ls-files", "supabase/migrations/*.sql"]).stdout.split(/\r?\n/).filter(Boolean);
record("exactly 41 tracked migrations byte-identical to HEAD", migrations.length === 41 && migrations.every(p => git(["hash-object", p]).stdout.trim() === git(["rev-parse", `HEAD:${p}`]).stdout.trim()), migrations.length);
const base = parseJson(frozen.baseAuthority[0]);
record("Frozen dataset cases profiles and two-suite scope preserved", base.cases?.length === 35 && Object.keys(base.thresholdProfiles ?? {}).length === 9 && base.suiteRepetitions === 2);
record("future implementation four paths remain absent", expectedFuturePaths.every(p => !fs.existsSync(path.join(root, p))));
const snap = snapshot();
const snapshotIssues = validateSnapshot(snap);
record("main HEAD parent exact five untracked no tracked modification staged empty", snapshotIssues.length === 0, snapshotIssues);

const candidateText = candidatePaths.map(read).join("\n");
const secretPatterns = [
  /postgres(?:ql)?:\/\//i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /\b(?:service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"']+["']/i
];
record("no secret credential token JWT or connection material", secretPatterns.every(pattern => !pattern.test(candidateText)));
record("no remote target material", !/\b(?:host|hostname|port|database|dbname|user)\s*[:=]\s*["'][^"']+["']/i.test(candidateText));
const formatting = candidatePaths.flatMap(p => formatIssues(read(p), p));
record("LF-only final newline no trailing whitespace no NUL", formatting.length === 0, formatting);

if (process.argv.includes("--self-test")) {
  const temp = fs.mkdtempSync("/tmp/p2v-perf-001b-reauthorization-negative-");
  const results = [];
  const authorityMutation = (name, mutate, expectedIssue) => {
    const value = clone(authority);
    mutate(value);
    fs.writeFileSync(path.join(temp, `${String(results.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}.json`), `${JSON.stringify(value, null, 2)}\n`);
    const pass = validateAuthority(value).includes(expectedIssue);
    results.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`);
  };
  const provenanceMutation = (name, mutate, expectedIssue) => {
    const value = clone(provenance);
    mutate(value);
    fs.writeFileSync(path.join(temp, `${String(results.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}.json`), `${JSON.stringify(value, null, 2)}\n`);
    const pass = validateProvenance(value).includes(expectedIssue);
    results.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`);
  };
  const behavior = (name, value, expected) => {
    fs.writeFileSync(path.join(temp, `${String(results.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-")}.json`), `${JSON.stringify(value, null, 2)}\n`);
    const pass = expected(value);
    results.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`);
  };
  authorityMutation("candidate SHA changed", a => { a.immutableMigrationCandidateSha256 = "0".repeat(64); }, "candidate-sha");
  authorityMutation("cold excluded", a => { a.coldRunDefinition.required = false; }, "cold-required");
  authorityMutation("warm gate mixes cold", a => { a.warmAggregationDefinition.forbiddenInputs = ["warm-ups", "Planning buffers", "clientWallTimeMs"]; }, "warm-only-aggregation");
  authorityMutation("zero rows ignored wholesale", a => { a.estimateRatioClassifications = { kind: "ignore-all-zero-rows" }; }, "estimate-ratio-canonical-table");
  authorityMutation("direct inner allows superuser or BYPASSRLS", a => { a.directInnerIdentityRequirements.postgresSuperuserProhibited = false; a.directInnerIdentityRequirements.bypassRlsProhibited = false; }, "secure-direct-inner");
  authorityMutation("two-suite requirement deleted", a => { a.twoSuiteRequirements.count = 1; }, "two-suites");
  authorityMutation("whitelist adds fifth path", a => { a.authorizedFuturePaths.push({ path: "scripts/fifth.mjs", status: "new path allowed to create", purpose: "invalid" }); }, "future-whitelist");
  authorityMutation("whitelist allows existing tracked modification", a => { a.authorizedFuturePaths[0] = { path: frozen.baseContract[0], status: "allowed to modify", purpose: "invalid" }; }, "future-whitelist");
  authorityMutation("package.json authorized", a => { a.authorizedFuturePaths[0] = { path: "package.json", status: "new path allowed to create", purpose: "invalid" }; }, "future-whitelist");
  const extraSnapshot = clone(snap);
  extraSnapshot.entries.push({ status: "??", path: "docs/runtime-integration-phase-2v-e/fifth-reauthorization-candidate.json" });
  const extraPass = validateSnapshot(extraSnapshot).includes("five-untracked-inventory");
  results.push(extraPass);
  fs.writeFileSync(path.join(temp, "10-extra-inventory.json"), `${JSON.stringify(extraSnapshot, null, 2)}\n`);
  console.log(`${extraPass ? "PASS" : "FAIL"} SELFTEST fifth reauthorization candidate rejected`);
  authorityMutation("noRetroactivePass false", a => { a.noRetroactivePass = false; }, "lifecycle");

  authorityMutation("FINITE_EVALUATED covers all nodes", a => { a.estimateRatioClassifications.rules[6].when = { classification: "all-nodes" }; }, "estimate-ratio-canonical-table");
  authorityMutation("FINITE_EVALUATED accepts Actual Rows zero", a => { a.estimateRatioClassifications.rules[6].when.actualRows = "valid-non-negative-number"; }, "estimate-ratio-canonical-table");
  for (const field of expectedEstimateRatioClassifications.isolationProof.requiredFields) {
    authorityMutation(`isolation proof requirement removed ${field.id}`, a => { a.estimateRatioClassifications.isolationProof.requiredFields = a.estimateRatioClassifications.isolationProof.requiredFields.filter(item => item.id !== field.id); }, "estimate-ratio-canonical-table");
  }
  authorityMutation("EXPECTED isolation lacks auditable predicate reference", a => { a.estimateRatioClassifications.isolationProof.requiredFields[4].requiredKeys = ["nodePath"]; }, "estimate-ratio-canonical-table");
  authorityMutation("zero estimate overlaps generic Infinity", a => { a.estimateRatioClassifications.rules[7].when = { classification: "Infinity-including-zero-estimate" }; }, "estimate-ratio-canonical-table");
  authorityMutation("Plan Rows zero Actual Rows zero allowed PASS", a => { a.estimateRatioClassifications.rules[3].verdict = "SEMANTIC_NA"; }, "estimate-ratio-canonical-table");

  const completeProof = completeProofFixture();
  for (const field of Object.keys(completeProof)) {
    const incomplete = clone(completeProof);
    delete incomplete[field];
    behavior(`runtime isolation proof missing ${field}`, incomplete, proof => classifyEstimateRatio({ planRows: 1, actualRows: 0, actualLoops: 5, isolationProof: proof, ratio: Infinity }).id === "UNEXPECTED_ZERO_ACTUAL");
  }
  const unresolvedPredicate = clone(completeProof);
  unresolvedPredicate.auditableNodeIsolationPredicateReference.resolved = false;
  behavior("runtime isolation predicate reference unresolved", unresolvedPredicate, proof => classifyEstimateRatio({ planRows: 1, actualRows: 0, actualLoops: 5, isolationProof: proof, ratio: Infinity }).id === "UNEXPECTED_ZERO_ACTUAL");
  behavior("zero estimate positive actual cannot become generic non-finite", {}, () => classifyEstimateRatio({ planRows: 0, actualRows: 2, actualLoops: 1, ratio: Infinity }).id === "ZERO_ESTIMATE_WITH_ACTUAL_ROWS");
  behavior("both zero cannot pass", {}, () => {
    const result = classifyEstimateRatio({ planRows: 0, actualRows: 0, actualLoops: 1, ratio: 1 });
    return result.id === "NON_FINITE_OR_UNCLASSIFIED" && result.verdict === "FAIL";
  });

  provenanceMutation("entire warm evidence group missing", p => { delete p.verifiedRawEvidence.candidateMeasuredWarmSharedHitBlocks; }, "warm-group");
  provenanceMutation("required warm suite group missing", p => { delete p.verifiedRawEvidence.candidateMeasuredWarmSharedHitBlocks["candidate-suite-b"]; }, "warm-group");
  provenanceMutation("warm array missing", p => { p.verifiedRawEvidence.candidateMeasuredWarmSharedHitBlocks["candidate-suite-a"] = null; }, "warm-runs");
  provenanceMutation("warm array empty", p => { p.verifiedRawEvidence.candidateMeasuredWarmSharedHitBlocks["candidate-suite-a"] = []; }, "warm-runs");
  provenanceMutation("warm array six", p => { p.verifiedRawEvidence.candidateMeasuredWarmSharedHitBlocks["candidate-suite-a"].pop(); }, "warm-runs");
  provenanceMutation("warm array eight", p => { p.verifiedRawEvidence.candidateMeasuredWarmSharedHitBlocks["candidate-suite-a"].push(52); }, "warm-runs");
  provenanceMutation("entire DISCARD sequence group missing", p => { delete p.verifiedRawEvidence.discardPlansSharedHitSequence; }, "discard-plans-group");
  provenanceMutation("required DISCARD suite sequence missing", p => { delete p.verifiedRawEvidence.discardPlansSharedHitSequence["candidate-suite-b"]; }, "discard-plans-group");
  provenanceMutation("DISCARD sequence empty", p => { p.verifiedRawEvidence.discardPlansSharedHitSequence["candidate-suite-a"] = []; }, "discard-plans-sequence");
  provenanceMutation("DISCARD sequence truncated", p => { p.verifiedRawEvidence.discardPlansSharedHitSequence["candidate-suite-a"] = [52, 842]; }, "discard-plans-sequence");
  provenanceMutation("DISCARD sequence extra value", p => { p.verifiedRawEvidence.discardPlansSharedHitSequence["candidate-suite-a"] = [52, 842, 52, 52]; }, "discard-plans-sequence");
  provenanceMutation("DISCARD sequence wrong order", p => { p.verifiedRawEvidence.discardPlansSharedHitSequence["candidate-suite-a"] = [842, 52, 52]; }, "discard-plans-sequence");
  provenanceMutation("required environment group missing", p => { p.environmentIdentities.pop(); }, "environment-inventory");

  const builtInResults = [...results];
  console.log(`BUILT-IN SELFTEST RESULT ${builtInResults.filter(Boolean).length}/${builtInResults.length} ${builtInResults.length === 64 && builtInResults.every(Boolean) ? "PASS" : "FAIL"}`);

  const classifyRejected = proof => classifyEstimateRatio({ planRows: 1, actualRows: 0, actualLoops: 5, isolationProof: proof, ratio: Infinity }).id === "UNEXPECTED_ZERO_ACTUAL";
  const mutateProof = mutate => {
    const proof = completeProofFixture();
    mutate(proof);
    return classifyRejected(proof);
  };
  let isolatedFixtureOrdinal = 0;
  const isolatedContext = ({ raw = '{"value":true}\n', trustedSha, targetPointer = "/value", targetValue = true, source = "fixtures/doc.json", kind = "test-kind", makeSymlink = false } = {}) => {
    const testRoot = path.join(temp, `reference-root-${String(++isolatedFixtureOrdinal).padStart(2, "0")}`);
    fs.mkdirSync(path.join(testRoot, "fixtures"), { recursive: true });
    const artifact = path.join(testRoot, "fixtures", "doc.json");
    if (makeSymlink) {
      const outside = path.join(temp, `outside-${isolatedFixtureOrdinal}.json`);
      fs.writeFileSync(outside, raw);
      fs.symlinkSync(outside, artifact);
    } else {
      fs.writeFileSync(artifact, raw);
    }
    const actualSha = digest(Buffer.from(raw));
    return {
      root: testRoot,
      artifacts: { [source]: { sha256: trustedSha ?? actualSha, referenceKinds: [kind] } },
      targets: [{ referenceKind: kind, sourceArtifact: source, jsonPointer: targetPointer, targetSha256: digest(JSON.stringify(targetValue)) }]
    };
  };
  const standaloneRejected = (reference, context) => !resolveCanonicalReference(reference, context).ok;
  const referenceAttacks = [
    ["nonexistent artifact with resolved true", () => mutateProof(p => { p.auditableNodeIsolationPredicateReference.sourceArtifact = "does-not-exist.json"; p.auditableNodeIsolationPredicateReference.resolved = true; })],
    ["nonexistent pointer with resolved true", () => mutateProof(p => { p.auditableNodeIsolationPredicateReference.jsonPointer = "/does/not/exist"; p.auditableNodeIsolationPredicateReference.resolved = true; })],
    ["artifact not allowed for reference kind", () => mutateProof(p => { p.auditableNodeIsolationPredicateReference.sourceArtifact = provenancePath; })],
    ["existing but unrelated pointer", () => mutateProof(p => { p.auditableNodeIsolationPredicateReference.jsonPointer = "/functions/0/name"; })],
    ["existing pointer with wrong semantic value", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/4"; })],
    ["one reference impersonates actor tenant branch claims", () => mutateProof(p => { for (const key of ["tenantFrozenDatasetReference", "branchFrozenDatasetReference", "claimsFrozenDatasetReference"]) p[key] = clone(p.actorFrozenDatasetReference); })],
    ["absolute source path", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "/etc/passwd"; })],
    ["parent traversal", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "../authority.json"; })],
    ["normalized traversal", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "docs/../authority.json"; })],
    ["backslash traversal", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "..\\authority.json"; })],
    ["file URI", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "file:///etc/passwd"; })],
    ["remote URL", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "https://example.invalid/a.json"; })],
    ["symlink escapes root", () => { const context = isolatedContext({ makeSymlink: true }); return standaloneRejected({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: "/value" }, context); }],
    ["malformed JSON", () => { const context = isolatedContext({ raw: "{not-json\n" }); return standaloneRejected({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: "/value" }, context); }],
    ["artifact hash differs from trusted hash", () => { const context = isolatedContext({ trustedSha: "0".repeat(64) }); return standaloneRejected({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: "/value" }, context); }],
    ["proof supplies fake expected hash", () => mutateProof(p => { p.actorFrozenDatasetReference.expectedHash = baseAuthoritySha; })],
    ["illegal JSON Pointer tilde escape", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/~2"; })],
    ["missing object key", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/3/missing"; })],
    ["array index out of bounds", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/999"; })],
    ["negative array index", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/-1"; })],
    ["array dash token", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/-"; })],
    ["false target cannot satisfy unrelated target", () => { const context = isolatedContext({ raw: '{"value":false}\n', targetValue: true }); return standaloneRejected({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: "/value" }, context); }],
    ["missing target cannot masquerade as undefined", () => { const context = isolatedContext({ targetPointer: "/missing", targetValue: null }); return standaloneRejected({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: "/missing" }, context); }],
    ["resolved truthy string", () => mutateProof(p => { p.actorFrozenDatasetReference.resolved = "true"; })],
    ["exists truthy number", () => mutateProof(p => { p.actorFrozenDatasetReference.exists = 1; })],
    ...Object.keys(completeProofFixture()).map(field => [`required proof reference or field removed ${field}`, () => mutateProof(p => { delete p[field]; })]),
    ["insufficient evidence references", () => mutateProof(p => { p.evidenceReferences.pop(); })],
    ["valid provenance wrong evidence pointer", () => mutateProof(p => { p.evidenceReferences[0].jsonPointer = "/verifiedRawEvidence/oldCold"; })],
    ["valid Frozen authority wrong actor pointer", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/0"; })],
    ["valid Frozen authority wrong tenant pointer", () => mutateProof(p => { p.tenantFrozenDatasetReference.jsonPointer = "/targets/maxTenant"; })],
    ["valid Frozen authority wrong branch pointer", () => mutateProof(p => { p.branchFrozenDatasetReference.jsonPointer = "/actors/3/expected/branches"; })],
    ["valid Frozen authority wrong claims pointer", () => mutateProof(p => { p.claimsFrozenDatasetReference.jsonPointer = "/actors/3/restaurantUserUuid"; })],
    ["empty source artifact", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = ""; })],
    ["whitespace source artifact", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "   "; })],
    ["null source artifact", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = null; })],
    ["array source artifact", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = [baseAuthorityPath]; })],
    ["whitespace JSON Pointer", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "   "; })],
    ["wrong reference kind", () => mutateProof(p => { p.actorFrozenDatasetReference.referenceKind = "tenant"; })],
    ["alternate remote URI", () => mutateProof(p => { p.actorFrozenDatasetReference.sourceArtifact = "ssh://example.invalid/a.json"; })],
    ["noncanonical array index", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = "/actors/03"; })],
    ["root JSON Pointer", () => mutateProof(p => { p.actorFrozenDatasetReference.jsonPointer = ""; })],
    ["duplicate evidence claim", () => mutateProof(p => { p.evidenceReferences[4] = clone(p.evidenceReferences[0]); })]
  ];
  const referenceResults = referenceAttacks.map(([name, attack]) => {
    const pass = attack();
    console.log(`${pass ? "PASS" : "FAIL"} REFERENCE ATTACK ${name}`);
    return pass;
  });
  results.push(...referenceResults);
  const falsyRaw = '{"false":false,"zero":0,"null":null,"empty":[],"a/b":{"~key":null}}\n';
  const falsyTargets = [["false", false], ["zero", 0], ["null", null], ["empty", []]];
  const falsyTargetResults = falsyTargets.map(([token, targetValue]) => {
    const context = isolatedContext({ raw: falsyRaw, targetPointer: `/${token}`, targetValue });
    const pass = resolveCanonicalReference({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: `/${token}` }, context).ok;
    console.log(`${pass ? "PASS" : "FAIL"} REFERENCE TARGET ${token} value resolves as present`);
    return pass;
  });
  const escapedContext = isolatedContext({ raw: falsyRaw, targetPointer: "/a~1b/~0key", targetValue: null });
  const escapedPointerPass = resolveCanonicalReference({ referenceKind: "test-kind", sourceArtifact: "fixtures/doc.json", jsonPointer: "/a~1b/~0key" }, escapedContext).ok;
  console.log(`${escapedPointerPass ? "PASS" : "FAIL"} REFERENCE TARGET RFC 6901 tilde escapes resolve`);
  const referenceSuitePass = referenceAttacks.length === 57 && referenceResults.every(Boolean) && falsyTargetResults.every(Boolean) && escapedPointerPass;
  results.push(referenceSuitePass);
  console.log(`INDEPENDENT REVIEW ATTACK RESULT ${referenceResults.filter(Boolean).length}/${referenceResults.length} ${referenceSuitePass ? "PASS" : "FAIL"}`);

  fs.rmSync(temp, { recursive: true, force: true });
  console.log(`SELFTEST TEMP CLEANED ${temp}`);
  console.log(`SELFTEST RESULT ${results.filter(Boolean).length}/${results.length} ${results.every(Boolean) ? "PASS" : "FAIL"}`);
  if (!results.every(Boolean)) process.exitCode = 1;
}

const failures = checks.filter(x => !x.pass);
console.log(`RESULT ${checks.length - failures.length}/${checks.length} ${failures.length ? "FAIL" : "PASS"}`);
if (failures.length) process.exitCode = 1;
