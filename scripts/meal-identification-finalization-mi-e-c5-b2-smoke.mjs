#!/usr/bin/env node
// MI-E-C5-B2 behavioral smoke. It transpiles and executes the real production draft state
// transitions, v3 builder, consumer runtime, operation store, and existing mock repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const writableTempBase = fs.existsSync("/tmp") ? "/tmp" : os.tmpdir();
const tempRoot = fs.mkdtempSync(path.join(writableTempBase, "meal-identification-finalization-mi-e-c5-b2-smoke-"));
const checks = [];

function expect(condition, name) {
  if (!condition) throw new Error(`Smoke assertion failed: ${name}`);
  checks.push({ name, pass: true });
}

function transpile(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const outputPath = path.join(tempRoot, relativePath.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: sourcePath
  });
  fs.writeFileSync(outputPath, result.outputText);
}

const productionModules = [
  "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts",
  "apps/mobile/features/meal-identification-finalization/v3Contract.ts",
  "apps/mobile/features/meal-identification-finalization/errors.ts",
  "apps/mobile/features/meal-identification-finalization/validation.ts",
  "apps/mobile/features/meal-identification-finalization/consumerMealIdentificationFinalizationService.ts",
  "apps/mobile/features/meal-identification-finalization/adapters/mockConsumerMealIdentificationFinalizationRepository.ts",
  "apps/mobile/features/meal-identification/finalizationContract.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts",
  "apps/mobile/features/consumer-runtime/secureUuidProvider.ts",
  "apps/mobile/features/consumer-meals/mealDateTime.ts"
];

let releaseDelayedResponse = null;

