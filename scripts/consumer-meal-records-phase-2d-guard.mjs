import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const migrationsDir = path.join(root, "supabase", "migrations");
const issues = [];
const checks = [];

const atomicMigrationName = "20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql";
const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedMealQueryFiles = new Set(["apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts"]);
const approvedMealRpcFiles = new Set(["apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts"]);

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  issues.push({ name, message, ...extra });
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, predicate));
    if (entry.isFile() && predicate(full)) files.push(full);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

const sourceFiles = [
  ...walk(authRoot, (file) => file.endsWith(".ts")),
  ...walk(mealRoot, (file) => file.endsWith(".ts"))
];
const sourceText = sourceFiles.map((file) => ({ file, rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const mealSourceText = sourceText.filter((item) => item.rel.includes("apps/mobile/features/consumer-meals/"));

const sdkImportMatches = sourceText.filter((item) => /@supabase\/supabase-js|react-native-url-polyfill/.test(item.text)).map((item) => item.rel);
const unapprovedSdkImports = sdkImportMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedSdkImports.length) fail("SDK imports limited to official lazy loader", "Supabase SDK/polyfill imports may only appear in supabaseSdkLoader.ts.", { matches: unapprovedSdkImports });
else pass("SDK imports limited to official lazy loader", { matches: sdkImportMatches });

const forbiddenMealPatterns = [
  [/\bfetch\s*\(/, "Consumer meal source must not add direct fetch calls."],
  [/\bXMLHttpRequest\b/, "Consumer meal source must not add direct XMLHttpRequest calls."],
  [/WebSocket\s*\(/, "Consumer meal source must not add explicit realtime sockets."],
  [/service[_-]?role/i, "Privileged service credentials must not appear in Mobile Consumer source."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in Mobile Consumer source."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in Mobile Consumer source."],
  [/\.(insert|upsert|update|delete)\s*\(/, "Consumer meal source must not add direct writes."],
  [/storage\.from\s*\(/, "Consumer meal source must not add Supabase Storage calls."],
  [/\b(userId|ownerId|profileId|externalUserId)\s*[:?]\s*string\b/, "Meal write API must not accept arbitrary user identity input."],
  [/select\s*\(\s*["']\*["']\s*\)/, "Consumer meal reads must use explicit column allowlists."]
];
for (const [pattern, message] of forbiddenMealPatterns) {
  const matches = mealSourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden meal source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden meal source pattern absent: ${pattern}`);
}

const mealDatabaseQueryMatches = mealSourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealQueries = mealDatabaseQueryMatches.filter((file) => !approvedMealQueryFiles.has(file));
if (unapprovedMealQueries.length) fail("database query calls limited to meal read adapter", "Consumer meal database queries may only appear in the approved read adapter.", { matches: unapprovedMealQueries });
else pass("database query calls limited to meal read adapter", { matches: mealDatabaseQueryMatches });

const mealRpcMatches = mealSourceText.filter((item) => /\.\s*rpc\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealRpc = mealRpcMatches.filter((file) => !approvedMealRpcFiles.has(file));
if (unapprovedMealRpc.length) fail("RPC calls limited to atomic meal write adapter", "Consumer meal RPC calls may only appear in the approved Phase 2D write adapter.", { matches: unapprovedMealRpc });
else pass("RPC calls limited to atomic meal write adapter", { matches: mealRpcMatches });

const atomicMigrationPath = path.join(migrationsDir, atomicMigrationName);
if (!fs.existsSync(atomicMigrationPath)) {
  fail("atomic migration exists", "Missing Phase 2D atomic meal write migration.");
} else {
  const sql = fs.readFileSync(atomicMigrationPath, "utf8");
  const clean = sql.replace(/--.*$/gm, "").toLowerCase();
  if (/create\s+or\s+replace\s+function\s+public\.create_current_user_meal_record/.test(clean)) pass("atomic function exists");
  else fail("atomic function exists", "Migration must create create_current_user_meal_record.");
  if (/security\s+definer/.test(clean) && /set\s+search_path\s*=\s*public\s*,\s*pg_temp/.test(clean)) pass("atomic function has security definer and safe search path");
  else fail("atomic function has security definer and safe search path", "Atomic function security configuration is incomplete.");
  if (/auth\.uid\(\)/.test(clean) && !/\bp_user_id\b|\bp_owner_id\b|\bp_profile_id\b/.test(clean)) pass("atomic function uses auth.uid and accepts no owner parameter");
  else fail("atomic function uses auth.uid and accepts no owner parameter", "Atomic function must derive ownership from auth.uid().");
  if (/revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*;/.test(clean) && /revoke\s+all\s+on\s+function[\s\S]*from\s+anon\s*;/.test(clean) && /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated\s*;/.test(clean)) pass("function execute privileges are bounded");
  else fail("function execute privileges are bounded", "Function must revoke public/anon execute and grant authenticated execute.");
  if (!/\bexecute\s*\(/.test(clean) && !/\bformat\s*\(/.test(clean)) pass("function has no dynamic SQL");
  else fail("function has no dynamic SQL", "Atomic function must not use dynamic SQL.");
  if (/insert\s+into\s+public\.meal_records/.test(clean) && /insert\s+into\s+public\.meal_record_items/.test(clean)) pass("function inserts parent and items");
  else fail("function inserts parent and items", "Atomic function must insert both parent and item rows.");
  if (/revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.meal_records\s+from\s+authenticated/.test(clean) && /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.meal_record_items\s+from\s+authenticated/.test(clean)) pass("direct table write grants remain revoked");
  else fail("direct table write grants remain revoked", "Migration must not grant direct table writes.");
}

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-meals|@supabase\/supabase-js|react-native-url-polyfill/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (uiImports.length) fail("UI does not import Consumer Meals or SDK", "Mobile UI must not be wired to Consumer Meals in Phase 2D.", { matches: uiImports });
else pass("UI does not import Consumer Meals or SDK");

const navigationImports = walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .filter((file) => /consumer-meals|mealRecordsSource|MEAL_RECORDS_SOURCE|MEAL_RECORD_WRITES/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (navigationImports.length) fail("Navigation remains unchanged", "Phase 2D must not wire routes/navigation to Consumer Meals.", { matches: navigationImports });
else pass("Navigation remains unchanged");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2d-"));
for (const file of sourceFiles) {
  const rel = path.relative(path.join(root, "apps", "mobile", "features"), file).replaceAll(path.sep, "/");
  const target = path.join(tempRoot, rel).replace(/\.ts$/, ".js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let source = fs.readFileSync(file, "utf8");
  if (rel === "consumer-auth/index.ts") {
    source = source
      .replace('export * from "./supabaseSdkLoader";', "")
      .replace('export * from "./asyncStorageConsumerAuthStorage";', "")
      .replace('export * from "./reactNativeAppStateSource";', "");
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, strict: true },
    fileName: file
  }).outputText;
  fs.writeFileSync(target, output, "utf8");
}
const analysisStub = path.join(tempRoot, "analysis", "analysisMealRecordStore.js");
fs.mkdirSync(path.dirname(analysisStub), { recursive: true });
fs.writeFileSync(analysisStub, "exports.getMealRecords = () => [];\n", "utf8");

let networkCalls = 0;
const previousFetch = globalThis.fetch;
globalThis.fetch = () => {
  networkCalls += 1;
  throw new Error("Phase 2D guard trapped fetch.");
};

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const errors = requireFromTemp("../consumer-auth/errors.js");
const flagsModule = requireFromTemp("./featureFlags.js");
const repoModule = requireFromTemp("./adapters/supabaseConsumerMealRecordWriteRepository.js");
const serviceModule = requireFromTemp("./consumerMealRecordWriteService.js");
const contracts = requireFromTemp("./supabaseMealContracts.js");

const currentUserId = "00000000-0000-4000-8000-000000002d00";
const validSession = {
  user: { userId: currentUserId, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "2026-07-13T00:00:00.000Z" },
  provider: "supabase",
  issuedAt: "2026-07-13T00:01:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z"
};
const validInput = {
  mealType: "lunch",
  occurredAt: "2026-07-13T04:00:00.000Z",
  mealDate: "2026-07-13",
  timezone: "Asia/Taipei",
  title: "Phase 2D smoke meal",
  source: "manual",
  items: [
    {
      displayName: "Phase 2D item",
      portion: "1 serving",
      nutrition: { calories: 500, protein: 30, carbohydrates: 55, fat: 12, fiber: 5 },
      nutritionSource: "manual",
      confidenceScore: 0.95,
      consumedRatio: 1
    }
  ]
};
const rpcRow = {
  id: "meal-written",
  user_id: currentUserId,
  meal_type: "lunch",
  occurred_at: "2026-07-13T04:00:00.000Z",
  meal_date: "2026-07-13",
  timezone: "Asia/Taipei",
  title: "Phase 2D smoke meal",
  note: null,
  source: "manual",
  created_at: "2026-07-13T04:01:00.000Z",
  updated_at: "2026-07-13T04:01:00.000Z",
  meal_record_items: [
    {
      id: "item-written",
      meal_record_id: "meal-written",
      user_id: currentUserId,
      display_name_snapshot: "Phase 2D item",
      nutrition_snapshot: { calories: 500, protein: 30, carbohydrates: 55, fat: 12, fiber: 5 },
      nutrition_source: "manual",
      nutrition_schema_version: "consumer-nutrition-snapshot-v1",
      occurred_at: "2026-07-13T04:00:00.000Z",
      timezone: "Asia/Taipei",
      consumed_ratio: 1,
      correction_status: "none",
      created_at: "2026-07-13T04:01:00.000Z",
      updated_at: "2026-07-13T04:01:00.000Z"
    }
  ]
};

function authPortFor(resultFactory) {
  return {
    source: "supabase-live",
    getCurrentSession: async () => resultFactory(),
    observeAuthState: () => () => undefined,
    signIn: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    signUp: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    signOut: async () => auth.ok(undefined),
    refreshSession: async () => resultFactory(),
    sendPasswordReset: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    restoreSession: async () => resultFactory()
  };
}

function mealClientFor(response, calls) {
  return {
    from: () => {
      throw new Error("write guard must not call from()");
    },
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return response;
    }
  };
}

async function fakeMealWriteTests() {
  const defaults = flagsModule.getConsumerMealRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.mealRecordsSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.mealRecordWritesEnabled || defaults.mealRecordLiveWriteOptIn || defaults.issues.length) {
    throw new Error("default flags should remain fully disabled");
  }
  const liveWriteFlags = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN: "true"
  });
  if (liveWriteFlags.issues.length) throw new Error("Phase 2D live write flags should be accepted in development");
  const missingOptIn = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "true"
  });
  if (!missingOptIn.issues.some((issue) => issue.includes("LIVE_WRITE_OPT_IN"))) throw new Error("live writes must require explicit opt-in");
  const production = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "production",
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN: "true"
  });
  if (!production.issues.some((issue) => issue.includes("development-only"))) throw new Error("production live writes must fail closed");

  const calls = [];
  const repository = new repoModule.SupabaseConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: rpcRow, error: null, status: 200 }, calls),
    writeEnabled: true
  });
  const result = await repository.createCurrentUserMealRecord(validInput);
  if (!result.ok || result.value.mealRecordId !== "meal-written" || result.value.items.length !== 1) throw new Error("atomic RPC write did not map canonical result");
  if (calls.length !== 1 || calls[0].fn !== contracts.SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION) throw new Error("write repository did not call the approved function");
  if ("userId" in calls[0].args || "profileId" in calls[0].args || calls[0].args.p_items.some((item) => "userId" in item || "mealRecordId" in item)) {
    throw new Error("RPC payload leaked ownership or server-managed fields");
  }

  const service = new serviceModule.ConsumerMealRecordWriteService({ repository });
  const delegated = await service.createCurrentUserMealRecord(validInput);
  if (!delegated.ok) throw new Error("write service did not delegate to repository");

  const disabled = await new repoModule.SupabaseConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: rpcRow, error: null, status: 200 }, []),
    writeEnabled: false
  }).createCurrentUserMealRecord(validInput);
  if (disabled.ok || disabled.error.code !== "meal_write_phase_not_enabled") throw new Error("missing write enablement must fail closed");

  const missingSession = await new repoModule.SupabaseConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(null)),
    mealClient: mealClientFor({ data: rpcRow, error: null, status: 200 }, []),
    writeEnabled: true
  }).createCurrentUserMealRecord(validInput);
  if (missingSession.ok || missingSession.error.code !== "meal_write_authentication_required") throw new Error("missing session must fail closed");

  const rejected = await new repoModule.SupabaseConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: null, error: { code: "22023", message: "INVALID_DISPLAY_NAME", status: 400 }, status: 400 }, []),
    writeEnabled: true
  }).createCurrentUserMealRecord(validInput);
  if (rejected.ok || rejected.error.code !== "meal_write_function_rejected") throw new Error("function rejection must map to typed error");

  const malformed = await new repoModule.SupabaseConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: { ...rpcRow, user_id: "other-user" }, error: null, status: 200 }, []),
    writeEnabled: true
  }).createCurrentUserMealRecord(validInput);
  if (malformed.ok || malformed.error.code !== "meal_write_mapping_failed") throw new Error("malformed response must fail closed");
}

try {
  await fakeMealWriteTests();
  pass("fake atomic meal write contract tests");
} catch (error) {
  fail("fake atomic meal write contract tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 2D guard.", { networkCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2D",
  reason: issues.length ? "Phase 2D guard failed" : "Atomic meal record write architecture verified with fake RPC transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  checks,
  issues,
  databaseWriteUsed: false,
  directInsertUsed: false,
  sequentialWriteUsed: false,
  rpcUsed: true,
  credentialsPrinted: false,
  rawRowsPrinted: false,
  sqlExecuted: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
