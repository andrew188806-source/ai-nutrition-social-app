#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd(); const checks = []; const cache = new Map();
function expect(value, name) { if (!value) throw new Error(`FAIL [${name}]`); checks.push(name); }
function load(file) {
  const absolute = path.resolve(root, file); if (cache.has(absolute)) return cache.get(absolute).exports;
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(absolute, module);
  const localRequire = (request) => { if (!request.startsWith(".")) throw new Error(`External module refused: ${request}`); const base = path.resolve(path.dirname(absolute), request).replace(/\.js$/, ""); return load(path.relative(root, fs.existsSync(base) && fs.statSync(base).isDirectory() ? path.join(base, "index.ts") : `${base}.ts`)); };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(localRequire, module, module.exports); return module.exports;
}
const authTypes = load("apps/mobile/features/consumer-auth/types.ts");
const authStorage = load("apps/mobile/features/consumer-auth/storage.ts");
const mappers = load("apps/mobile/features/consumer-meals/plannedMealV2Mappers.ts");
const mock = load("apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealV2Repository.ts");
const supabase = load("apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealV2Repository.ts");
const storeModule = load("apps/mobile/features/consumer-runtime/consumerPlannedMealOperationStore.ts");
const runtimeModule = load("apps/mobile/features/consumer-runtime/consumerPlannedMealRuntime.ts");
let actor = "00000000-0000-4000-8000-00000000b301";
const session = () => ({ user: { userId: actor, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "2026-07-20T00:00:00.000Z" }, provider: "supabase", issuedAt: "2026-07-20T00:00:00.000Z" });
const authPort = { source: "supabase-live", getCurrentSession: async () => authTypes.ok(session()) };
const createInput = {
  createRequestId: "10000000-0000-4000-8000-00000000b301", plannedFor: "2026-07-21", plannedLocalTime: null,
  plannedTimezone: "Asia/Taipei", mealType: "dinner", mealCategory: "family", title: "烤鮭魚晚餐",
  restaurantNameSnapshot: "好廚食堂", note: null, restaurantId: "restaurant-1", branchId: "branch-1",
  menuItemId: "menu-item-1", nutritionSnapshot: { calories: 520, protein: 35, carbohydrates: 48, fat: 18 }
};
function deferred() { let resolve; const promise = new Promise((next) => { resolve = next; }); return { promise, resolve }; }
try {
  expect(mappers.validateCreatePlannedMealV2Input(createInput).plannedLocalTime === null, "date-only create accepts timezone with null local time");
  expect(mappers.validateCreatePlannedMealV2Input({ ...createInput, plannedLocalTime: "19:30" }).plannedLocalTime === "19:30", "optional local wall-clock time is canonical");
  let badTimezone = false; try { mappers.validateCreatePlannedMealV2Input({ ...createInput, plannedTimezone: "Invalid/Zone" }); } catch { badTimezone = true; }
  expect(badTimezone, "invalid IANA timezone is rejected locally");
  let badKey = false; try { mappers.validateCreatePlannedMealV2Input({ ...createInput, createRequestId: "not-v4" }); } catch { badKey = true; }
  expect(badKey, "create identity requires UUID v4");
  let unknownPatch = false; try { mappers.validateUpdatePlannedMealV2Input({ plannedMealId: "20000000-0000-4000-8000-00000000b301", expectedUpdatedAt: "2026-07-20T02:00:00.000Z", patch: { title: "ok", status: "converted" } }); } catch { unknownPatch = true; }
  expect(unknownPatch, "update rejects unknown lifecycle patch keys");
  const repo = new mock.MockConsumerPlannedMealV2Repository({ authPort, now: () => "2026-07-20T02:00:00.000Z" });
  const first = await repo.create(createInput); expect(first.ok && !first.value.replayed, "mock create produces one planned row");
  const replay = await repo.create(createInput); expect(replay.ok && replay.value.replayed && replay.value.plannedMeal.plannedMealId === first.value.plannedMeal.plannedMealId, "same actor key and payload replays row");
  const changed = await repo.create({ ...createInput, title: "different" }); expect(!changed.ok, "same actor key with changed payload conflicts");
  actor = "00000000-0000-4000-8000-00000000b302"; const other = await repo.create(createInput);
  expect(other.ok && other.value.plannedMeal.plannedMealId !== first.value.plannedMeal.plannedMealId, "same key is independent across actors");
  actor = "00000000-0000-4000-8000-00000000b301";
  const updated = await repo.update({ plannedMealId: first.value.plannedMeal.plannedMealId, expectedUpdatedAt: first.value.plannedMeal.updatedAt, patch: { plannedLocalTime: "19:30", note: "bring a friend" } });
  expect(updated.ok && updated.value.plannedMeal.plannedTime === "19:30", "update replaces allowlisted values");
  const cleared = await repo.update({ plannedMealId: first.value.plannedMeal.plannedMealId, expectedUpdatedAt: updated.value.plannedMeal.updatedAt, patch: { plannedLocalTime: null, note: null } });
  expect(cleared.ok && cleared.value.plannedMeal.plannedTime === null && cleared.value.plannedMeal.note === null, "update explicit null clears nullable values");
  const stale = await repo.update({ plannedMealId: first.value.plannedMeal.plannedMealId, expectedUpdatedAt: first.value.plannedMeal.updatedAt, patch: { title: "stale" } });
  expect(!stale.ok, "update enforces expected_updated_at");
  const conversionInput = { plannedMealId: first.value.plannedMeal.plannedMealId, conversionRequestId: "30000000-0000-4000-8000-00000000b301", expectedUpdatedAt: cleared.value.plannedMeal.updatedAt, confirmationTimestamp: "2026-07-20T16:30:00.000Z", actorTimezone: "Asia/Taipei" };
  const converted = await repo.convert(conversionInput);
  expect(converted.ok && repo.listMealRecordsForTest().length === 1 && repo.listMealRecordsForTest()[0].itemCount === 1, "conversion atomically creates exactly one record and item");
  expect(converted.ok && repo.listMealRecordsForTest()[0].mealDate === "2026-07-21", "confirmation instant derives meal date in actor timezone");
  const convertedReplay = await repo.convert(conversionInput);
  expect(convertedReplay.ok && convertedReplay.value.replayed && repo.listMealRecordsForTest().length === 1, "same conversion key replays without duplicate");
  const differentConversion = await repo.convert({ ...conversionInput, conversionRequestId: "30000000-0000-4000-8000-00000000b302" });
  expect(!differentConversion.ok && repo.listMealRecordsForTest().length === 1, "different conversion key is a stable conflict");
  const updateConverted = await repo.update({ plannedMealId: first.value.plannedMeal.plannedMealId, expectedUpdatedAt: cleared.value.plannedMeal.updatedAt, patch: { title: "forbidden" } });
  expect(!updateConverted.ok, "converted plan is immutable to update");
  const cancelConverted = await repo.cancel({ plannedMealId: first.value.plannedMeal.plannedMealId, expectedUpdatedAt: cleared.value.plannedMeal.updatedAt });
  expect(!cancelConverted.ok, "converted plan cannot be cancelled");
  const cancelCreate = await repo.create({ ...createInput, createRequestId: "10000000-0000-4000-8000-00000000b303" });
  const cancelled = await repo.cancel({ plannedMealId: cancelCreate.value.plannedMeal.plannedMealId, expectedUpdatedAt: cancelCreate.value.plannedMeal.updatedAt });
  const cancelReplay = await repo.cancel({ plannedMealId: cancelCreate.value.plannedMeal.plannedMealId, expectedUpdatedAt: cancelCreate.value.plannedMeal.updatedAt });
  expect(cancelled.ok && cancelReplay.ok && cancelReplay.value.replayed, "cancel replay succeeds before stale version rejection");

  let versionConflictCalls = 0;
  const versionConflictRepo = new supabase.SupabaseConsumerPlannedMealV2Repository({
    authPort, writeEnabled: true,
    mealClient: { rpc: async () => { versionConflictCalls += 1; return { data: null, error: { code: "P0001", message: "PLANNED_MEAL_VERSION_CONFLICT raw-database-detail" }, status: 409 }; } }
  });
  const mappedVersionConflict = await versionConflictRepo.update({
    plannedMealId: "50000000-0000-4000-8000-00000000b301", expectedUpdatedAt: "2026-07-20T02:00:00.000Z", patch: { title: "stale" }
  });
  expect(!mappedVersionConflict.ok && mappedVersionConflict.error.code === "meal_write_function_rejected", "P0001 version conflict maps to stable Planned Meal domain error");
  expect(!mappedVersionConflict.ok && !mappedVersionConflict.error.message.includes("raw-database-detail"), "raw P0001 database error is not exposed");

  const conflictStorage = new authStorage.MemoryConsumerAuthStorage();
  const conflictStore = new storeModule.ConsumerPlannedMealOperationStore(conflictStorage, () => new Date("2026-07-20T02:00:00.000Z"));
  const conflictRuntime = new runtimeModule.ConsumerPlannedMealRuntime({
    operationStore: conflictStore, clock: { now: () => new Date("2026-07-20T02:00:00.000Z") },
    uuidFactory: () => "50000000-0000-4000-8000-00000000b302",
    service: { create: async () => { throw new Error("unused"); }, convert: (input) => versionConflictRepo.convert(input) }
  });
  const conflictContext = { actorKey: "version-conflict-actor", actorGeneration: 1, timezone: "Asia/Taipei" };
  await conflictRuntime.setActor(conflictContext.actorKey, conflictContext.actorGeneration);
  const deterministicConflict = await conflictRuntime.submitConversion(conflictContext, {
    plannedMealId: "50000000-0000-4000-8000-00000000b303", expectedUpdatedAt: "2026-07-20T02:00:00.000Z"
  });
  expect(deterministicConflict.status === "error" && deterministicConflict.errorCode === "conflict" && deterministicConflict.pendingKind === null, "P0001 version conflict is deterministic and not transport ambiguity");
  expect(await conflictStore.load(conflictContext.actorKey, "convert") === null && versionConflictCalls === 2, "deterministic version conflict clears pending and triggers no automatic retry");

  const storage = new authStorage.MemoryConsumerAuthStorage(); const store = new storeModule.ConsumerPlannedMealOperationStore(storage, () => new Date("2026-07-20T02:00:00.000Z"));
  let clockReads = 0; let calls = 0; const seen = [];
  const runtime = new runtimeModule.ConsumerPlannedMealRuntime({
    operationStore: store, clock: { now: () => { clockReads += 1; return new Date("2026-07-20T02:00:00.000Z"); } },
    uuidFactory: () => "40000000-0000-4000-8000-00000000b301",
    service: { create: async (input) => { seen.push(JSON.stringify(input)); calls += 1; return calls === 1 ? { ok: false, error: { code: "meal_write_transport_failed", message: "safe" } } : { ok: true, value: { plannedMeal: { plannedMealId: "p", items: [] }, replayed: true } }; }, convert: async () => { throw new Error("unused"); } }
  });
  const context = { actorKey: "actor-a", actorGeneration: 1, timezone: "Asia/Taipei" }; await runtime.setActor(context.actorKey, context.actorGeneration);
  const uncertain = await runtime.submitCreate(context, { ...createInput, createRequestId: undefined, plannedTimezone: undefined });
  expect(uncertain.status === "uncertain", "transport ambiguity retains pending operation");
  const retried = await runtime.retry(context); expect(retried.status === "succeeded" && seen[0] === seen[1], "retry reuses exact input key and time");
  expect(clockReads === 1, "retry never rereads operation clock");
  const restoreStorage = new authStorage.MemoryConsumerAuthStorage(); const restoreStore = new storeModule.ConsumerPlannedMealOperationStore(restoreStorage, () => new Date("2026-07-20T02:00:00.000Z"));
  await restoreStore.save("restore-actor", storeModule.createPendingPlannedMealOperation("create", createInput, new Date("2026-07-20T02:00:00.000Z")));
  let restoreCalls = 0;
  const restoreRuntime = new runtimeModule.ConsumerPlannedMealRuntime({ operationStore: restoreStore, service: { create: async () => { restoreCalls += 1; throw new Error("restore must not call"); }, convert: async () => { restoreCalls += 1; throw new Error("restore must not call"); } } });
  await restoreRuntime.setActor("restore-actor", 2); expect(restoreRuntime.getState().status === "uncertain" && restoreCalls === 0, "pending restore is read-only and never auto-submits");
  const expiredStore = new storeModule.ConsumerPlannedMealOperationStore(restoreStorage, () => new Date("2026-07-21T02:00:00.001Z"));
  expect(await expiredStore.load("restore-actor", "create") === null && restoreCalls === 0, "24-hour expiry removes pending without submission");

  const tapDeferred = deferred(); let tapCalls = 0;
  const tapRuntime = new runtimeModule.ConsumerPlannedMealRuntime({ operationStore: new storeModule.ConsumerPlannedMealOperationStore(new authStorage.MemoryConsumerAuthStorage()), uuidFactory: () => "40000000-0000-4000-8000-00000000b302", service: { create: async () => { tapCalls += 1; await tapDeferred.promise; return { ok: true, value: { plannedMeal: { plannedMealId: "tap-plan", items: [] }, replayed: false } }; }, convert: async () => { throw new Error("unused"); } } });
  await tapRuntime.setActor(context.actorKey, context.actorGeneration); const tapOne = tapRuntime.submitCreate(context, createInput); const tapTwo = tapRuntime.submitCreate(context, createInput); tapDeferred.resolve(); await Promise.all([tapOne, tapTwo]);
  expect(tapCalls === 1, "repeated taps share one in-flight operation");

  const staleDeferred = deferred();
  const staleStore = new storeModule.ConsumerPlannedMealOperationStore(new authStorage.MemoryConsumerAuthStorage());
  const staleRuntime = new runtimeModule.ConsumerPlannedMealRuntime({ operationStore: staleStore, uuidFactory: () => "40000000-0000-4000-8000-00000000b303", service: { create: async () => { await staleDeferred.promise; return { ok: true, value: { plannedMeal: { plannedMealId: "stale-plan", items: [] }, replayed: false } }; }, convert: async () => { throw new Error("unused"); } } });
  await staleRuntime.setActor(context.actorKey, context.actorGeneration); const stalePromise = staleRuntime.submitCreate(context, createInput); await staleRuntime.setActor("actor-b", 2); staleDeferred.resolve(); await stalePromise;
  expect(staleRuntime.getState().status !== "succeeded" && await staleStore.load(context.actorKey, "create") === null, "actor change clears pending and suppresses stale response");
  expect(!/process\.env|fetch\s*\(|service[_-]?role/i.test(fs.readFileSync(new URL(import.meta.url), "utf8")), "smoke has no remote or credential access");
  for (const name of checks) console.log(`PASS ${name}`); console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} catch (error) { console.error(error instanceof Error ? error.stack : error); console.error(`RESULT ${checks.length}/${checks.length + 1} FAIL`); process.exitCode = 1; }
