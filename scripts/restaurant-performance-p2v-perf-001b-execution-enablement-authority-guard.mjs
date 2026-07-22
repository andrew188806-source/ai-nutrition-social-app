#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorityPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001b-execution-enablement-authority.json";
const contractPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001b-execution-enablement-contract.md";
const guardPath = "scripts/restaurant-performance-p2v-perf-001b-execution-enablement-authority-guard.mjs";
const runnerPath = "scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs";
const candidateInventory = [authorityPath, contractPath, guardPath].sort();

const EXPECTED_HEAD = "fb7f8a49fe40d290ffb2cd4285b478b57b309ee4";
const migrationPath = "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const migrationSha256 = "4e08de96d28a5e6d9911b074fa73769ea5b3e21d9e14a089c7f420e16a4fbe72";

const FROZEN_20 = new Map([
  ["scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs", "bd84ce143a8d1223effae3dedc73b330c023dcfbcfb3354044155bfa3a3a6a78"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json", "14ab4c43e3c13c171be16279cc60de246da544dff9128107c6f119b86a5c511c"],
  ["scripts/restaurant-performance-p2v-perf-001b-evidence-validator.mjs", "e2c3084f6fcb79a93f5ddb905248f9bf5214368c570fd8dba1cb6fb6e8b8d50d"],
  ["scripts/restaurant-performance-p2v-perf-001b-c01-contract-implementation-guard.mjs", "ad7dbbeca578d0aee40903651d426e81b704f112cf152b3e390ea832c821f516"],
  ["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-authority.json", "049fddc767ededc7a202beadead885606389d1ebfa0d1bf0dfb2c0e4bf79163c"],
  ["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization.md", "e906cdc21917f03a7a899de35c89d812bd0e4e1b6a191afae0c81447df21c39b"],
  ["docs/runtime-integration-phase-2v-e/restaurant-performance-p2v-perf-001b-c01-diagnosis-provenance.json", "bff5009d76878f2e459ac81db63b0ca935d205b7dc2db198d70285a55c49e5a1"],
  ["scripts/restaurant-performance-p2v-perf-001b-c01-contract-reauthorization-guard.mjs", "c34d8be0e3ab7413102c014670ce6349f86d4f7a2d3635ae65f618b2f8cf728b"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-authority.json", "f7babca2616f5a901a6c5946770029a39630e46f2e168977fa0b31e82abc4430"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-contract.md", "fac68f9258e8a58fcba6392e61e59274ce39efd57aca386c0d477904127b8a5c"],
  ["scripts/restaurant-performance-p2v-perf-001b-c01-remediation-guard.mjs", "1f92fc6785285fdc4fac09be39d2a69caa3fd4c28a65c1512f8b400ace69af3b"],
  ["docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md", "81af13e4078a7ed820a7088472ab449b00bc50514fdeef11fdeaecc4170e28f2"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json", "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade"],
  ["scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs", "dc18308ff9735fabf266cef0f4591a34bf099bf2527753146000baddee319292"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-authority.json", "ce9236f9a5855b041fa9edb8dc667378e8303168a12b782a1a52510cf1a22067"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-contract.md", "a9429e148c7bbfdb3e13465847a8ef60aafbc8d864344ce8dae8b67fa09ab7c4"],
  ["scripts/restaurant-performance-p2v-perf-001a-d1-plan-metric-semantics-guard.mjs", "137744cc9282333c691a22e206bec04e32fd540015cc7e6b303f218917687f00"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-authority.json", "a9b6c7669291c6ae8ebd1e09fa50c412c3b5c651b0ba3b511f783f8f4afe4a9f"],
  ["docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-contract.md", "f1b8bd99629e98a2bbf244060bc2c1034942a1e6f687b9137f3778941e17c4d4"],
  ["scripts/restaurant-performance-p2v-perf-001b-dataset-semantics-guard.mjs", "ac7da82a0870b490e39ad0a953c32ddac66b819ca03058b110ef4ea6ea724601"]
]);

const C01_IMPLEMENTATION_4 = [
  "scripts/restaurant-performance-p2v-perf-001b-formal-runner.mjs",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-evidence-schema.json",
  "scripts/restaurant-performance-p2v-perf-001b-evidence-validator.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-c01-contract-implementation-guard.mjs"
];

const EXACT_EIGHT_FUTURE_PATHS = [
  "package.json",
  "package-lock.json",
  "docs/runtime-integration-phase-2v-e/p2v-perf-001b-execution-manifest-schema.json",
  "scripts/restaurant-performance-p2v-perf-001b-postgres-runtime.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-postgres-adapter.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-execution-provenance.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-execution-cli.mjs",
  "scripts/restaurant-performance-p2v-perf-001b-execution-enablement-implementation-guard.mjs"
];

const TWELVE_METHOD_NAMES = ["rebuildFresh", "generateFrozenDataset", "captureCatalog", "runPrechecks", "measureOuterAuthorization", "restartForTrack", "openPersistentTrack", "measureExplain", "openSecondFreshBackend", "buildIsolationProof", "measureDiscardPlansSequence", "close"];
const RESTORED_CASE_IDS = ["C01","C02","R01","R02","B01","B02","M01","M02","K01","K02","I01","I02","I03","J01","J02","J03","N01","N02","N03","D01","D02","D03","D04","D05","D06","D07","D08","D09","D10","P01","P02","P03","P04","P05","P06"];
const RESTORED_PROFILE_IDS = ["accessTypical", "accessWorst", "smallTypical", "smallWorst", "itemsWorst", "branchItemsWorst", "nutritionWorst", "denial", "pageDiagnostic"];
const CURRENT_NEXT_ACTION = "independent-d2-review";
const POST_FREEZE_NEXT_ACTION = "execution-enablement-implementation-per-authorizedFuturePaths";

const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const read = file => fs.readFileSync(path.join(root, file));
const readText = file => read(file).toString("utf8");
const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
};
const deepEqualCanonical = (a, b) => JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
const git = (args, allowFailure = false) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.error?.message || "git failed");
  return result;
};

