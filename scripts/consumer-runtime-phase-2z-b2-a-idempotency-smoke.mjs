#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const moduleCache = new Map();

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push(name);
}

function loadTsModule(file) {
  const absolute = path.resolve(root, file);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolute, module);
  const localRequire = (request) => {
    if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.js$/, "");
    const resolved = fs.existsSync(base) && fs.statSync(base).isDirectory() ? path.join(base, "index.ts") : `${base}.ts`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(localRequire, module, module.exports);
  return module.exports;
}

const authTypes = loadTsModule("apps/mobile/features/consumer-auth/types.ts");
const errors = loadTsModule("apps/mobile/features/consumer-auth/errors.ts");
const validation = loadTsModule("apps/mobile/features/consumer-meals/writeValidation.ts");
const dateTime = loadTsModule("apps/mobile/features/consumer-meals/mealDateTime.ts");
const mockModule = loadTsModule("apps/mobile/features/consumer-meals/adapters/mockConsumerMealRecordWriteRepository.ts");
const supabaseModule = loadTsModule("apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts");

const actorA = "00000000-0000-4000-8000-00000000b2a1";
const actorB = "00000000-0000-4000-8000-00000000b2a2";
let actor = actorA;
const session = () => ({
  user: { userId: actor, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "2026-07-20T00:00:00.000Z" },
  provider: "supabase",
  issuedAt: "2026-07-20T00:00:00.000Z"
});
const authPort = {
  source: "supabase-live",
  getCurrentSession: async () => authTypes.ok(session()),
  observeAuthState: () => () => undefined,
  signIn: async () => authTypes.err(new errors.ConsumerAuthOperationNotEnabledError()),
  signUp: async () => authTypes.err(new errors.ConsumerAuthOperationNotEnabledError()),
  signOut: async () => authTypes.ok(undefined),
  refreshSession: async () => authTypes.ok(session()),
  sendPasswordReset: async () => authTypes.err(new errors.ConsumerAuthOperationNotEnabledError()),
  restoreSession: async () => authTypes.ok(session())
};
const key = "10000000-0000-4000-8000-000000000001";
const input = {
  mealType: "lunch",
  occurredAt: "2026-07-19T16:30:00.000Z",
  mealDate: "2026-07-20",
  timezone: "Asia/Taipei",
  title: "B2-A lunch",
  source: "manual",
  items: [
    { displayName: "Rice", nutrition: { calories: 200 }, consumedRatio: 1 },
    { displayName: "Egg", nutrition: { protein: 7 }, consumedRatio: 1 }
  ]
};

