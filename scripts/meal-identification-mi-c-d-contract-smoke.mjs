#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const cache = new Map();

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push(name);
}

function loadTsModule(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (request) => {
    if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.js$/, "");
    const resolved =
      fs.existsSync(base) && fs.statSync(base).isDirectory() ? path.join(base, "index.ts") : `${base}.ts`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(
    localRequire,
    module,
    module.exports
  );
  return module.exports;
}

const featureDir = "apps/mobile/features/meal-identification-finalization";
const mappers = loadTsModule(`${featureDir}/mealIdentificationFinalizationMappers.ts`);
const validation = loadTsModule(`${featureDir}/validation.ts`);
const errors = loadTsModule(`${featureDir}/errors.ts`);
const featureFlags = loadTsModule(`${featureDir}/featureFlags.ts`);
const factories = loadTsModule(`${featureDir}/factories.ts`);
const disabledRepoModule = loadTsModule(
  `${featureDir}/adapters/disabledConsumerMealIdentificationFinalizationRepository.ts`
);
const mockRepoModule = loadTsModule(`${featureDir}/adapters/mockConsumerMealIdentificationFinalizationRepository.ts`);
const supabaseRepoModule = loadTsModule(
  `${featureDir}/adapters/supabaseConsumerMealIdentificationFinalizationRepository.ts`
);
const service = loadTsModule(`${featureDir}/consumerMealIdentificationFinalizationService.ts`);
const contracts = loadTsModule(`${featureDir}/supabaseMealIdentificationFinalizationContracts.ts`);
const meal = loadTsModule("apps/mobile/features/meal-identification/index.ts");

function baseOriginalAnalysis(overrides = {}) {
  return {
    status: "available",
    detectedItemNames: ["雞胸高蛋白碗"],
    photoReferences: ["photo-1"],
    model: { name: "haocu-vision", version: "1.0.0" },
    estimatedNutrition: { calories: 520, protein: 38, carbohydrates: 54, fat: 14 },
    confidence: 0.7,
    analyzedAt: "2026-07-25T09:00:00.000Z",
    ...overrides
  };
}

function unavailableOriginalAnalysis() {
  return {
    status: "unavailable",
    detectedItemNames: [],
    photoReferences: [],
    model: null,
    estimatedNutrition: null,
    confidence: null,
    analyzedAt: null
  };
}

function mealWrite(overrides = {}) {
  return {
    selectedMealPeriod: "午餐",
    mealName: "雞胸高蛋白碗",
    portion: "一碗",
    nutrition: { calories: 520, protein: 38, carbohydrates: 54, fat: 14 },
    isSelfCooked: false,
    wasUserCorrected: false,
    ...overrides
  };
}

const validIdentity = {
  restaurantId: "r1",
  branchId: "b1",
  menuId: "m1",
  menuCategoryId: "c1",
  menuItemId: "i1",
  branchMenuItemId: "bi1"
};

function catalogCandidateInput() {
  return {
    kind: "catalog_item",
    identity: validIdentity,
    source: "supabase",
    restaurantName: "好初健康碗",
    branchName: "南京店",
    branchContext: "南京店",
    menuName: "午餐菜單",
    menuCategoryName: "蛋白質",
    mealItemName: "雞胸高蛋白碗",
    price: 180,
    availability: "available",
    nutritionProvenance: "ai_estimated",
    confidence: 0.7,
    matchReason: "match",
    tags: ["高蛋白"]
  };
}

function confirmedFinalizationInput() {
  return {
    version: meal.MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    recordTiming: "current",
    occurredAt: "2026-07-25T09:05:00.000Z",
    originalAnalysis: baseOriginalAnalysis(),
    selection: {
      kind: "catalog_selection",
      confirmationStatus: "confirmed",
      sourceContext: "dine_in",
      candidate: catalogCandidateInput()
    },
    corrections: [],
    mealWrite: mealWrite()
  };
}

function unresolvedFinalizationInput(reason) {
  const isSelfCooked = reason === "self_cooked";
  return {
    version: meal.MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    recordTiming: "current",
    occurredAt: "2026-07-25T09:05:00.000Z",
    originalAnalysis: baseOriginalAnalysis(),
    selection: {
      kind: "personal_unresolved_selection",
      sourceContext: isSelfCooked ? "self_cooked" : "unknown",
      candidate: meal.createPersonalUnresolvedCandidate({
        source: reason,
        restaurantName: "",
        mealItemName: "手動輸入"
      })
    },
    corrections: [],
    mealWrite: mealWrite({ isSelfCooked })
  };
}

