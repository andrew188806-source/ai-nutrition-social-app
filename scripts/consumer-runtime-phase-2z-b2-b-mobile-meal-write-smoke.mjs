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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (request) => {
    if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.js$/, "");
    const resolved = fs.existsSync(base) && fs.statSync(base).isDirectory() ? path.join(base, "index.ts") : `${base}.ts`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(localRequire, module, module.exports);
  return module.exports;
}
const authStorage = loadTsModule("apps/mobile/features/consumer-auth/storage.ts");
const mapper = loadTsModule("apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts");
const storeModule = loadTsModule("apps/mobile/features/consumer-runtime/consumerMealWriteOperationStore.ts");
const runtimeModule = loadTsModule("apps/mobile/features/consumer-runtime/consumerMealWriteRuntime.ts");
const analysisSource = fs.readFileSync(path.join(root, "apps/mobile/app/analysis.tsx"), "utf8");
const providerSource = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx"), "utf8");
const compositionSource = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts"), "utf8");
const todayModelSource = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "apps/mobile/app/index.tsx"), "utf8");
const todaySource = fs.readFileSync(path.join(root, "apps/mobile/app/today-intake.tsx"), "utf8");

const fixedKey = "10000000-0000-4000-8000-00000000b2b1";
const submittedAt = new Date("2026-07-19T16:30:00.000Z");
const baseDraft = {
  selectedMealPeriod: "午餐",
  mealName: "雞胸餐",
  originalDetectedName: "雞胸餐",
  portion: "1 份",
  nutrition: { calories: 520, protein: 38, carbohydrates: 56, fat: 14 },
  isSelfCooked: false,
  wasUserCorrected: false,
  trustedCanonicalIdentity: null
};
const actor = { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" };
const canonicalRecord = (input) => ({
  mealRecordId: `record-${input.idempotencyKey}`,
  mealType: input.mealType,
  occurredAt: input.occurredAt,
  mealDate: input.mealDate,
  timezone: input.timezone,
  title: input.title,
  note: input.note,
  source: input.source,
  createdAt: input.occurredAt,
  updatedAt: input.occurredAt,
  items: []
});
function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}
function makeRuntime({ service, storage = new authStorage.MemoryConsumerAuthStorage(), clock, uuidFactory } = {}) {
  const operationStore = new storeModule.ConsumerMealWriteOperationStore(storage, () => submittedAt);
  return {
    storage,
    operationStore,
    runtime: new runtimeModule.ConsumerMealWriteRuntime({
      service: service ?? { createCurrentUserMealRecord: async (input) => ({ ok: true, value: canonicalRecord(input) }) },
      operationStore,
      clock: clock ?? { now: () => submittedAt },
      uuidFactory: uuidFactory ?? (() => fixedKey)
    })
  };
}