try {
  expect(dateTime.toDateKeyInTimeZone(new Date(input.occurredAt), input.timezone) === input.mealDate, "timezone helper handles UTC/local cross-day");
  expect(validation.validateCreateMealRecordInput(input).mealDate === input.mealDate, "validator accepts timezone-local date");
  expect(validation.validateCreateMealRecordInput({ ...input, occurredAt: "2026-07-20T04:00:00.000Z", timezone: "UTC" }).mealDate === input.mealDate, "validator preserves same-date UTC input");
  let invalidTimezone = false;
  try { validation.validateCreateMealRecordInput({ ...input, timezone: "Invalid/Timezone" }); } catch (error) { invalidTimezone = error.code === "meal_write_invalid_date"; }
  expect(invalidTimezone, "validator rejects invalid timezone");
  let invalidInstant = false;
  try { validation.validateCreateMealRecordInput({ ...input, occurredAt: "not-an-instant" }); } catch (error) { invalidInstant = error.code === "meal_write_invalid_date"; }
  expect(invalidInstant, "validator rejects invalid occurredAt");
  let invalidKey = false;
  try { validation.validateCreateMealRecordInput({ ...input, idempotencyKey: "not-a-uuid" }); } catch (error) { invalidKey = error.code === "meal_write_invalid_input"; }
  expect(invalidKey, "validator requires UUID v4 idempotency key");

  const repo = new mockModule.MockConsumerMealRecordWriteRepository({ authPort, now: () => "2026-07-20T01:00:00.000Z" });
  const noKey = await repo.createCurrentUserMealRecord(input);
  expect(noKey.ok && repo.listCreatedMealRecordsForTest().length === 1, "historical no-key mock create remains available");
  const first = await repo.createCurrentUserMealRecord({ ...input, idempotencyKey: key });
  expect(first.ok && repo.listCreatedMealRecordsForTest().length === 2, "first keyed create stores one record");
  const replay = await repo.createCurrentUserMealRecord({ ...input, idempotencyKey: key });
  expect(replay.ok && first.ok && replay.value.mealRecordId === first.value.mealRecordId && repo.listCreatedMealRecordsForTest().length === 2, "same actor key and payload replays canonical record");
  const conflict = await repo.createCurrentUserMealRecord({ ...input, idempotencyKey: key, title: "different" });
  expect(!conflict.ok && conflict.error.code === "meal_write_function_rejected" && repo.listCreatedMealRecordsForTest().length === 2, "same actor key with different payload conflicts without mutation");
  const itemConflict = await repo.createCurrentUserMealRecord({ ...input, idempotencyKey: key, items: [...input.items].reverse() });
  expect(!itemConflict.ok && repo.listCreatedMealRecordsForTest().length === 2, "ordered item fingerprint detects order changes");
  const nutritionConflict = await repo.createCurrentUserMealRecord({ ...input, idempotencyKey: key, items: [{ ...input.items[0], nutrition: { calories: 201 } }, input.items[1]] });
  expect(!nutritionConflict.ok && repo.listCreatedMealRecordsForTest().length === 2, "item payload change conflicts without mutation");
  actor = actorB;
  const otherActor = await repo.createCurrentUserMealRecord({ ...input, idempotencyKey: key });
  expect(otherActor.ok && first.ok && otherActor.value.mealRecordId !== first.value.mealRecordId, "same key is independently scoped to another actor");
  expect(repo.listCreatedMealRecordsForTest().length === 3, "actor isolation creates no cross-actor replay");
  const beforeInvalid = repo.listCreatedMealRecordsForTest().length;
  const mappingFailure = await repo.createCurrentUserMealRecord({ ...input, items: [] });
  expect(!mappingFailure.ok && repo.listCreatedMealRecordsForTest().length === beforeInvalid, "mapping or validation failure creates no data");

  actor = actorA;
  const calls = [];
  const liveRepo = new supabaseModule.SupabaseConsumerMealRecordWriteRepository({
    authPort,
    writeEnabled: true,
    mealClient: { rpc: async (fn, args) => { calls.push({ fn, args }); return { data: null, error: null, status: 200 }; } }
  });
  await liveRepo.createCurrentUserMealRecord(input);
  await liveRepo.createCurrentUserMealRecord({ ...input, idempotencyKey: key });
  expect(calls[0].fn === "create_current_user_meal_record" && !("p_client_request_id" in calls[0].args), "Supabase no-key route preserves V1 contract");
  expect(calls[1].fn === "create_current_user_meal_record_v2" && calls[1].args.p_client_request_id === key, "Supabase keyed route uses V2 contract");
  expect(!("p_user_id" in calls[1].args) && !("p_fingerprint" in calls[1].args), "Supabase V2 sends neither actor nor fingerprint");

  const conflictRepo = new supabaseModule.SupabaseConsumerMealRecordWriteRepository({
    authPort,
    writeEnabled: true,
    mealClient: { rpc: async () => ({ data: null, error: { code: "23505", message: "IDEMPOTENCY_KEY_CONFLICT raw-detail" }, status: 409 }) }
  });
  const mappedConflict = await conflictRepo.createCurrentUserMealRecord({ ...input, idempotencyKey: key });
  expect(!mappedConflict.ok && mappedConflict.error.code === "meal_write_function_rejected" && !mappedConflict.error.message.includes("raw-detail"), "conflict maps to stable safe domain error");
  expect(!fs.readFileSync(new URL(import.meta.url), "utf8").match(/process\.env|fetch\s*\(|service[_-]?role/i), "smoke has no remote or credential access");

  for (const name of checks) console.log(`PASS ${name}`);
  console.log(`RESULT ${checks.length}/${checks.length} PASS`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(`RESULT ${checks.length}/${checks.length + 1} FAIL`);
  process.exitCode = 1;
}