const cliArgs = process.argv.slice(2);
const selfTest = cliArgs.length === 1 && cliArgs[0] === "--self-test";
if (cliArgs.length !== 0 && !selfTest) throw new Error("Usage: restaurant-performance-p2v-perf-001b-execution-enablement-authority-guard.mjs [--self-test]");

function validateStructure(authority) {
  const issues = [];
  const add = (pass, code) => { if (!pass) issues.push(code); };

  add(authority.schema === "tastkind.p2v-perf.execution-enablement-authority" && authority.version === 1 && authority.authorityId === "P2V-PERF-001B-EXECUTION-ENABLEMENT-A1", "identity");
  add(typeof authority.status === "string" && authority.status.includes("candidate") && !/\bfrozen\b/i.test(authority.status), "status-not-frozen");
  add(authority.candidateBaseline?.branch === "main" && authority.candidateBaseline?.head === EXPECTED_HEAD && authority.candidateBaseline?.trackedMigrationCount === 41 && authority.candidateBaseline?.bindingScope === "candidate-preparation-only", "candidate-baseline");
  add(same(authority.candidateInventory, candidateInventory), "candidate-inventory-exact");
  add(authority.noFourthCandidatePath === true, "no-fourth-path-flag");

  const bindings = Object.values(authority.frozenBindings ?? {});
  add(bindings.length === 21, "frozen-binding-count-21");
  const migrationBinding = bindings.find(entry => entry?.path === migrationPath);
  add(migrationBinding?.sha256 === migrationSha256, "migration-binding-exact");
  const nonMigrationBindings = bindings.filter(entry => entry?.path !== migrationPath);
  add(nonMigrationBindings.length === 20 && nonMigrationBindings.every(entry => FROZEN_20.get(entry.path) === entry.sha256) && FROZEN_20.size === nonMigrationBindings.length, "frozen-20-binding-exact");
  add(C01_IMPLEMENTATION_4.every(p => bindings.some(entry => entry.path === p && entry.sha256 === FROZEN_20.get(p))), "c01-four-implementation-binding");

  const precedence = authority.precedence ?? {};
  add(precedence.existingFrozenArtifactsByteForByteUnchanged === true && precedence.existingFrozenArtifactCount === 20, "precedence-unchanged");
  add(precedence.noRetroactiveChangeToAnyExistingBlockedPassOrFreezeResult === true && typeof precedence.existingBlockedSuiteDispositionStatement === "string", "precedence-no-retroactive");
  add(typeof precedence.executionAuthorizationState === "string" && /no execution authorization/i.test(precedence.executionAuthorizationState), "precedence-no-execution-authorization");
  add(Array.isArray(precedence.prospectiveScopeAfterFreeze) && precedence.prospectiveScopeAfterFreeze.length === 4, "precedence-scope-exactly-four");
  add(typeof precedence.doesNotClaimPriorAuthorization === "string" && precedence.doesNotClaimPriorAuthorization.length > 0, "precedence-no-prior-authorization-claim");
  add(typeof precedence.workloadCaseIdsNotLifecycleNames === "string" && precedence.workloadCaseIdsNotLifecycleNames.includes("C02") && precedence.workloadCaseIdsNotLifecycleNames.includes("workload case"), "precedence-workload-case-naming");

  const pv = authority.postgresVersionPolicy ?? {};
  add(pv.formalSuiteExactVersion === "17.6" && pv.serverVersionNum === 170006, "pg-version-exact");
  add(pv.isNotDevelopmentRuntimeVersion === true && pv.isNotProductionRuntimeVersion === true, "pg-version-not-dev-or-prod");
  add(pv.doesNotEstablishLongTermProductVersionPin === true && pv.doesNotBlockDevelopmentOrProductionFromNewerMinorSecurityReleasesInThePostgreSQL17Line === true, "pg-version-no-long-term-pin");
  add(typeof pv.futureDeploymentValidationRequirement === "string" && typeof pv.deploymentValidationCannotSubstituteForFormalSuite === "string" && typeof pv.formalSuiteCannotSubstituteForProductionValidation === "string", "pg-version-non-substitution-both-directions");

  const futurePaths = (authority.authorizedFuturePaths ?? []).map(entry => entry.path);
  add(same(futurePaths, EXACT_EIGHT_FUTURE_PATHS), "future-eight-paths-exact-and-ordered");
  add(authority.noWildcardAuthorization === true, "no-wildcard-authorization-flag");
  add(Array.isArray(authority.forbiddenModificationPaths) && C01_IMPLEMENTATION_4.every(p => authority.forbiddenModificationPaths.includes(p)) && authority.forbiddenModificationPaths.includes(migrationPath) && [...FROZEN_20.keys()].every(p => authority.forbiddenModificationPaths.includes(p)), "forbidden-modification-coverage-complete");

  const dep = authority.dependencyException ?? {};
  add(dep.onlyAuthorizedDirectDependency === "pg" && dep.pinningRule === "exact-pinned-version-required" && dep.floatingRangeProhibited === true && dep.otherDirectDependencyProhibited === true && dep.implementationGuardMustValidatePackageDelta === true, "dependency-exception-scoped-to-pg-only");

  const methods = authority.adapterContract?.methods ?? [];
  add(methods.length === 12, "adapter-exactly-twelve-methods");
  add(new Set(methods.map(m => m.name)).size === methods.length, "adapter-method-names-no-duplicates");
  add(methods.every(m => TWELVE_METHOD_NAMES.includes(m.name)) && TWELVE_METHOD_NAMES.every(name => methods.some(m => m.name === name)), "adapter-method-names-exact-set-no-missing-no-extra");
  add(methods.every(m => typeof m.exactSignature === "string" && m.returnShape !== undefined && typeof m.throwFailureSemantics === "string" && Array.isArray(m.runnerVerifiedFields) && typeof m.cleanupOwnership === "string" && typeof m.idempotency === "string" && typeof m.reentrancy === "string" && typeof m.cancellationBehavior === "string" && typeof m.callCount === "string" && typeof m.invocationOrder === "string" && typeof m.scope === "string" && typeof m.sessionLifetime === "string" && typeof m.backendLifetime === "string" && typeof m.pidIdentity === "string" && typeof m.transactionBoundary === "string"), "adapter-method-fields-complete");
  add(/No prior Frozen authority named these/i.test(authority.adapterContract?.note ?? ""), "adapter-contract-honesty-note");
  const restartFor = methods.find(m => m.name === "restartForTrack");
  add(typeof restartFor?.throwFailureSemantics === "string" && /MUST throw/.test(restartFor.throwFailureSemantics), "restart-for-track-must-throw");
  const closeMethod = methods.find(m => m.name === "close");
  add(typeof closeMethod?.idempotency === "string" && /idempotent/i.test(closeMethod.idempotency), "close-idempotent");
  const secondBackend = methods.find(m => m.name === "openSecondFreshBackend");
  add(typeof secondBackend?.pidIdentity === "string" && /distinct/i.test(secondBackend.pidIdentity) && /genuinely/i.test(secondBackend.cancellationBehavior ?? ""), "second-backend-genuinely-new");
  const discardMethod = methods.find(m => m.name === "measureDiscardPlansSequence");
  add(typeof discardMethod?.mandatoryHonestMeasurementRule === "string" && /52, 842, and 52/.test(discardMethod.mandatoryHonestMeasurementRule) && /prohibited/i.test(discardMethod.mandatoryHonestMeasurementRule), "discard-sequence-honest-measurement-rule");

  const restored = authority.adapterContract?.exactCaseAndProfileOrderRestoration ?? {};
  add(same(restored.caseIds, RESTORED_CASE_IDS) && same(restored.profileIds, RESTORED_PROFILE_IDS) && restored.precheckCount === 29, "restored-inventory-exact-unreordered");

  const rb = authority.responsibilityBoundaries ?? {};
  add(["formalRunner", "postgresRuntime", "postgresAdapter", "executionProvenance", "executionCli"].every(k => Array.isArray(rb[k]?.responsibilities) && rb[k].responsibilities.length > 0), "responsibility-boundaries-all-five-present");

  const tp = authority.transportAndCredentialPolicy ?? {};
  add(tp.transportKind === "unix-domain-socket-only" && tp.loopbackTcpTransportProhibited === true, "transport-decided-unix-socket-only");
  add(Array.isArray(tp.environmentCredentialInheritanceProhibited) && ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSERVICE"].every(name => tp.environmentCredentialInheritanceProhibited.includes(name)), "env-credential-inheritance-list-complete");
  add(tp.connectionStringAcceptanceProhibited === true && tp.databaseUrlAcceptanceProhibited === true && tp.supabaseUrlAcceptanceProhibited === true && tp.hostnameAcceptanceProhibited === true && tp.dnsTargetAcceptanceProhibited === true && tp.arbitraryTcpRemoteTargetAcceptanceProhibited === true && tp.developmentEndpointAcceptanceProhibited === true && tp.productionEndpointAcceptanceProhibited === true && tp.passwordJwtAnonKeyOrServiceRoleKeyAcceptanceProhibited === true, "credential-and-remote-target-prohibitions-complete");
  add(tp.shellStringExecutionProhibited === true && tp.allSubprocessInvocationMustUseArgumentArrays === true && tp.commandSubstitutionProhibited === true, "shell-and-argument-safety");
  add(tp.baselineAndCandidateMustNotShareClusterDatabaseSessionBackendOrPid === true && tp.executableMustBeRegularFileNotSymlink === true && tp.executableVersionMustBeExact176 === true, "runtime-identity-and-isolation-flags");
  add(typeof tp.cleanupScopeRestriction === "string" && /Repository/i.test(tp.cleanupScopeRestriction), "cleanup-scope-restriction-present");

  const mdi = authority.migrationAndDatasetIsolation ?? {};
  add(mdi.baselineTrack?.candidateMigrationApplied === false, "baseline-track-no-candidate-migration");
  add(mdi.candidateTrack?.candidateMigrationPathAndSha256?.path === migrationPath && mdi.candidateTrack?.candidateMigrationPathAndSha256?.sha256 === migrationSha256 && mdi.candidateTrack?.migrationCandidateModificationProhibited === true && mdi.candidateTrack?.migrationCandidateStagingProhibited === true, "candidate-track-migration-exact-and-immutable");
  add(mdi.sharedRequirements?.datasetSemanticHashMustMatch === true && mdi.sharedRequirements?.noClusterDatabaseSessionBackendOrPidCollisionBetweenBaselineAndCandidate === true && mdi.sharedRequirements?.anyMigrationCountOrderOrShaMismatchFailsClosed === true, "shared-isolation-requirements");

  const hashing = authority.rawHashingSemantics ?? {};
  add(typeof hashing.existingExplainSha256?.existingDefinition === "string" && /JSON\.stringify\(explainJson\)/.test(hashing.existingExplainSha256.existingDefinition), "existing-explain-sha-unchanged-definition");
  add(Array.isArray(hashing.existingExplainSha256?.prohibitedCharacterizations) && hashing.existingExplainSha256.prohibitedCharacterizations.length >= 2, "existing-explain-sha-prohibited-characterizations");
  add(typeof hashing.newRawExplainTextSha256?.definition === "string" && /rawExplainText/.test(hashing.newRawExplainTextSha256.definition) && /before any JSON\.parse/.test(hashing.newRawExplainTextSha256.definition), "new-raw-explain-text-sha-defined");
  add(Array.isArray(hashing.newRawExplainTextSha256?.normalizationProhibited) && hashing.newRawExplainTextSha256.normalizationProhibited.length >= 3, "new-raw-explain-text-sha-no-normalization");
  add(typeof hashing.newRawExplainTextSha256?.writeVerificationRequirement === "string" && /re-read/i.test(hashing.newRawExplainTextSha256.writeVerificationRequirement), "new-raw-explain-text-sha-write-verification");
  add(typeof hashing.bindingChain?.description === "string" && /rawExplainTextSha256/.test(hashing.bindingChain.description) && /explainSha256/.test(hashing.bindingChain.description), "hash-binding-chain-defined");
  add(hashing.existingExplainSha256 !== undefined && hashing.newRawExplainTextSha256 !== undefined && !same(hashing.existingExplainSha256, hashing.newRawExplainTextSha256), "two-hashes-not-conflated");

  const provenance = authority.provenanceModel ?? {};
  add(provenance.existingEvidenceSchemaAndValidatorUnchanged === true, "provenance-existing-unchanged");
  add(Array.isArray(provenance.formalPassRequiresAllOf) && provenance.formalPassRequiresAllOf.length === 10, "provenance-ten-pass-conditions");
  add(Array.isArray(provenance.manifestRequiredFields) && provenance.manifestRequiredFields.length >= 20, "provenance-manifest-fields-complete");
  add(provenance.developmentTouchedMustBeFalse === true && provenance.productionTouchedMustBeFalse === true, "provenance-dev-prod-untouched-flags");
  add(Array.isArray(provenance.formalValidatorMustReject) && provenance.formalValidatorMustReject.length >= 10, "provenance-rejection-list-complete");
  add(typeof provenance.assuranceBoundary?.whatItCannotVerify === "string" && /malicious operator/i.test(provenance.assuranceBoundary.whatItCannotVerify), "provenance-assurance-boundary-honest");
  add(typeof provenance.assuranceBoundary?.independentReviewStillRequired === "string", "provenance-independent-review-still-required");

  const synthetic = authority.syntheticSelfTestPolicy ?? {};
  add(synthetic.selfTestMustNotStartPostgres === true && synthetic.selfTestMustNotCreateClusterDatabaseOrContainer === true && synthetic.selfTestMustNotOpenNetworkSocket === true && synthetic.selfTestMustNotConnectToRemote === true && synthetic.selfTestMustNotUseCredentials === true, "synthetic-self-test-no-live-access");
  add(synthetic.selfTestMayImportTheRealAdapterModule === true && synthetic.selfTestMayUseDependencyInjectionToExerciseRealAdapterPureValidationLogic === true, "synthetic-self-test-may-inject-real-module");
  add(synthetic.syntheticOutputMustNotBeWrittenAsAFormalEvidenceBundle === true && synthetic.formalCliMustNotAcceptAFixtureAdapter === true && synthetic.selfTestModeMustNotContainAnyHiddenFlagThatSwitchesToARealConnection === true, "synthetic-output-cannot-masquerade-as-formal");

  const failure = authority.failureSemantics ?? {};
  add(failure.missingEvidence === "FAIL" && failure.invalidOrNonFiniteMetric === "FAIL" && failure.identityOrSecurityProofMissing === "FAIL" && failure.inventoryOrHashMismatch === "FAIL" && failure.unauthorizedChange === "FAIL" && failure.manifestOrProvenanceMismatch === "FAIL" && failure.wrongPostgresVersionOrMasqueradedVersion === "FAIL", "failure-semantics-fail-closed");
  add(typeof failure.discardPlansMeasurementMismatch === "string" && /never silently corrected/i.test(failure.discardPlansMeasurementMismatch), "failure-discard-never-corrected");
  add(typeof failure.candidateLifecycle === "string" && /no execution implementation/i.test(failure.candidateLifecycle) && /no.{0,20}PostgreSQL 17\.6/i.test(failure.candidateLifecycle), "failure-candidate-lifecycle-blocked");

  add(authority.requiredIndependentReview === true && authority.requiredFreezeBeforeExecutionAuthorization === true && authority.noRetroactivePass === true, "review-freeze-flags");

  const lifecycle = authority.lifecycleNextActions ?? {};
  add(lifecycle.currentNextPermittedAction === CURRENT_NEXT_ACTION, "current-next-action-exact");
  add(lifecycle.postFreezeNextPermittedAction === POST_FREEZE_NEXT_ACTION, "post-freeze-next-action-exact");
  add(lifecycle.currentNextPermittedAction !== lifecycle.postFreezeNextPermittedAction, "current-and-post-freeze-actions-distinct");
  add(typeof lifecycle.currentNextPermittedActionMeaning === "string" && /READY FOR FREEZE/.test(lifecycle.currentNextPermittedActionMeaning), "current-next-action-meaning-present");
  add(typeof lifecycle.postFreezeNextPermittedActionMeaning === "string" && /eight authorizedFuturePaths/.test(lifecycle.postFreezeNextPermittedActionMeaning) && /pg dependency exception/i.test(lifecycle.postFreezeNextPermittedActionMeaning), "post-freeze-next-action-meaning-present");
  add(lifecycle.thisCorrectionDoesNotAuthorizeImplementation === true, "correction-does-not-authorize-implementation");
  add(lifecycle.noRetroactiveChangeToAnyExistingFrozenPassOrBlockedResult === true, "lifecycle-no-retroactive-change");

  return issues;
}

function parseMdAdapterBlock(contractText) {
  const match = contractText.match(/```json execution-enablement-adapter-contract\n([\s\S]*?)\n```/);
  if (!match) throw new Error("execution-enablement-adapter-contract fenced block not found in Markdown");
  return JSON.parse(match[1]);
}

function validateAdapterContractParity(authority, contractText) {
  const issues = [];
  let mdBlock;
  try {
    mdBlock = parseMdAdapterBlock(contractText);
  } catch (error) {
    issues.push(`md-block-unparseable: ${error.message}`);
    return issues;
  }
  const jsonBlock = {
    note: authority.adapterContract?.note,
    methods: authority.adapterContract?.methods,
    orderingSummaryAcrossASuite: authority.adapterContract?.orderingSummaryAcrossASuite,
    exactCaseAndProfileOrderRestoration: authority.adapterContract?.exactCaseAndProfileOrderRestoration
  };
  if (!deepEqualCanonical(jsonBlock, mdBlock)) {
    if (!Array.isArray(mdBlock.methods) || mdBlock.methods.length !== (jsonBlock.methods?.length ?? 0)) issues.push("md-method-count-mismatch");
    if (Array.isArray(mdBlock.methods) && Array.isArray(jsonBlock.methods)) {
      const mdNames = mdBlock.methods.map(m => m.name);
      const jsonNames = jsonBlock.methods.map(m => m.name);
      if (!same(mdNames, jsonNames)) issues.push("md-method-name-set-or-order-mismatch");
      for (const name of jsonNames) {
        const mdMethod = mdBlock.methods.find(m => m.name === name);
        const jsonMethod = jsonBlock.methods.find(m => m.name === name);
        if (!mdMethod) issues.push(`md-missing-method:${name}`);
        else if (!deepEqualCanonical(jsonMethod, mdMethod)) issues.push(`md-method-content-mismatch:${name}`);
      }
    }
    if (!deepEqualCanonical(jsonBlock.orderingSummaryAcrossASuite, mdBlock.orderingSummaryAcrossASuite)) issues.push("md-ordering-summary-mismatch");
    if (!deepEqualCanonical(jsonBlock.exactCaseAndProfileOrderRestoration, mdBlock.exactCaseAndProfileOrderRestoration)) issues.push("md-restored-inventory-mismatch");
    if (issues.length === 0) issues.push("md-json-deep-equality-mismatch-unspecified");
  }
  return issues;
}

function crossCheckRunnerSource(runnerText, runnerSha256, authority) {
  const results = [];
  const check = (name, pass) => results.push({ name, pass });

  const requiredMethodsMatch = runnerText.match(/const requiredMethods\s*=\s*(\[[^\]]*\])/);
  let requiredMethodsArray = [];
  try { requiredMethodsArray = requiredMethodsMatch ? JSON.parse(requiredMethodsMatch[1]) : []; } catch { requiredMethodsArray = []; }
  check("required-adapter-method-names-exactly-twelve", requiredMethodsArray.length === 12 && new Set(requiredMethodsArray).size === 12 && TWELVE_METHOD_NAMES.every(name => requiredMethodsArray.includes(name)) && requiredMethodsArray.every(name => TWELVE_METHOD_NAMES.includes(name)));

  const callSiteIndex = name => runnerText.indexOf(`adapter.${name}(`);
  check("actual-invocation-exists-for-all-twelve-methods", TWELVE_METHOD_NAMES.every(name => callSiteIndex(name) >= 0));

  const outerAuthIndex = callSiteIndex("measureOuterAuthorization");
  const restartIndex = callSiteIndex("restartForTrack");
  const openTrackIndex = callSiteIndex("openPersistentTrack");
  check("measureOuterAuthorization-executes-before-restartForTrack-and-openPersistentTrack", outerAuthIndex >= 0 && restartIndex >= 0 && openTrackIndex >= 0 && outerAuthIndex < restartIndex && outerAuthIndex < openTrackIndex);
  check("restartForTrack-precedes-openPersistentTrack-in-source-order", restartIndex >= 0 && openTrackIndex >= 0 && restartIndex < openTrackIndex);

  check("close-session-present-for-per-track-cleanup", runnerText.includes("adapter.close(session)"));
  check("close-no-argument-present-for-final-cleanup", /adapter\.close\(\);/.test(runnerText));

  check("openSecondFreshBackend-call-site-present", callSiteIndex("openSecondFreshBackend") >= 0);
  check("second-backend-freshness-distinctness-check-present", runnerText.includes("second backend is not fresh") && /backendPid === session\.identity\.backendPid/.test(runnerText));

  const hasDiscardLiteral = runnerText.includes("[52, 842, 52]");
  check("discard-sequence-runner-invariant-is-exact-52-842-52", hasDiscardLiteral);
  const discardMethod = authority?.adapterContract?.methods?.find(m => m.name === "measureDiscardPlansSequence");
  check("authority-does-not-describe-discard-sequence-as-overridable", hasDiscardLiteral && typeof discardMethod?.mandatoryHonestMeasurementRule === "string" && /prohibited/i.test(discardMethod.mandatoryHonestMeasurementRule) && !/may be (?:overwritten|adjusted|hard-coded)/i.test(discardMethod.mandatoryHonestMeasurementRule));

  const caseIdsLiteral = JSON.stringify(RESTORED_CASE_IDS);
  const profileIdsLiteral = JSON.stringify(RESTORED_PROFILE_IDS);
  check("35-case-inventory-literal-present-in-runner", runnerText.replace(/\s+/g, "").includes(caseIdsLiteral.replace(/\s+/g, "")));
  check("9-profile-inventory-literal-present-in-runner", runnerText.replace(/\s+/g, "").includes(profileIdsLiteral.replace(/\s+/g, "")));
  check("29-precheck-count-literal-present-in-runner", /precheckCount:\s*29/.test(runnerText));

  check("runner-sha256-matches-authority-frozen-binding", runnerSha256 === FROZEN_20.get(runnerPath));

  return results;
}