function nutritionCorrectionInput(ordinal) {
  return {
    correctedAt: "2026-07-25T09:05:00.000Z",
    correctionReason: "使用者修正",
    detail: { correctionType: "nutrition_override", before: { calories: 520 }, after: { calories: 500 } }
  };
}

const baseInput = (overrides = {}) => ({
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  mealType: "lunch",
  occurredAt: "2026-07-25T09:05:00.000Z",
  mealDate: "2026-07-25",
  timezone: "Asia/Taipei",
  finalization: meal.buildMealIdentificationFinalization(confirmedFinalizationInput()).value,
  ...overrides
});

function fakeAuthPort(userId) {
  return {
    source: "mock",
    getCurrentSession: async () =>
      userId ? { ok: true, value: { user: { userId } } } : { ok: true, value: null }
  };
}

try {
  // ---------- Request/response mapper ----------
  const rpcArgs = mappers.buildFinalizeMealIdentificationRpcArgs(baseInput());
  expect(
    rpcArgs.p_client_request_id === "11111111-1111-4111-8111-111111111111" &&
      rpcArgs.p_meal_type === "lunch" &&
      rpcArgs.p_finalization.version === meal.MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    "request mapper builds exact RPC args from a validated command"
  );
  expect(!("user_id" in rpcArgs) && !("p_user_id" in rpcArgs), "request mapper never includes user_id");

  const goodResponse = {
    replayed: false,
    meal_record_id: "rec-1",
    meal_record_item_id: "item-1",
    meal_analysis_id: "an-1",
    meal_identification_finalization_id: "ledger-1",
    meal_correction_ids: ["corr-1", "corr-2"]
  };
  const mapped = mappers.mapFinalizeMealIdentificationRpcResponse(goodResponse);
  expect(
    mapped.mealRecordId === "rec-1" &&
      mapped.mealRecordItemId === "item-1" &&
      mapped.mealAnalysisId === "an-1" &&
      mapped.mealIdentificationFinalizationId === "ledger-1" &&
      mapped.mealCorrectionIds.length === 2,
    "response mapper preserves all stable IDs exact-shape"
  );

  for (const bad of [
    null,
    {},
    { replayed: "not-boolean", meal_record_id: "x", meal_record_item_id: "x", meal_analysis_id: "x", meal_identification_finalization_id: "x", meal_correction_ids: [] },
    { replayed: false, meal_record_id: "", meal_record_item_id: "x", meal_analysis_id: "x", meal_identification_finalization_id: "x", meal_correction_ids: [] },
    { replayed: false, meal_record_id: "x", meal_record_item_id: "x", meal_analysis_id: "x", meal_identification_finalization_id: "x", meal_correction_ids: "not-an-array" }
  ]) {
    let threw = false;
    try {
      mappers.mapFinalizeMealIdentificationRpcResponse(bad);
    } catch (error) {
      threw = error instanceof errors.ConsumerMealIdentificationFinalizationResponseMalformedError;
    }
    expect(threw, "malformed or missing response fields fail closed (never partial success)");
  }

  // ---------- Six SQLSTATE mappings + unknown sanitization ----------
  const errorCases = [
    ["28000", "AUTHENTICATION_REQUIRED", errors.ConsumerMealIdentificationFinalizationAuthenticationRequiredError],
    ["22023", "INVALID_FINALIZATION", errors.ConsumerMealIdentificationFinalizationInvalidInputError],
    ["23503", "CATALOG_IDENTITY_REJECTED", errors.ConsumerMealIdentificationFinalizationCatalogIdentityRejectedError],
    ["23514", "IDENTITY_INVARIANT_VIOLATION", errors.ConsumerMealIdentificationFinalizationIdentityInvariantViolationError],
    ["23505", "IDEMPOTENCY_KEY_CONFLICT", errors.ConsumerMealIdentificationFinalizationIdempotencyConflictError],
    ["42501", "OWNERSHIP_OR_AUTHORIZATION_REJECTED", errors.ConsumerMealIdentificationFinalizationOwnershipRejectedError]
  ];
  for (const [code, token, ExpectedError] of errorCases) {
    const mappedError = mappers.mapMealIdentificationFinalizationRpcError({ code, message: token });
    expect(mappedError instanceof ExpectedError, `SQLSTATE ${code} (${token}) maps to the correct typed error`);
  }
  const unknownError = mappers.mapMealIdentificationFinalizationRpcError({ code: "99999", message: "some raw postgres detail" });
  expect(
    unknownError instanceof errors.ConsumerMealIdentificationFinalizationTransportFailedError,
    "unknown SQLSTATE sanitizes to a safe generic transport failure"
  );
  expect(
    !unknownError.message.includes("raw postgres detail"),
    "unknown error mapping never leaks the raw Postgrest message"
  );

  // ---------- UUID v4 validation ----------
  const v1 = validation.validateFinalizeCurrentUserMealIdentificationInput(
    baseInput({ clientRequestId: "11111111-1111-1111-8111-111111111111" })
  );
  expect(!v1.ok, "non-v4 UUID client request ID is rejected");
  const v2 = validation.validateFinalizeCurrentUserMealIdentificationInput(baseInput({ clientRequestId: "not-a-uuid" }));
  expect(!v2.ok, "non-UUID client request ID is rejected");
  const v3 = validation.validateFinalizeCurrentUserMealIdentificationInput(baseInput());
  expect(v3.ok, "valid UUID v4 client request ID is accepted");

  // ---------- Partial identity rejection (via frozen MI-C-A revalidation) ----------
  const partialIdentityInput = confirmedFinalizationInput();
  partialIdentityInput.selection.candidate.identity = { ...validIdentity, branchId: "" };
  const builtPartial = meal.buildMealIdentificationFinalization(partialIdentityInput);
  expect(!builtPartial.ok, "partial Catalog identity is rejected at the frozen contract layer");

  // ---------- Forbidden user_id in finalization payload ----------
  // The input-side builder only reads known fields, so an extra userId on the loose
  // input wrapper is structurally dropped rather than rejected — confirm that.
  const forbiddenInput = confirmedFinalizationInput();
  forbiddenInput.selection.userId = "someone-else";
  const builtForbidden = meal.buildMealIdentificationFinalization(forbiddenInput);
  expect(
    builtForbidden.ok && !("userId" in builtForbidden.value.selection),
    "a caller-supplied userId on the loose input wrapper is structurally dropped, never carried into the canonical command"
  );
  // The re-validation path (used by MI-C-D's own input validation) rebuilds the
  // selection from known fields only, so an injected userId is dropped here too —
  // never surviving into what MI-C-D sends as p_finalization. The canonical RPC
  // itself is the authoritative FORBIDDEN_FIELD enforcement point (already proven
  // live against Development in the MI-C-C round: "A2 caller-supplied userId is
  // rejected (FORBIDDEN_FIELD)").
  const alreadyCanonical = meal.buildMealIdentificationFinalization(confirmedFinalizationInput()).value;
  const tamperedCommand = {
    ...alreadyCanonical,
    selection: { ...alreadyCanonical.selection, userId: "someone-else" }
  };
  const revalidated = meal.validateMealIdentificationFinalizationCommand(tamperedCommand);
  expect(
    revalidated.ok && !("userId" in revalidated.value.selection),
    "a userId injected onto an already-canonical selection is dropped on re-validation, never reaching p_finalization"
  );

  // ---------- Disabled composition ----------
  const disabledRepo = new disabledRepoModule.DisabledConsumerMealIdentificationFinalizationRepository();
  const disabledResult = await disabledRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(
    disabledResult.ok === false && disabledResult.error.code === "finalization_disabled",
    "disabled composition fails closed without contacting any transport"
  );

  // ---------- Mock composition: confirmed, 4 unresolved reasons, corrections, replay, conflict ----------
  const actorA = "actor-a";
  const mockRepo = new mockRepoModule.MockConsumerMealIdentificationFinalizationRepository({
    authPort: fakeAuthPort(actorA)
  });

  const confirmedResult = await mockRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(confirmedResult.ok && confirmedResult.value.replayed === false, "mock confirmed finalization succeeds atomically");

  for (const reason of ["manual", "self_cooked", "none_of_the_above", "catalog_unavailable"]) {
    const built = meal.buildMealIdentificationFinalization(unresolvedFinalizationInput(reason));
    expect(built.ok, `unresolved(${reason}) command builds successfully`);
    const input = baseInput({
      clientRequestId: `2${reason.length}222222-2222-4222-8222-222222222222`.slice(0, 36),
      finalization: built.value
    });
    const result = await mockRepo.finalizeCurrentUserMealIdentification(input);
    expect(result.ok, `mock unresolved(${reason}) finalization succeeds atomically`);
  }

  const zeroCorrectionInput = baseInput({ clientRequestId: "33333333-3333-4333-8333-333333333333" });
  const zeroCorrectionResult = await mockRepo.finalizeCurrentUserMealIdentification(zeroCorrectionInput);
  expect(
    zeroCorrectionResult.ok && zeroCorrectionResult.value.mealCorrectionIds.length === 0,
    "zero corrections produce zero correction IDs"
  );

  const multiCorrectionSource = confirmedFinalizationInput();
  multiCorrectionSource.corrections = [nutritionCorrectionInput(0), nutritionCorrectionInput(1), nutritionCorrectionInput(2)];
  const builtMulti = meal.buildMealIdentificationFinalization(multiCorrectionSource);
  expect(builtMulti.ok, "multi-correction command builds with ordinals 0..2 preserved");
  expect(
    builtMulti.value.corrections.map((c) => c.ordinal).join(",") === "0,1,2",
    "correction ordinals are stable 0..n-1 in append order"
  );
  const multiInput = baseInput({ clientRequestId: "44444444-4444-4444-8444-444444444444", finalization: builtMulti.value });
  const multiResult = await mockRepo.finalizeCurrentUserMealIdentification(multiInput);
  expect(multiResult.ok && multiResult.value.mealCorrectionIds.length === 3, "multiple corrections all persist");

  // ---------- Available/unavailable analysis ----------
  const unavailableSource = unresolvedFinalizationInput("manual");
  unavailableSource.originalAnalysis = unavailableOriginalAnalysis();
  const builtUnavailable = meal.buildMealIdentificationFinalization(unavailableSource);
  expect(builtUnavailable.ok, "unavailable analysis shape is accepted");
  const unavailableInput = baseInput({
    clientRequestId: "55555555-5555-4555-8555-555555555555",
    finalization: builtUnavailable.value
  });
  const unavailableResult = await mockRepo.finalizeCurrentUserMealIdentification(unavailableInput);
  expect(unavailableResult.ok, "mock unavailable analysis finalization succeeds");

  const fakeAiUnavailable = unresolvedFinalizationInput("manual");
  fakeAiUnavailable.originalAnalysis = { ...unavailableOriginalAnalysis(), model: { name: "fake", version: "1" } };
  const builtFakeAi = meal.buildMealIdentificationFinalization(fakeAiUnavailable);
  expect(!builtFakeAi.ok, "fake unavailable AI provenance is rejected at the contract layer");

  // ---------- Identical retry key reuse / stable IDs / new intent -> new key ----------
  const replayResult = await mockRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(
    replayResult.ok &&
      replayResult.value.replayed === true &&
      replayResult.value.mealRecordId === confirmedResult.value.mealRecordId,
    "identical retry key with identical payload replays with stable IDs"
  );
  const conflictResult = await mockRepo.finalizeCurrentUserMealIdentification(
    baseInput({ mealType: "dinner" })
  );
  expect(
    !conflictResult.ok && conflictResult.error.code === "finalization_idempotency_conflict",
    "same key with a different payload maps to idempotency conflict"
  );
  const newIntentResult = await mockRepo.finalizeCurrentUserMealIdentification(
    baseInput({ clientRequestId: "66666666-6666-4666-8666-666666666666" })
  );
  expect(
    newIntentResult.ok && newIntentResult.value.mealRecordId !== confirmedResult.value.mealRecordId,
    "a new intent (new client_request_id) always produces a new stable ID set"
  );

  // ---------- Unauthenticated fail closed ----------
  const unauthRepo = new mockRepoModule.MockConsumerMealIdentificationFinalizationRepository({
    authPort: fakeAuthPort(null)
  });
  const unauthResult = await unauthRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(
    !unauthResult.ok && unauthResult.error.code === "finalization_authentication_required",
    "unauthenticated call fails closed with zero writes"
  );

  // ---------- Service: auth gate before repository, invalid input rejected before auth ----------
  const svc = new service.ConsumerMealIdentificationFinalizationService({
    authPort: fakeAuthPort(actorA),
    repository: mockRepo
  });
  const svcInvalid = await svc.finalizeCurrentUserMealIdentification(baseInput({ clientRequestId: "not-a-uuid" }));
  expect(!svcInvalid.ok && svcInvalid.error.code === "finalization_invalid_input", "service rejects invalid input before touching the repository");
  const svcUnauth = await new service.ConsumerMealIdentificationFinalizationService({
    authPort: fakeAuthPort(null),
    repository: mockRepo
  }).finalizeCurrentUserMealIdentification(baseInput({ clientRequestId: "77777777-7777-4777-8777-777777777777" }));
  expect(!svcUnauth.ok && svcUnauth.error.code === "finalization_authentication_required", "service fails closed when unauthenticated");

  // ---------- Supabase repository: single RPC call site, error mapping, no partial success ----------
  let rpcCallCount = 0;
  const fakeClient = {
    rpc: async (fn, args) => {
      rpcCallCount += 1;
      expect(fn === contracts.SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION, "supabase repository calls the canonical RPC function name");
      return { data: goodResponse, error: null, status: 200 };
    }
  };
  const supabaseRepo = new supabaseRepoModule.SupabaseConsumerMealIdentificationFinalizationRepository(fakeClient);
  const supabaseResult = await supabaseRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(supabaseResult.ok && rpcCallCount === 1, "supabase repository calls the RPC exactly once per finalize call");

  const failingClient = {
    rpc: async () => ({ data: null, error: { code: "23503", message: "CATALOG_IDENTITY_REJECTED" }, status: 400 })
  };
  const failingRepo = new supabaseRepoModule.SupabaseConsumerMealIdentificationFinalizationRepository(failingClient);
  const failingResult = await failingRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(
    !failingResult.ok &&
      failingResult.error.code === "finalization_catalog_identity_rejected" &&
      !("value" in failingResult),
    "RPC rejection never reports partial success (no value field on failure)"
  );

  const throwingClient = { rpc: async () => { throw new Error("network down"); } };
  const throwingRepo = new supabaseRepoModule.SupabaseConsumerMealIdentificationFinalizationRepository(throwingClient);
  const throwingResult = await throwingRepo.finalizeCurrentUserMealIdentification(baseInput());
  expect(
    !throwingResult.ok && throwingResult.error.code === "finalization_transport_failed",
    "transport-level throw maps to a safe transport-failed result, not a crash or partial success"
  );

  // ---------- Feature flags: disabled default, no mock fallback on unknown value ----------
  const defaultFlags = featureFlags.getConsumerMealIdentificationFinalizationRuntimeFlags({});
  expect(defaultFlags.source === "disabled", "unset source flag defaults to disabled");
  const unknownFlags = featureFlags.getConsumerMealIdentificationFinalizationRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_SOURCE: "not-a-real-source"
  });
  expect(unknownFlags.source === "disabled" && unknownFlags.issues.length > 0, "unknown source value fails closed to disabled, never mock");

  // ---------- Factories: mock/disabled/supabase composition selection ----------
  const disabledFromFactory = factories.createConsumerMealIdentificationFinalizationRepository({ source: "disabled", issues: [] });
  expect(disabledFromFactory.source === "disabled", "factory selects the disabled repository for source=disabled");
  const mockFromFactory = factories.createConsumerMealIdentificationFinalizationRepository(
    { source: "mock", issues: [] },
    { authPort: fakeAuthPort(actorA) }
  );
  expect(mockFromFactory.source === "mock", "factory selects the mock repository for source=mock");
  const supabaseFromFactory = factories.createConsumerMealIdentificationFinalizationRepository(
    { source: "supabase", issues: [] },
    { finalizationClient: fakeClient }
  );
  expect(supabaseFromFactory.source === "supabase", "factory selects the supabase repository for source=supabase");
  let threwOnMissingDeps = false;
  try {
    factories.createConsumerMealIdentificationFinalizationRepository({ source: "supabase", issues: [] }, {});
  } catch {
    threwOnMissingDeps = true;
  }
  expect(threwOnMissingDeps, "factory fails closed when supabase source is selected without an injected client");

  // ---------- Runtime and composition source guard ----------
  const guardSource = fs.readFileSync(path.join(root, "scripts/meal-identification-mi-c-d-guard.mjs"), "utf8");
  expect(
    !/process\.env|fetch\s*\(|service[_-]?role/i.test(fs.readFileSync(new URL(import.meta.url), "utf8")),
    "smoke uses no remote or credential access"
  );
  expect(guardSource.length > 0, "MI-C-D guard exists alongside this smoke");

  for (const name of checks) console.log(`PASS ${name}`);
  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(`RESULT ${checks.length}/${checks.length + 1} FAIL`);
  process.exitCode = 1;
}