try {
  expect(/finalizeMealIdentificationFromExplicitGesture/.test(analysisSource), "explicit gesture is the Meal Write entry");
  expect(!/autoSavedConfirmedMeal|matchState\s*===\s*["']confirmed["'][\s\S]{0,240}persistMealRecord/.test(analysisSource), "confirmed state performs no automatic write");

  const periods = [["早餐", "breakfast"], ["午餐", "lunch"], ["晚餐", "dinner"], ["點心", "snack"]];
  for (const [selectedMealPeriod, expected] of periods) {
    expect(mapper.mapConsumerAnalysisMealWrite({ ...baseDraft, selectedMealPeriod, timezone: "Asia/Taipei", submittedAt }).mealType === expected, `mapper maps ${expected}`);
  }
  const aiInput = mapper.mapConsumerAnalysisMealWrite({ ...baseDraft, timezone: "Asia/Taipei", submittedAt });
  const selfInput = mapper.mapConsumerAnalysisMealWrite({ ...baseDraft, isSelfCooked: true, timezone: "Asia/Taipei", submittedAt });
  expect(aiInput.source === "ai_estimated" && selfInput.source === "self_made", "mapper distinguishes AI and self-made source");
  const corrected = mapper.mapConsumerAnalysisMealWrite({ ...baseDraft, mealName: "修正餐", wasUserCorrected: true, timezone: "Asia/Taipei", submittedAt });
  expect(corrected.items[0].nutritionSource === "user_corrected" && corrected.items[0].userEnteredName === "修正餐", "mapper marks user-corrected nutrition and name");
  expect(aiInput.items[0].restaurantId === null && aiInput.items[0].branchId === null && aiInput.items[0].menuId === null && aiInput.items[0].menuItemId === null, "untrusted optional identities are null");
  expect(aiInput.note === null && !("ingredients" in aiInput.items[0]), "mapper excludes note and noncanonical ingredient data");
  expect(aiInput.mealDate === "2026-07-20", "mapper handles timezone cross-date from one snapshot");

  let invalidCalls = 0;
  const invalidHarness = makeRuntime({ service: { createCurrentUserMealRecord: async () => { invalidCalls += 1; throw new Error("must not call"); } } });
  await invalidHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  const invalid = await invalidHarness.runtime.submit(actor, { ...baseDraft, selectedMealPeriod: "unsupported" });
  expect(invalid.status === "error" && invalidCalls === 0, "mapping failure never calls repository");

  const events = [];
  class OrderedStorage extends authStorage.MemoryConsumerAuthStorage {
    async setItem(key, value) { events.push("persist"); return super.setItem(key, value); }
  }
  let clockReads = 0;
  let capturedInput;
  const orderedHarness = makeRuntime({
    storage: new OrderedStorage(),
    clock: { now: () => { clockReads += 1; return submittedAt; } },
    service: { createCurrentUserMealRecord: async (input) => { events.push("repository"); capturedInput = input; return { ok: true, value: canonicalRecord(input) }; } }
  });
  await orderedHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  const success = await orderedHarness.runtime.submit(actor, baseDraft);
  expect(events.join(",") === "persist,repository", "pending persists before repository call");
  expect(clockReads === 1 && capturedInput.occurredAt === submittedAt.toISOString(), "new operation reads clock exactly once");
  expect(/^10000000-0000-4000-8000-00000000b2b1$/.test(capturedInput.idempotencyKey), "new operation carries UUID v4 key");
  expect(success.status === "succeeded" && !success.pending, "success clears pending operation");
  expect(success.mealDataRevision === 1, "success increments meal data revision");
  expect(await orderedHarness.operationStore.load(actor.actorKey) === null, "success removes persisted pending data");

  const inflightDeferred = deferred();
  let inflightCalls = 0;
  const inflightHarness = makeRuntime({ service: { createCurrentUserMealRecord: async (input) => { inflightCalls += 1; await inflightDeferred.promise; return { ok: true, value: canonicalRecord(input) }; } } });
  await inflightHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  const tap1 = inflightHarness.runtime.submit(actor, baseDraft);
  const tap2 = inflightHarness.runtime.submit(actor, baseDraft);
  inflightDeferred.resolve();
  await Promise.all([tap1, tap2]);
  expect(inflightCalls === 1, "repeated tap shares one in-flight operation");

  let retryClockReads = 0;
  let ambiguityCalls = 0;
  const retryInputs = [];
  const retryHarness = makeRuntime({
    clock: { now: () => { retryClockReads += 1; return submittedAt; } },
    service: { createCurrentUserMealRecord: async (input) => {
      retryInputs.push(JSON.stringify(input));
      ambiguityCalls += 1;
      return ambiguityCalls === 1
        ? { ok: false, error: { code: "meal_write_transport_failed", message: "safe" } }
        : { ok: true, value: canonicalRecord(input) };
    } }
  });
  await retryHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  const uncertain = await retryHarness.runtime.submit(actor, baseDraft);
  expect(uncertain.status === "uncertain" && uncertain.pending, "transport ambiguity retains pending request without success");
  const retried = await retryHarness.runtime.retry(actor);
  expect(retried.status === "succeeded" && retryInputs[0] === retryInputs[1], "retry reuses exact same key and input");
  expect(retryClockReads === 1, "retry does not read clock or remap payload");

  const signedOutHarness = makeRuntime();
  const signedOut = await signedOutHarness.runtime.submit(actor, baseDraft);
  expect(signedOut.errorCode === "authentication_required", "signed-out write fails closed");
  const disabledHarness = makeRuntime({ service: { createCurrentUserMealRecord: async () => ({ ok: false, error: { code: "meal_write_disabled", message: "safe" } }) } });
  await disabledHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  expect((await disabledHarness.runtime.submit(actor, baseDraft)).errorCode === "disabled", "disabled mode fails closed");
  const configHarness = makeRuntime({ service: { createCurrentUserMealRecord: async () => ({ ok: false, error: { code: "meal_write_configuration_invalid", message: "safe" } }) } });
  await configHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  expect((await configHarness.runtime.submit(actor, baseDraft)).errorCode === "configuration_error", "unsupported configuration fails closed");

  const staleDeferred = deferred();
  const staleHarness = makeRuntime({ service: { createCurrentUserMealRecord: async (input) => { await staleDeferred.promise; return { ok: true, value: canonicalRecord(input) }; } } });
  await staleHarness.runtime.setActor(actor.actorKey, actor.actorGeneration);
  const stalePromise = staleHarness.runtime.submit(actor, baseDraft);
  await staleHarness.runtime.setActor("actor-b", 2);
  staleDeferred.resolve();
  await stalePromise;
  expect(staleHarness.runtime.getState().status !== "succeeded" && staleHarness.runtime.getState().mealDataRevision === 0, "actor switch suppresses stale success response");
  expect(await staleHarness.operationStore.load(actor.actorKey) === null, "logout or actor switch clears old actor pending data");

  const expiredStorage = new authStorage.MemoryConsumerAuthStorage();
  const expiredStore = new storeModule.ConsumerMealWriteOperationStore(expiredStorage, () => new Date(submittedAt.getTime() + storeModule.CONSUMER_MEAL_WRITE_PENDING_TTL_MS + 1));
  await expiredStorage.setItem(`tastkind.consumerMealWrite.pending.v1.${encodeURIComponent(actor.actorKey)}`, JSON.stringify({ idempotencyKey: fixedKey, input: { ...aiInput, idempotencyKey: fixedKey }, createdAt: submittedAt.toISOString(), expiresAt: new Date(submittedAt.getTime() + storeModule.CONSUMER_MEAL_WRITE_PENDING_TTL_MS).toISOString() }));
  expect(await expiredStore.load(actor.actorKey) === null, "expired pending request is removed and never auto-sent");

  expect(/consumerRuntime\.mode === ["']mock["'][\s\S]*persistCanonicalMealToExplicitDemoStore/.test(analysisSource), "Demo persistence is explicit and mock-only");
  expect(!/fallback[\s\S]{0,100}(?:mock|local)|(?:mock|local)[\s\S]{0,100}fallback/i.test(providerSource + compositionSource), "Supabase failure has no local fallback");
  expect(/revision:\s*runtime\.mealDataRevision/.test(homeSource) && /revision:\s*runtime\.mealDataRevision/.test(todaySource), "Home and Today refetch on meal revision");
  expect(!/SupabaseConsumerClientFactory|createOfficialSupabaseConsumerSdkLoader/.test(todayModelSource), "Today model creates no second Supabase client");
  expect(!/persist_authenticated_daily_nutrition_summary|dailyNutritionSummaryPersistence/.test(analysisSource + providerSource + compositionSource), "Meal success calls no summary persistence RPC");
  expect(!/confirmPlannedDinnerFromAnalysis/.test(analysisSource), "live Meal Write has no Planned Meal side effect");
  expect(/setActor\(state\.actorKey, state\.actorGeneration\)/.test(providerSource), "Provider binds operations to actor generation");
  expect(!/process\.env|fetch\s*\(|service[_-]?role/i.test(fs.readFileSync(new URL(import.meta.url), "utf8")), "smoke uses no remote or credential access");

  for (const name of checks) console.log(`PASS ${name}`);
  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(`RESULT ${checks.length}/${checks.length + 1} FAIL`);
  process.exitCode = 1;
}