const checks = [];
const record = (name, pass, detail) => { checks.push({ name, pass }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); };

const authorityText = readText(authorityPath);
let authority;
try { authority = JSON.parse(authorityText); } catch (error) { authority = null; record("authority JSON parses", false, error.message); }

if (authority) {
  const structuralIssues = validateStructure(authority);
  record("machine authority structure is closed and complete", structuralIssues.length === 0, structuralIssues);

  const contractText = readText(contractPath);
  const parityIssues = validateAdapterContractParity(authority, contractText);
  record("12-method adapter contract is a deterministic structural deep-equal match between JSON and Markdown", parityIssues.length === 0, parityIssues);

  const runnerText = readText(runnerPath);
  const runnerSha256 = digest(read(runnerPath));
  const crossCheckResults = crossCheckRunnerSource(runnerText, runnerSha256, authority);
  for (const item of crossCheckResults) record(`runner cross-check: ${item.name}`, item.pass);

  record("guard does not hard-code a circular self SHA-256", !readText(guardPath).includes(digest(read(guardPath))));

  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.split(/\r?\n/).filter(Boolean);
  const untracked = status.filter(line => line.startsWith("??")).map(line => line.slice(3)).sort();
  const nonUntracked = status.filter(line => !line.startsWith("??"));
  record("branch is main and HEAD is the expected baseline", git(["branch", "--show-current"]).stdout.trim() === "main" && git(["rev-parse", "HEAD"]).stdout.trim() === EXPECTED_HEAD);
  record("tracked and staged diffs are empty", git(["diff", "--name-only"]).stdout.trim() === "" && git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  record("existing migration candidate present with exact path and SHA-256, untouched", fs.existsSync(path.join(root, migrationPath)) && digest(read(migrationPath)) === migrationSha256);
  record("exactly 41 tracked migrations", git(["ls-files", "supabase/migrations"]).stdout.split(/\r?\n/).filter(line => line.endsWith(".sql")).length === 41);
  record("all 20 existing Frozen artifact SHA-256 values unchanged", [...FROZEN_20].every(([file, expected]) => digest(read(file)) === expected));
  record("all four C01 implementation artifact SHA-256 values unchanged", C01_IMPLEMENTATION_4.every(file => FROZEN_20.get(file) && digest(read(file)) === FROZEN_20.get(file)));
  const expectedUntracked = [...candidateInventory, migrationPath].sort();
  record("exactly three untracked candidate paths plus the pre-existing untracked migration candidate, nothing else uncommitted", nonUntracked.length === 0 && same(untracked, expectedUntracked));
  record("no existing tracked file was modified by this candidate", git(["diff", "--name-only", "HEAD", "--", ...FROZEN_20.keys(), migrationPath]).stdout.trim() === "");
  record("candidate text contains no secret, credential, or connection string", !/(?:postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----|service[_-]?role\s*[:=]|password\s*[:=]|supabase\.co)/i.test(authorityText + contractText + readText(guardPath)));
  record("candidate text names no Development or Production endpoint", !/\b(dev|development|staging|production|prod)\.[a-z0-9.-]+\.(supabase\.co|internal|local)\b/i.test(authorityText + contractText));
} else {
  record("machine authority structure is closed and complete", false);
}

if (selfTest) {
  const tests = [];
  const mutation = (name, change, code) => {
    const value = clone(authority);
    change(value);
    const pass = validateStructure(value).includes(code);
    tests.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`);
  };
  mutation("wrong authority id", value => { value.authorityId = "X"; }, "identity");
  mutation("status claims Frozen", value => { value.status = "Frozen"; }, "status-not-frozen");
  mutation("wrong candidate baseline head", value => { value.candidateBaseline.head = "0".repeat(40); }, "candidate-baseline");
  mutation("candidate inventory reordered/wrong", value => { value.candidateInventory = ["x"]; }, "candidate-inventory-exact");
  mutation("missing frozen binding", value => { delete value.frozenBindings.datasetGuard; }, "frozen-binding-count-21");
  mutation("tampered frozen binding SHA", value => { value.frozenBindings.baseAuthority.sha256 = "0".repeat(64); }, "frozen-20-binding-exact");
  mutation("tampered migration binding", value => { value.frozenBindings.migrationCandidate.sha256 = "0".repeat(64); }, "migration-binding-exact");
  mutation("prospective scope not exactly four", value => { value.precedence.prospectiveScopeAfterFreeze.push("extra"); }, "precedence-scope-exactly-four");
  mutation("claims prior authorization", value => { value.precedence.doesNotClaimPriorAuthorization = ""; }, "precedence-no-prior-authorization-claim");
  mutation("wrong postgres version", value => { value.postgresVersionPolicy.formalSuiteExactVersion = "17.9"; }, "pg-version-exact");
  mutation("claims production runtime pin", value => { value.postgresVersionPolicy.isNotProductionRuntimeVersion = false; }, "pg-version-not-dev-or-prod");
  mutation("ninth future path added", value => { value.authorizedFuturePaths.push({ path: "scripts/ninth.mjs" }); }, "future-eight-paths-exact-and-ordered");
  mutation("future paths reordered", value => { value.authorizedFuturePaths.reverse(); }, "future-eight-paths-exact-and-ordered");
  mutation("wildcard authorization claimed", value => { value.noWildcardAuthorization = false; }, "no-wildcard-authorization-flag");
  mutation("forbidden modification list missing formal runner", value => { value.forbiddenModificationPaths = value.forbiddenModificationPaths.filter(p => !p.includes("formal-runner")); }, "forbidden-modification-coverage-complete");
  mutation("dependency exception allows floating range", value => { value.dependencyException.floatingRangeProhibited = false; }, "dependency-exception-scoped-to-pg-only");
  mutation("dependency exception allows second dependency", value => { value.dependencyException.otherDirectDependencyProhibited = false; }, "dependency-exception-scoped-to-pg-only");
  mutation("thirteenth adapter method invented", value => { value.adapterContract.methods.push({ name: "extraMethod" }); }, "adapter-exactly-twelve-methods");
  mutation("adapter method duplicated", value => { value.adapterContract.methods.push(clone(value.adapterContract.methods[0])); }, "adapter-exactly-twelve-methods");
  mutation("adapter method renamed to unknown", value => { value.adapterContract.methods[0].name = "unknownMethod"; }, "adapter-method-names-exact-set-no-missing-no-extra");
  mutation("restartForTrack no longer required to throw", value => { const m = value.adapterContract.methods.find(x => x.name === "restartForTrack"); m.throwFailureSemantics = "adapter may silently ignore failures"; }, "restart-for-track-must-throw");
  mutation("close no longer required to be idempotent", value => { const m = value.adapterContract.methods.find(x => x.name === "close"); m.idempotency = "not required"; }, "close-idempotent");
  mutation("second backend freshness requirement weakened", value => { const m = value.adapterContract.methods.find(x => x.name === "openSecondFreshBackend"); m.pidIdentity = "may reuse the same connection"; }, "second-backend-genuinely-new");
  mutation("discard sequence honesty rule removed", value => { const m = value.adapterContract.methods.find(x => x.name === "measureDiscardPlansSequence"); delete m.mandatoryHonestMeasurementRule; }, "discard-sequence-honest-measurement-rule");
  mutation("case inventory reordered", value => { value.adapterContract.exactCaseAndProfileOrderRestoration.caseIds.reverse(); }, "restored-inventory-exact-unreordered");
  mutation("profile inventory missing one", value => { value.adapterContract.exactCaseAndProfileOrderRestoration.profileIds.pop(); }, "restored-inventory-exact-unreordered");
  mutation("responsibility boundary missing", value => { delete value.responsibilityBoundaries.executionCli; }, "responsibility-boundaries-all-five-present");
  mutation("transport switched to loopback TCP", value => { value.transportAndCredentialPolicy.transportKind = "loopback-tcp"; }, "transport-decided-unix-socket-only");
  mutation("credential inheritance list truncated", value => { value.transportAndCredentialPolicy.environmentCredentialInheritanceProhibited.pop(); }, "env-credential-inheritance-list-complete");
  mutation("connection string acceptance permitted", value => { value.transportAndCredentialPolicy.connectionStringAcceptanceProhibited = false; }, "credential-and-remote-target-prohibitions-complete");
  mutation("shell string execution permitted", value => { value.transportAndCredentialPolicy.shellStringExecutionProhibited = false; }, "shell-and-argument-safety");
  mutation("baseline track allows candidate migration", value => { value.migrationAndDatasetIsolation.baselineTrack.candidateMigrationApplied = true; }, "baseline-track-no-candidate-migration");
  mutation("candidate track migration SHA tampered", value => { value.migrationAndDatasetIsolation.candidateTrack.candidateMigrationPathAndSha256.sha256 = "0".repeat(64); }, "candidate-track-migration-exact-and-immutable");
  mutation("dataset hash match no longer required", value => { value.migrationAndDatasetIsolation.sharedRequirements.datasetSemanticHashMustMatch = false; }, "shared-isolation-requirements");
  mutation("existing explain hash redefined", value => { value.rawHashingSemantics.existingExplainSha256.existingDefinition = "something else"; }, "existing-explain-sha-unchanged-definition");
  mutation("new raw hash allows normalization", value => { value.rawHashingSemantics.newRawExplainTextSha256.normalizationProhibited = []; }, "new-raw-explain-text-sha-no-normalization");
  mutation("two hashes conflated", value => { value.rawHashingSemantics.newRawExplainTextSha256 = clone(value.rawHashingSemantics.existingExplainSha256); }, "two-hashes-not-conflated");
  mutation("formal pass conditions not exactly ten", value => { value.provenanceModel.formalPassRequiresAllOf.pop(); }, "provenance-ten-pass-conditions");
  mutation("production touched flag not required false", value => { value.provenanceModel.productionTouchedMustBeFalse = false; }, "provenance-dev-prod-untouched-flags");
  mutation("assurance boundary overclaims", value => { value.provenanceModel.assuranceBoundary.whatItCannotVerify = "nothing, it verifies everything"; }, "provenance-assurance-boundary-honest");
  mutation("self-test allowed to start postgres", value => { value.syntheticSelfTestPolicy.selfTestMustNotStartPostgres = false; }, "synthetic-self-test-no-live-access");
  mutation("formal CLI allowed to accept fixture adapter", value => { value.syntheticSelfTestPolicy.formalCliMustNotAcceptAFixtureAdapter = false; }, "synthetic-output-cannot-masquerade-as-formal");
  mutation("synthetic policy missing dependency-injection allowance", value => { delete value.syntheticSelfTestPolicy.selfTestMayUseDependencyInjectionToExerciseRealAdapterPureValidationLogic; }, "synthetic-self-test-may-inject-real-module");
  mutation("failure semantics relaxed", value => { value.failureSemantics.unauthorizedChange = "WARN"; }, "failure-semantics-fail-closed");
  mutation("discard mismatch silently correctable", value => { value.failureSemantics.discardPlansMeasurementMismatch = "may be adjusted to match expectation"; }, "failure-discard-never-corrected");
  mutation("review/freeze flags relaxed", value => { value.requiredFreezeBeforeExecutionAuthorization = false; }, "review-freeze-flags");
  mutation("current next action changed to something else", value => { value.lifecycleNextActions.currentNextPermittedAction = "execution"; }, "current-next-action-exact");
  mutation("post-freeze action still wrongly written as independent review", value => { value.lifecycleNextActions.postFreezeNextPermittedAction = "independent-d2-review"; }, "post-freeze-next-action-exact");
  mutation("current and post-freeze actions swapped", value => { const t = value.lifecycleNextActions.currentNextPermittedAction; value.lifecycleNextActions.currentNextPermittedAction = value.lifecycleNextActions.postFreezeNextPermittedAction; value.lifecycleNextActions.postFreezeNextPermittedAction = t; }, "post-freeze-next-action-exact");
  mutation("current and post-freeze actions made identical", value => { value.lifecycleNextActions.postFreezeNextPermittedAction = value.lifecycleNextActions.currentNextPermittedAction; }, "post-freeze-next-action-exact");
  mutation("correction claims to authorize implementation", value => { value.lifecycleNextActions.thisCorrectionDoesNotAuthorizeImplementation = false; }, "correction-does-not-authorize-implementation");

  const positivePass = validateStructure(authority).length === 0;
  tests.push(positivePass);
  console.log(`${positivePass ? "PASS" : "FAIL"} SELFTEST unmodified authority validates clean`);

  const realContractText = readText(contractPath);
  const realRunnerText = readText(runnerPath);
  const realRunnerSha256 = digest(read(runnerPath));

  const mdMutation = (name, change) => {
    const mdBlock = parseMdAdapterBlock(realContractText);
    change(mdBlock);
    const mutatedText = realContractText.replace(/```json execution-enablement-adapter-contract\n[\s\S]*?\n```/, () => "```json execution-enablement-adapter-contract\n" + JSON.stringify(mdBlock, null, 2) + "\n```");
    const issues = validateAdapterContractParity(authority, mutatedText);
    const pass = issues.length > 0;
    tests.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name} ${JSON.stringify(issues)}`);
  };
  mdMutation("Markdown deletes one method", block => { block.methods.pop(); });
  mdMutation("Markdown modifies one method signature", block => { block.methods[0].exactSignature = "async somethingElse() -> void"; });
  mdMutation("Markdown modifies one nested required key", block => { block.methods.find(m => m.name === "openPersistentTrack").returnShape.identity.requiredKeys.pop(); });
  mdMutation("Markdown modifies invocation order", block => { block.methods.find(m => m.name === "measureExplain").invocationOrder = "any order permitted"; });
  mdMutation("Markdown modifies a runner-verified field", block => { block.methods.find(m => m.name === "rebuildFresh").runnerVerifiedFields = []; });
  mdMutation("Markdown close semantics diverge from JSON", block => { block.methods.find(m => m.name === "close").idempotency = "not required to be idempotent"; });
  const positiveParityPass = validateAdapterContractParity(authority, realContractText).length === 0;
  tests.push(positiveParityPass);
  console.log(`${positiveParityPass ? "PASS" : "FAIL"} SELFTEST unmodified Markdown parity validates clean`);

  const runnerMutation = (name, mutate, checkName, useRealSha = true) => {
    const mutatedText = mutate(realRunnerText);
    const shaToUse = useRealSha ? realRunnerSha256 : digest(Buffer.from(mutatedText, "utf8"));
    const results = crossCheckRunnerSource(mutatedText, shaToUse, authority);
    const entry = results.find(r => r.name === checkName);
    const pass = entry !== undefined && entry.pass === false;
    tests.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name} ${JSON.stringify(entry)}`);
  };
  runnerMutation("runner source missing a required call-site token", text => text.replace("adapter.openSecondFreshBackend(", "adapterOMITTED.openSecondFreshBackend("), "actual-invocation-exists-for-all-twelve-methods");
  runnerMutation("runner source discard sequence no longer 52/842/52", text => text.replace("[52, 842, 52]", "[1, 2, 3]"), "discard-sequence-runner-invariant-is-exact-52-842-52");
  runnerMutation("runner source missing close(session)", text => text.replace("adapter.close(session)", "adapter.closeSession(session)"), "close-session-present-for-per-track-cleanup");
  runnerMutation("runner source missing final close()", text => text.replace("await adapter.close();", "await adapter.closeFinal();"), "close-no-argument-present-for-final-cleanup");
  runnerMutation("runner source missing fresh-backend identity check", text => text.replace("second backend is not fresh", "second backend differs"), "second-backend-freshness-distinctness-check-present");
  runnerMutation("runner source wrong sha256 relative to frozen binding (simulated tamper)", text => `${text}\n// tampered`, "runner-sha256-matches-authority-frozen-binding", false);
  runnerMutation("runner source measureOuterAuthorization no longer precedes restartForTrack", text => { const oa = "adapter.measureOuterAuthorization("; return text.replace(oa, "adapterZZZ.measureOuterAuthorization("); }, "measureOuterAuthorization-executes-before-restartForTrack-and-openPersistentTrack");

  console.log(`SELFTEST RESULT ${tests.filter(Boolean).length}/${tests.length} ${tests.every(Boolean) ? "PASS" : "FAIL"}`);
  if (!tests.every(Boolean)) process.exitCode = 1;
}

const failed = checks.filter(check => !check.pass);
console.log(`RESULT ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`);
if (failed.length) process.exitCode = 1;