try {
  productionModules.forEach(transpile);
  const requireFromDraft = createRequire(
    path.join(tempRoot, "apps/mobile/features/analysis/mealPhotoFinalizationDraft.js")
  );
  const draftModule = requireFromDraft("./mealPhotoFinalizationDraft.js");
  const runtimeModule = requireFromDraft("../consumer-runtime/consumerMealIdentificationFinalizationRuntime.js");
  const operationStoreModule = requireFromDraft("../consumer-runtime/consumerMealIdentificationFinalizationOperationStore.js");
  const mockModule = requireFromDraft(
    "../meal-identification-finalization/adapters/mockConsumerMealIdentificationFinalizationRepository.js"
  );
  const serviceModule = requireFromDraft(
    "../meal-identification-finalization/consumerMealIdentificationFinalizationService.js"
  );
  expect(true, "real B2 production modules transpile and load");

  const authPort = {
    async getCurrentSession() {
      return {
        ok: true,
        value: {
          accessToken: "test-only",
          refreshToken: "test-only",
          expiresAt: "2099-01-01T00:00:00.000Z",
          user: { userId: "actor-a", email: null }
        }
      };
    }
  };

  class MemoryStorage {
    values = new Map();
    async getItem(key) { return this.values.get(key) ?? null; }
    async setItem(key, value) { this.values.set(key, value); }
    async removeItem(key) { this.values.delete(key); }
  }

  const candidate = {
    candidateId: "11111111-1111-4111-8111-111111111111",
    observedName: "雞肉蔬菜飯",
    components: [
      { name: "雞肉", estimatedPortion: "一掌心" },
      { name: "蔬菜", estimatedPortion: "一碗" }
    ],
    estimatedNutrition: { calories: 520, proteinGrams: 38, carbsGrams: 55, fatGrams: 15 },
    confidence: 0.88,
    uncertaintyReasonCodes: []
  };
  const candidateB = {
    ...candidate,
    candidateId: "33333333-3333-4333-8333-333333333333",
    observedName: "牛肉番茄飯",
    components: [
      { name: "牛肉", estimatedPortion: "一掌心" },
      { name: "番茄", estimatedPortion: "半碗" }
    ],
    estimatedNutrition: { calories: 640, proteinGrams: 34, carbsGrams: 66, fatGrams: 21 }
  };
  const analysisRequestId = "22222222-2222-4222-8222-222222222222";
  const baseContext = {
    captureMethod: "photo_library",
    sourceContext: "dine_in",
    recordTiming: "post_hoc",
    occurredAt: "2026-07-29T15:30:00.000Z",
    selectedMealPeriod: "晚餐"
  };
  let uuidCounter = 0;
  const uuidFactory = () => {
    uuidCounter += 1;
    return `aaaaaaaa-aaaa-4aaa-8aaa-${String(uuidCounter).padStart(12, "0")}`;
  };

  async function createHarness(options = {}) {
    const repository = new mockModule.MockConsumerMealIdentificationFinalizationRepository({
      authPort,
      idGenerator: () => "mock-b2",
      ...options
    });
    const service = new serviceModule.ConsumerMealIdentificationFinalizationService({
      authPort,
      repository
    });
    const runtime = new runtimeModule.ConsumerMealIdentificationFinalizationRuntime({
      service,
      operationStore: new operationStoreModule.ConsumerMealIdentificationFinalizationOperationStore(
        new MemoryStorage(),
        () => new Date("2026-07-30T00:00:00.000Z")
      ),
      clock: { now: () => new Date("2026-07-30T00:00:00.000Z") },
      uuidFactory
    });
    await runtime.setActor("actor-a", 1);
    return { repository, runtime };
  }

  // Accepted unchanged.
  const acceptedHarness = await createHarness();
  const acceptedState = draftModule.createCandidateMealPhotoFinalizationDraft(
    analysisRequestId,
    candidate,
    baseContext
  );
  expect(acceptedState.selectedCandidateId === candidate.candidateId, "candidate selection preserves selectedCandidateId");
  expect(acceptedState.originalCandidate.observedName === candidate.observedName, "candidate selection keeps an original snapshot");
  expect(acceptedState.editable.mealName === candidate.observedName, "unchanged candidate name is canonical");
  expect(acceptedState.editable.components === "雞肉、蔬菜", "unchanged candidate components are canonical");
  expect(acceptedState.editable.portion === "", "absent candidate-level portion maps to v3 null instead of fabrication");
  expect(acceptedState.dirty === false, "unchanged candidate begins clean");
  const acceptedPrepared = draftModule.prepareMealPhotoFinalization(acceptedState, uuidFactory);
  expect(acceptedPrepared.ok, "unchanged candidate prepares successfully");
  expect(acceptedPrepared.ok && acceptedPrepared.command.selectedCandidateId === candidate.candidateId, "accepted request carries selectedCandidateId");
  expect(acceptedPrepared.ok && acceptedPrepared.command.mealWrite.mealName === candidate.observedName, "accepted values remain unchanged");
  expect(acceptedPrepared.ok && acceptedPrepared.command.recordTiming === "post_hoc", "post_hoc is preserved");
  expect(acceptedPrepared.ok && acceptedPrepared.command.occurredAt === baseContext.occurredAt, "actual occurredAt is preserved");
  const gate = new draftModule.MealPhotoFinalizationSubmissionGate();
  expect(gate.tryStart(), "programmatic submit gate accepts the first submit");
  expect(!gate.tryStart(), "programmatic submit gate rejects a rapid second submit");
  const acceptedResult = await acceptedHarness.runtime.submit(
    { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
    acceptedPrepared.draft
  );
  gate.finish();
  const acceptedApplied = draftModule.applyMealPhotoFinalizationResult(acceptedPrepared.state, acceptedResult);
  expect(acceptedHarness.repository.listCallsForTest().length === 1, "accepted path calls repository exactly once");
  expect(acceptedApplied.submissionStatus === "succeeded", "accepted result reaches succeeded state");
  expect(Boolean(acceptedApplied.resultIds?.mealRecordId), "accepted result stores mealRecordId");
  expect(Boolean(acceptedApplied.resultIds?.mealRecordItemId), "accepted result stores mealRecordItemId");
  expect(Boolean(acceptedApplied.resultIds?.mealAnalysisId), "accepted result stores mealAnalysisId");
  expect(Boolean(acceptedApplied.resultIds?.mealIdentificationFinalizationId), "accepted result stores finalization ID");
  expect(gate.tryNavigate(), "success navigation gate allows one navigation");
  expect(!gate.tryNavigate(), "success navigation gate rejects duplicate navigation");

  // Corrected.
  const correctedHarness = await createHarness();
  let correctedState = draftModule.createCandidateMealPhotoFinalizationDraft(analysisRequestId, candidate, baseContext);
  correctedState = draftModule.updateMealPhotoFinalizationField(correctedState, "mealName", "雞肉雙倍蔬菜飯", uuidFactory);
  correctedState = draftModule.updateMealPhotoFinalizationField(correctedState, "calories", "610", uuidFactory);
  expect(correctedState.dirty, "editing a candidate marks the local draft dirty");
  const correctedPrepared = draftModule.prepareMealPhotoFinalization(correctedState, uuidFactory);
  expect(correctedPrepared.ok && correctedPrepared.command.selectedCandidateId === candidate.candidateId, "corrected request retains selectedCandidateId");
  expect(correctedPrepared.ok && correctedPrepared.command.mealWrite.mealName === "雞肉雙倍蔬菜飯", "corrected name is submitted");
  expect(correctedPrepared.ok && correctedPrepared.command.mealWrite.nutrition.calories === 610, "corrected nutrition is submitted");
  const forbidden = ["confirmationMode", "verificationStatus", "nutritionSource", "userConfirmed", "userCorrected"];
  expect(correctedPrepared.ok && forbidden.every((key) => !(key in correctedPrepared.command)), "corrected request sends no server-authority field");
  await correctedHarness.runtime.submit(
    { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
    correctedPrepared.draft
  );
  expect(correctedHarness.repository.listCallsForTest().length === 1, "corrected path calls repository exactly once");

  // Manual and validation.
  let manualState = draftModule.createManualMealPhotoFinalizationDraft(analysisRequestId, baseContext);
  expect(manualState.selectedCandidateId === null, "manual mode uses null candidate ID");
  expect(manualState.originalCandidate === null, "manual mode creates no fake AI snapshot");
  const invalidManual = draftModule.prepareMealPhotoFinalization(manualState, uuidFactory);
  expect(!invalidManual.ok && invalidManual.state.lastSafeError === "finalization_invalid_manual_draft", "empty manual name fails safely");
  manualState = draftModule.updateMealPhotoFinalizationField(manualState, "mealName", "手動蔬菜湯", uuidFactory);
  manualState = draftModule.updateMealPhotoFinalizationField(manualState, "calories", "-1", uuidFactory);
  expect(manualState.validation.calories === "negative", "negative nutrition is rejected locally");
  manualState = draftModule.updateMealPhotoFinalizationField(manualState, "calories", "NaN", uuidFactory);
  expect(manualState.validation.calories === "invalid", "NaN nutrition is rejected locally");
  manualState = draftModule.updateMealPhotoFinalizationField(manualState, "calories", "180", uuidFactory);
  manualState = draftModule.updateMealPhotoFinalizationField(manualState, "components", " 高麗菜、、豆腐,  ", uuidFactory);
  const manualPrepared = draftModule.prepareMealPhotoFinalization(manualState, uuidFactory);
  expect(manualPrepared.ok && manualPrepared.command.selectedCandidateId === null, "valid manual request keeps null candidate ID");
  expect(manualPrepared.ok && JSON.stringify(manualPrepared.command.mealWrite.components) === JSON.stringify(["高麗菜", "豆腐"]), "manual components trim and drop blanks");

  // Stable idempotency, retry, and payload rotation.
  const retryHarness = await createHarness({ scenarios: ["network_failure", "success"] });
  const retryPrepared = draftModule.prepareMealPhotoFinalization(acceptedState, uuidFactory);
  const firstRetryResult = await retryHarness.runtime.submit(
    { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
    retryPrepared.draft
  );
  expect(firstRetryResult.status === "uncertain", "network failure becomes uncertain without claiming failure");
  const attemptedFailedState = draftModule.applyMealPhotoFinalizationResult(
    retryPrepared.state,
    firstRetryResult
  );
  const frozenFingerprint = draftModule.getMealPhotoFinalizationPayloadFingerprint(
    attemptedFailedState
  );
  expect(
    draftModule.isMealPhotoFinalizationPayloadLocked("submitting") &&
      draftModule.isMealPhotoFinalizationPayloadLocked("uncertain") &&
      draftModule.isMealPhotoFinalizationPayloadLocked("succeeded"),
    "submitting, uncertain, and succeeded are the single payload-lock authority"
  );
  expect(
    !draftModule.isMealPhotoFinalizationPayloadLocked("idle") &&
      !draftModule.isMealPhotoFinalizationPayloadLocked("error"),
    "idle and definitive error remain editable"
  );

  const blockedCandidateSwitch = draftModule.applyMealPhotoFinalizationPayloadMutation(
    attemptedFailedState,
    "uncertain",
    () =>
      draftModule.createCandidateMealPhotoFinalizationDraft(
        analysisRequestId,
        candidateB,
        baseContext
      )
  );
  expect(
    blockedCandidateSwitch === attemptedFailedState &&
      blockedCandidateSwitch.selectedCandidateId === candidate.candidateId,
    "uncertain candidate A cannot be switched programmatically to candidate B"
  );

  const blockedManualSwitch = draftModule.applyMealPhotoFinalizationPayloadMutation(
    attemptedFailedState,
    "uncertain",
    () => draftModule.createManualMealPhotoFinalizationDraft(analysisRequestId, baseContext)
  );
  expect(
    blockedManualSwitch === attemptedFailedState &&
      blockedManualSwitch.mode === "candidate" &&
      blockedManualSwitch.selectedCandidateId === candidate.candidateId,
    "uncertain candidate submission cannot switch to manual mode"
  );

  for (const field of [
    "mealName",
    "components",
    "portion",
    "calories",
    "proteinGrams",
    "carbsGrams",
    "fatGrams"
  ]) {
    const blockedFieldEdit = draftModule.applyMealPhotoFinalizationPayloadMutation(
      attemptedFailedState,
      "uncertain",
      () =>
        draftModule.updateMealPhotoFinalizationField(
          attemptedFailedState,
          field,
          field === "mealName" ? "不應套用的名稱" : "999",
          uuidFactory
        )
    );
    expect(
      blockedFieldEdit === attemptedFailedState,
      `uncertain programmatic ${field} edit is a no-op`
    );
  }

  const contextMutations = [
    ...["dine_in", "takeout", "delivery", "self_cooked", "unknown"].map(
      (sourceContext) => ({ ...baseContext, sourceContext })
    ),
    { ...baseContext, occurredAt: "2026-07-28T09:15:00.000Z" },
    { ...baseContext, recordTiming: "current" },
    { ...baseContext, selectedMealPeriod: "早餐" }
  ];
  for (const context of contextMutations) {
    const blockedContext = draftModule.applyMealPhotoFinalizationPayloadMutation(
      attemptedFailedState,
      "uncertain",
      () =>
        draftModule.updateMealPhotoFinalizationContext(
          attemptedFailedState,
          context,
          uuidFactory
        )
    );
    expect(
      blockedContext === attemptedFailedState,
      `uncertain context sync is blocked for ${JSON.stringify(context)}`
    );
  }
  expect(
    draftModule.getMealPhotoFinalizationPayloadFingerprint(attemptedFailedState) ===
      frozenFingerprint &&
      attemptedFailedState.clientRequestId === retryPrepared.state.clientRequestId,
    "all blocked mutations preserve fingerprint and clientRequestId"
  );

  const secondRetryResult = await retryHarness.runtime.retry({
    actorKey: "actor-a",
    actorGeneration: 1
  });
  expect(secondRetryResult.status === "succeeded", "uncertain operation replays successfully");
  const retryCalls = retryHarness.repository.listCallsForTest();
  expect(retryCalls.length === 2, "network retry performs exactly one retry call");
  expect(
    retryCalls[0].clientRequestId === retryCalls[1].clientRequestId,
    "same-payload retry reuses clientRequestId"
  );
  expect(
    JSON.stringify(retryCalls[0]) === JSON.stringify(retryCalls[1]),
    "uncertain retry repository input is byte-equivalent JSON to the first submission"
  );

  const retryApplied = draftModule.applyMealPhotoFinalizationResult(
    retryPrepared.state,
    secondRetryResult
  );
  expect(
    retryApplied.submissionStatus === "succeeded" &&
      retryApplied.editable.mealName === candidate.observedName &&
      retryApplied.selectedCandidateId === candidate.candidateId,
    "retry success projects durable IDs onto the original frozen candidate submission"
  );
  expect(
    Boolean(retryApplied.resultIds?.mealRecordId) &&
      Boolean(retryApplied.resultIds?.mealRecordItemId) &&
      Boolean(retryApplied.resultIds?.mealAnalysisId) &&
      Boolean(retryApplied.resultIds?.mealIdentificationFinalizationId),
    "exact retry success preserves the complete durable ID set"
  );
  const retryNavigationGate = new draftModule.MealPhotoFinalizationSubmissionGate();
  expect(retryNavigationGate.tryNavigate(), "exact retry success allows one navigation");
  expect(!retryNavigationGate.tryNavigate(), "exact retry success rejects duplicate navigation");

  const editableFailureHarness = await createHarness({ scenario: "validation_failure" });
  const editableFailurePrepared = draftModule.prepareMealPhotoFinalization(
    acceptedState,
    uuidFactory
  );
  const editableFailureResult = await editableFailureHarness.runtime.submit(
    { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
    editableFailurePrepared.draft
  );
  const editableFailureState = draftModule.applyMealPhotoFinalizationResult(
    editableFailurePrepared.state,
    editableFailureResult
  );
  const editedAfterDefinitiveFailure =
    draftModule.applyMealPhotoFinalizationPayloadMutation(
      editableFailureState,
      editableFailureResult.status,
      () =>
        draftModule.updateMealPhotoFinalizationField(
          editableFailureState,
          "portion",
          "一大碗",
          uuidFactory
        )
    );
  expect(
    editedAfterDefinitiveFailure !== editableFailureState &&
      editedAfterDefinitiveFailure.editable.portion === "一大碗",
    "definitive failure remains editable instead of staying payload-locked"
  );
  expect(
    editedAfterDefinitiveFailure.clientRequestId !==
      editableFailurePrepared.state.clientRequestId,
    "editing after definitive failure rotates clientRequestId"
  );
  expect(
    editedAfterDefinitiveFailure.lastSafeError === null &&
      editedAfterDefinitiveFailure.resultIds === null,
    "editing after definitive failure clears stale error/result state"
  );

  // Every source context plus timezone/mealDate preservation through the actual runtime.
  for (const sourceContext of ["dine_in", "takeout", "delivery", "self_cooked", "unknown"]) {
    const sourceHarness = await createHarness();
    const sourceState = draftModule.createCandidateMealPhotoFinalizationDraft(
      analysisRequestId,
      candidate,
      { ...baseContext, sourceContext }
    );
    const sourcePrepared = draftModule.prepareMealPhotoFinalization(sourceState, uuidFactory);
    await sourceHarness.runtime.submit(
      { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
      sourcePrepared.draft
    );
    const call = sourceHarness.repository.listCallsForTest()[0];
    expect(call.finalization.sourceContext === sourceContext, `${sourceContext} source context is preserved`);
  }
  const contextCall = acceptedHarness.repository.listCallsForTest()[0];
  expect(contextCall.timezone === "Asia/Taipei", "profile timezone reaches repository unchanged");
  expect(contextCall.mealDate === "2026-07-29", "mealDate derives from actual occurredAt in profile timezone");
  expect(contextCall.occurredAt === baseContext.occurredAt, "submit time never replaces actual meal time");

  // Actor/analysis staleness model and delayed response.
  expect(
    draftModule.createCandidateMealPhotoFinalizationDraft("33333333-3333-4333-8333-333333333333", candidate, baseContext).analysisRequestId !== acceptedState.analysisRequestId,
    "analysis replacement creates an independently scoped draft"
  );
  const delayed = new Promise((resolve) => { releaseDelayedResponse = resolve; });
  const delayedHarness = await createHarness({ beforeResponse: () => delayed });
  const delayedPrepared = draftModule.prepareMealPhotoFinalization(acceptedState, uuidFactory);
  const latePromise = delayedHarness.runtime.submit(
    { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
    delayedPrepared.draft
  );
  await delayedHarness.runtime.setActor(null, 2);
  releaseDelayedResponse();
  const lateResult = await latePromise;
  expect(lateResult.status === "idle", "late response after sign-out is ignored by runtime state");
  expect(delayedHarness.runtime.getState().status === "idle", "sign-out clears actor-scoped finalization state");
  await delayedHarness.runtime.setActor("actor-b", 3);
  expect(delayedHarness.runtime.getState().status === "idle", "actor switch starts with clean finalization state");

  // Safe mock failures and no navigation on failure.
  const failureHarness = await createHarness({ scenario: "analysis_already_finalized" });
  const failurePrepared = draftModule.prepareMealPhotoFinalization(acceptedState, uuidFactory);
  const failureResult = await failureHarness.runtime.submit(
    { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" },
    failurePrepared.draft
  );
  const failureState = draftModule.applyMealPhotoFinalizationResult(failurePrepared.state, failureResult);
  expect(failureState.lastSafeError === "finalization_analysis_already_finalized", "already-finalized returns a typed safe code");
  expect(failureState.resultIds === null, "failure exposes no fabricated result IDs");
  let failureNavigationCount = 0;
  if (failureState.submissionStatus === "succeeded") failureNavigationCount += 1;
  expect(failureNavigationCount === 0, "failure does not trigger success navigation");
  expect(!JSON.stringify(failureState).includes("constraint"), "state never renders raw constraint details");
  expect(!JSON.stringify(failureState).includes("postgres"), "state never renders raw Postgres details");

  console.log(JSON.stringify({
    status: "passed",
    phase: "MI-E-C5-B2 mobile confirmation/finalization smoke",
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    remoteOperations: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "MI-E-C5-B2 mobile confirmation/finalization smoke",
    reason: error instanceof Error ? error.message : String(error),
    totalChecks: checks.length,
    checks
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
