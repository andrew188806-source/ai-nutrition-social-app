#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const cache = new Map();

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL ${name}`);
  checks.push(name);
  console.log(`PASS ${name}`);
}

function loadTsModule(relativePath) {
  const absolute = path.resolve(root, relativePath);
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
      fs.existsSync(base) && fs.statSync(base).isDirectory()
        ? path.join(base, "index.ts")
        : fs.existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(
    localRequire,
    module,
    module.exports
  );
  return module.exports;
}

const meal = loadTsModule("apps/mobile/features/meal-identification/index.ts");
const finalizationFeature = loadTsModule(
  "apps/mobile/features/meal-identification-finalization/index.ts"
);
const runtimeModule = loadTsModule(
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts"
);
const operationStoreModule = loadTsModule(
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts"
);
const mockRepoModule = loadTsModule(
  "apps/mobile/features/meal-identification-finalization/adapters/mockConsumerMealIdentificationFinalizationRepository.ts"
);
const dailySummaryModule = loadTsModule(
  "apps/mobile/features/consumer-meals/dailyNutritionSummaryCalculator.ts"
);
const todayOverviewModule = loadTsModule(
  "apps/mobile/features/consumer-meals/consumerTodayIntakeOverviewService.ts"
);

const actualCurrent = "2026-07-25T04:05:00.000Z";
const actualPriorDay = "2026-07-23T16:30:00.000Z";
const nullIdentity = () => ({
  restaurantId: null,
  branchId: null,
  menuId: null,
  menuCategoryId: null,
  menuItemId: null,
  branchMenuItemId: null
});
const originalAnalysis = () => ({
  status: "available",
  detectedItemNames: ["雞胸碗"],
  model: null,
  photoReferences: ["photo-1"],
  estimatedNutrition: { calories: 500, protein: 35 },
  confidence: null,
  analyzedAt: "2026-07-25T04:00:00.000Z"
});
const catalogCandidate = () => ({
  kind: "catalog_item",
  identity: {
    restaurantId: "restaurant-1",
    branchId: "branch-1",
    menuId: "menu-1",
    menuCategoryId: "category-1",
    menuItemId: "item-1",
    branchMenuItemId: "branch-item-1"
  },
  source: "supabase",
  restaurantName: "好初健康碗",
  branchName: "信義店",
  branchContext: "信義區",
  menuName: "午餐",
  menuCategoryName: "健康碗",
  mealItemName: "雞胸碗",
  price: 180,
  availability: "available",
  nutritionProvenance: "restaurant_confirmed",
  confidence: 0.9,
  matchReason: "catalog_match",
  tags: ["高蛋白"]
});
const mealWrite = (selfCooked = false) => ({
  selectedMealPeriod: "午餐",
  mealName: "雞胸碗",
  portion: "1 份",
  nutrition: { calories: 500, protein: 35 },
  isSelfCooked: selfCooked,
  wasUserCorrected: false
});

function unresolvedInput(sourceContext, recordTiming, occurredAt = actualCurrent) {
  const selfCooked = sourceContext === "self_cooked";
  return {
    version: meal.MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    recordTiming,
    occurredAt,
    originalAnalysis: originalAnalysis(),
    selection: {
      kind: "personal_unresolved_selection",
      sourceContext,
      candidate: meal.createPersonalUnresolvedCandidate({
        source: selfCooked ? "self_cooked" : "manual",
        restaurantName: selfCooked ? "" : "自訂來源",
        mealItemName: "雞胸碗"
      })
    },
    corrections: [],
    mealWrite: mealWrite(selfCooked)
  };
}

function confirmedInput(recordTiming = "current", occurredAt = actualCurrent) {
  return {
    version: meal.MEAL_IDENTIFICATION_FINALIZATION_VERSION,
    recordTiming,
    occurredAt,
    originalAnalysis: originalAnalysis(),
    selection: {
      kind: "catalog_selection",
      confirmationStatus: "confirmed",
      sourceContext: "dine_in",
      candidate: catalogCandidate()
    },
    corrections: [],
    mealWrite: mealWrite(false)
  };
}

function build(value) {
  return meal.buildMealIdentificationFinalization(value);
}

function authPort(actorRef) {
  return {
    source: "mock",
    getCurrentSession: async () => ({
      ok: true,
      value: actorRef.value ? { user: { userId: actorRef.value } } : null
    })
  };
}

function rpcInput(command, requestId = "11111111-1111-4111-8111-111111111111") {
  return {
    clientRequestId: requestId,
    mealType: "lunch",
    occurredAt: command.occurredAt,
    mealDate: command.occurredAt === actualPriorDay ? "2026-07-24" : "2026-07-25",
    timezone: "Asia/Taipei",
    finalization: command
  };
}

try {
  expect(
    meal.MEAL_IDENTIFICATION_FINALIZATION_VERSION === "meal-identification-finalization-v2",
    "corrected canonical contract version is v2"
  );

  const combinations = [];
  for (const source of ["dine_in", "takeout", "self_cooked"]) {
    for (const timing of ["current", "post_hoc"]) {
      const result = build(
        unresolvedInput(source, timing, timing === "post_hoc" ? actualPriorDay : actualCurrent)
      );
      expect(result.ok, `${source} + ${timing} builds through the canonical builder`);
      combinations.push(result.value);
    }
  }
  expect(combinations.length === 6, "all six source and timing combinations are independently expressible");

  const postHocAsSource = unresolvedInput("post_hoc", "current");
  const rejectedPostHocSource = build(postHocAsSource);
  expect(
    !rejectedPostHocSource.ok && rejectedPostHocSource.error.code === "invalid_selection",
    "new meal-source input rejects post_hoc"
  );
  expect(
    build(unresolvedInput("takeout", "current")).ok &&
      build(unresolvedInput("takeout", "post_hoc", actualPriorDay)).ok,
    "record timing accepts current and post_hoc independently of takeout"
  );

  const missingOccurredAt = unresolvedInput("takeout", "post_hoc");
  delete missingOccurredAt.occurredAt;
  const missingTimeResult = build(missingOccurredAt);
  expect(
    !missingTimeResult.ok && missingTimeResult.error.code === "invalid_occurred_at",
    "post_hoc without actual meal time fails explicitly"
  );
  const invalidTimeResult = build(unresolvedInput("takeout", "post_hoc", "not-a-timestamp"));
  expect(
    !invalidTimeResult.ok && invalidTimeResult.error.code === "invalid_occurred_at",
    "invalid actual meal timestamp fails explicitly"
  );
  const invalidTimingResult = build(unresolvedInput("takeout", "later", actualPriorDay));
  expect(
    !invalidTimingResult.ok && invalidTimingResult.error.code === "invalid_record_timing",
    "record timing rejects values outside current and post_hoc"
  );

  const confirmed = build(confirmedInput());
  expect(confirmed.ok && confirmed.value.selection.kind === "confirmed_catalog", "confirmed Catalog flow remains valid");
  expect(
    Object.values(confirmed.value.selection.identity).every((value) => typeof value === "string"),
    "confirmed Catalog flow preserves all six canonical IDs"
  );

  for (const reason of ["manual", "self_cooked", "none_of_the_above", "catalog_unavailable"]) {
    const selfCooked = reason === "self_cooked";
    const candidate = meal.createPersonalUnresolvedCandidate({
      source: reason,
      restaurantName: "",
      mealItemName: "自訂餐點"
    });
    const input = unresolvedInput(selfCooked ? "self_cooked" : "unknown", "current");
    input.selection.candidate = candidate;
    input.mealWrite = mealWrite(selfCooked);
    const result = build(input);
    expect(
      result.ok && Object.values(result.value.selection.identity).every((value) => value === null),
      `${reason} unresolved flow retains six null Catalog IDs`
    );
  }

  const takeoutUnresolved = build(unresolvedInput("takeout", "post_hoc", actualPriorDay));
  expect(
    takeoutUnresolved.ok &&
      Object.values(takeoutUnresolved.value.selection.identity).every((value) => value === null),
    "takeout provenance alone creates no fake restaurant or branch identity"
  );
  const selfCookedUnresolved = build(unresolvedInput("self_cooked", "post_hoc", actualPriorDay));
  expect(
    selfCookedUnresolved.ok &&
      Object.values(selfCookedUnresolved.value.selection.identity).every((value) => value === null),
    "self_cooked post_hoc creates no Catalog identity"
  );

  const correctedInput = confirmedInput("post_hoc", actualPriorDay);
  correctedInput.corrections = [{
    correctedAt: "2026-07-25T04:10:00.000Z",
    correctionReason: null,
    detail: {
      correctionType: "nutrition_override",
      before: { calories: 500 },
      after: { calories: 480 }
    }
  }];
  const corrected = build(correctedInput);
  expect(
    corrected.ok &&
      corrected.value.occurredAt === actualPriorDay &&
      corrected.value.originalAnalysis.analyzedAt === "2026-07-25T04:00:00.000Z",
    "correction preserves actual meal time and original AI analysis"
  );

  const mismatch = finalizationFeature.validateFinalizeCurrentUserMealIdentificationInput({
    ...rpcInput(confirmed.value),
    occurredAt: "2026-07-25T05:00:00.000Z"
  });
  expect(!mismatch.ok, "outer RPC occurredAt cannot diverge from canonical finalization occurredAt");

  const actor = { value: "actor-a" };
  let mockId = 0;
  const mockRepo = new mockRepoModule.MockConsumerMealIdentificationFinalizationRepository({
    authPort: authPort(actor),
    idGenerator: () => `stable-${++mockId}`
  });
  const postHocCommand = takeoutUnresolved.value;
  const first = await mockRepo.finalizeCurrentUserMealIdentification(rpcInput(postHocCommand));
  const replay = await mockRepo.finalizeCurrentUserMealIdentification(rpcInput(postHocCommand));
  expect(first.ok && replay.ok && replay.value.replayed, "idempotent replay returns the same durable result");
  expect(
    first.ok && replay.ok && first.value.mealRecordId === replay.value.mealRecordId,
    "idempotent replay preserves stable IDs"
  );

  const changedTimingCommand = build(unresolvedInput("takeout", "current", actualPriorDay)).value;
  const timingConflict = await mockRepo.finalizeCurrentUserMealIdentification(
    rpcInput(changedTimingCommand)
  );
  expect(
    !timingConflict.ok &&
      timingConflict.error.code === "finalization_idempotency_conflict",
    "same idempotency key with different timing conflicts"
  );
  const changedSourceCommand = build(unresolvedInput("dine_in", "post_hoc", actualPriorDay)).value;
  const sourceConflict = await mockRepo.finalizeCurrentUserMealIdentification(
    rpcInput(changedSourceCommand)
  );
  expect(
    !sourceConflict.ok && sourceConflict.error.code === "finalization_idempotency_conflict",
    "same idempotency key with different meal source conflicts"
  );
  const changedOccurredCommand = build(
    unresolvedInput("takeout", "post_hoc", "2026-07-23T17:30:00.000Z")
  ).value;
  const occurredConflict = await mockRepo.finalizeCurrentUserMealIdentification({
    ...rpcInput(changedOccurredCommand),
    mealDate: "2026-07-24"
  });
  expect(
    !occurredConflict.ok && occurredConflict.error.code === "finalization_idempotency_conflict",
    "same idempotency key with different actual meal time conflicts"
  );

  actor.value = "actor-b";
  const otherActor = await mockRepo.finalizeCurrentUserMealIdentification(rpcInput(postHocCommand));
  expect(
    otherActor.ok && first.ok && otherActor.value.mealRecordId !== first.value.mealRecordId,
    "same request key remains isolated by authenticated actor"
  );

  const storage = new Map();
  const operationStore = new operationStoreModule.ConsumerMealIdentificationFinalizationOperationStore({
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async (key) => { storage.delete(key); }
  });
  let capturedRuntimeInput = null;
  const runtime = new runtimeModule.ConsumerMealIdentificationFinalizationRuntime({
    operationStore,
    clock: { now: () => new Date("2026-07-25T08:00:00.000Z") },
    uuidFactory: () => "22222222-2222-4222-8222-222222222222",
    service: {
      finalizeCurrentUserMealIdentification: async (input) => {
        capturedRuntimeInput = input;
        return {
          ok: true,
          source: "mock",
          value: {
            replayed: false,
            mealRecordId: "runtime-record",
            mealRecordItemId: "runtime-item",
            mealAnalysisId: "runtime-analysis",
            mealIdentificationFinalizationId: "runtime-ledger",
            mealCorrectionIds: []
          }
        };
      }
    }
  });
  await runtime.setActor("actor-runtime", 1);
  await runtime.submit(
    { actorKey: "actor-runtime", actorGeneration: 1, timezone: "Asia/Taipei" },
    { mealType: "lunch", finalization: postHocCommand }
  );
  expect(
    capturedRuntimeInput?.occurredAt === actualPriorDay &&
      capturedRuntimeInput?.mealDate === "2026-07-24",
    "runtime derives post_hoc date from actual meal time rather than submission time"
  );

  const priorMealRecord = {
    mealRecordId: "prior-record",
    mealType: "lunch",
    occurredAt: actualPriorDay,
    mealDate: "2026-07-24",
    timezone: "Asia/Taipei",
    source: "ai_estimated",
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
    items: [{
      mealRecordItemId: "prior-item",
      displayName: "昨天補登",
      nutrition: { calories: 500 },
      nutritionSource: "ai_estimated",
      nutritionSchemaVersion: "v1",
      occurredAt: actualPriorDay,
      timezone: "Asia/Taipei",
      consumedRatio: 1,
      correctionStatus: "none",
      createdAt: "2026-07-25T08:00:00.000Z",
      updatedAt: "2026-07-25T08:00:00.000Z"
    }]
  };
  const yesterdaySummary = dailySummaryModule.calculateDailyNutritionSummary({
    summaryDate: "2026-07-24",
    timezone: "Asia/Taipei",
    calculatedAt: "2026-07-25T08:00:00.000Z",
    mealRecords: [priorMealRecord]
  });
  const todaySummary = dailySummaryModule.calculateDailyNutritionSummary({
    summaryDate: "2026-07-25",
    timezone: "Asia/Taipei",
    calculatedAt: "2026-07-25T08:00:00.000Z",
    mealRecords: [priorMealRecord]
  });
  expect(
    yesterdaySummary.ok && yesterdaySummary.value.calories === 500,
    "daily summary assigns post_hoc nutrition to actual meal date"
  );
  expect(
    todaySummary.ok && todaySummary.value.calories === 0,
    "daily summary does not contaminate today with a prior-day post_hoc meal"
  );

  let requestedRange = null;
  const overview = new todayOverviewModule.ConsumerTodayIntakeOverviewService({
    timezone: "Asia/Taipei",
    clock: { now: () => new Date("2026-07-25T08:00:00.000Z") },
    mealRecordsSource: "mock",
    dailyNutritionSource: "mock",
    mealRecordsService: {
      listCurrentUserMealRecords: async (range) => {
        requestedRange = range;
        return { ok: true, value: [] };
      }
    },
    dailyNutritionSummaryService: {
      getCurrentUserDailyNutritionSummary: async () => ({
        ok: false,
        error: { code: "daily_summary_not_found" }
      })
    }
  });
  await overview.getCurrentUserTodayIntakeOverview();
  expect(
    requestedRange?.startDate === "2026-07-25" && requestedRange?.endDate === "2026-07-25",
    "Today Intake reads only the timezone-owned current meal date"
  );

  const legacyMapped = finalizationFeature.mapMealIdentificationFinalizationTemporalContext({
    contract_version: "meal-identification-finalization-v1",
    source_context: "post_hoc",
    meal_source_context: "unknown",
    record_timing: "post_hoc",
    occurred_at: actualPriorDay,
    meal_record_occurred_at: actualPriorDay
  });
  expect(
    legacyMapped.mealSource === "unknown" &&
      legacyMapped.recordTiming === "post_hoc" &&
      legacyMapped.occurredAt === actualPriorDay,
    "legacy post_hoc maps to unknown source plus post_hoc without guessing"
  );
  const newMapped = finalizationFeature.mapMealIdentificationFinalizationTemporalContext({
    contract_version: "meal-identification-finalization-v2",
    source_context: "takeout",
    meal_source_context: "takeout",
    record_timing: "post_hoc",
    occurred_at: actualPriorDay,
    meal_record_occurred_at: actualPriorDay
  });
  expect(
    newMapped.mealSource === "takeout" && newMapped.recordTiming === "post_hoc",
    "read mapper preserves corrected v2 source and timing"
  );

  const rpcArgs = finalizationFeature.buildFinalizeMealIdentificationRpcArgs(
    rpcInput(postHocCommand)
  );
  expect(
    rpcArgs.p_finalization.recordTiming === "post_hoc" &&
      rpcArgs.p_finalization.occurredAt === actualPriorDay &&
      rpcArgs.p_occurred_at === actualPriorDay,
    "adapter passes source timing and actual meal time through the canonical RPC payload"
  );

  const migration = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql"
    ),
    "utf8"
  );
  expect(
    (migration.match(/CREATE FUNCTION public\.finalize_current_user_meal_identification_v1\(/g) ?? [])
      .length === 1 &&
      !/CREATE FUNCTION public\.finalize_current_user_meal_identification_v2\(/.test(migration),
    "local migration static contract exposes one non-overloaded canonical RPC"
  );
  expect(
    !/create_current_user_meal_record/i.test(migration),
    "correction migration introduces no second Meal Write path"
  );

  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.log(`RESULT ${checks.length}/${checks.length + 1} PASS`);
  process.exit(1);
}
