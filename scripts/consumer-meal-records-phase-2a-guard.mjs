import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const issues = [];
const checks = [];

const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedMealQueryFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts"
]);
const approvedMealRpcFiles = new Set(["apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts"]);
const expectedMigrationFiles = [
  "20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql",
  "20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql",
  "20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql",
  "20260712130400_consumer_schema_phase_1_3_meal_records.sql",
  "20260712130500_consumer_schema_phase_1_3_meal_analysis_and_corrections.sql",
  "20260712130600_consumer_schema_phase_1_3_meal_consumption_and_sharing.sql",
  "20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql",
  "20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql",
  "20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql",
  "20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql",
  "20260712131100_consumer_schema_phase_1_3_consumer_audit_and_legacy_mapping.sql",
  "20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql",
  "20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql",
  "20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql",
  "20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql",
  "20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql",
  "20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql"
];
const requiredMealFiles = [
  "types.ts",
  "featureFlags.ts",
  "readRange.ts",
  "supabaseMealContracts.ts",
  "supabaseMealMappers.ts",
  "mockMealMappers.ts",
  "consumerMealRecordsService.ts",
  "factories.ts",
  "index.ts",
  path.join("adapters", "mockConsumerMealRecordsRepository.ts"),
  path.join("adapters", "supabaseDisabledConsumerMealRecordsRepository.ts"),
  path.join("adapters", "supabaseConsumerMealRecordsRepository.ts")
];

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

for (const file of requiredMealFiles) {
  const full = path.join(mealRoot, file);
  if (fs.existsSync(full)) pass(`Phase 2A file exists: ${file}`);
  else fail(`Phase 2A file exists: ${file}`, "Missing Consumer Phase 2A meal read architecture file.");
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

const createClientMatches = sourceText.filter((item) => /\bcreateClient\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedCreateClient = createClientMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedCreateClient.length) fail("createClient limited to official lazy loader", "createClient may only appear in supabaseSdkLoader.ts.", { matches: unapprovedCreateClient });
else pass("createClient limited to official lazy loader", { matches: createClientMatches });

const forbiddenSourcePatterns = [
  [/\bfetch\s*\(/, "Consumer Phase 2A source must not add direct fetch calls."],
  [/\bXMLHttpRequest\b/, "Consumer Phase 2A source must not add direct XMLHttpRequest calls."],
  [/WebSocket\s*\(/, "Consumer Phase 2A must not add explicit realtime sockets."],
  [/service[_-]?role/i, "Privileged service credentials must not appear in Mobile Consumer source."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in Mobile Consumer source."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in Mobile Consumer source."],
  [/\.(insert|upsert|update|delete)\s*\(/, "Consumer Phase 2A must not add direct writes."],
  [/storage\.from\s*\(/, "Consumer Phase 2A must not add Supabase Storage calls."],
  [/\b(userId|ownerId|profileId|externalUserId)\s*[:?]\s*string\b/, "Meal read API must not accept arbitrary user identity input."]
];

for (const [pattern, message] of forbiddenSourcePatterns) {
  const matches = mealSourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden meal source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden meal source pattern absent: ${pattern}`);
}

const selectStarMatches = mealSourceText.filter((item) => /select\s*\(\s*["']\*["']\s*\)/.test(item.text)).map((item) => item.rel);
if (selectStarMatches.length) fail("no select star in meal read source", "Consumer meal reads must use explicit column allowlists.", { matches: selectStarMatches });
else pass("no select star in meal read source");

const mealDatabaseQueryMatches = mealSourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealQueries = mealDatabaseQueryMatches.filter((file) => !approvedMealQueryFiles.has(file));
if (unapprovedMealQueries.length) fail("database query calls limited to meal read adapter", "Consumer meal database queries may only appear in the approved Phase 2A adapter.", { matches: unapprovedMealQueries });
else pass("database query calls limited to meal read adapter", { matches: mealDatabaseQueryMatches });

const mealRpcMatches = mealSourceText.filter((item) => /\.\s*rpc\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealRpc = mealRpcMatches.filter((file) => !approvedMealRpcFiles.has(file));
if (unapprovedMealRpc.length) fail("RPC calls limited to atomic meal write adapter", "Consumer meal RPC calls may only appear in the approved Phase 2D write adapter.", { matches: unapprovedMealRpc });
else pass("RPC calls limited to atomic meal write adapter", { matches: mealRpcMatches });

const serviceQueryMatches = mealSourceText
  .filter((item) => item.rel.endsWith("consumerMealRecordsService.ts") && /\.(from|select|eq|gte|lte|order|limit)\s*\(/.test(item.text))
  .map((item) => item.rel);
if (serviceQueryMatches.length) fail("service layer does not construct Supabase queries", "Meal service must delegate to repository contracts.", { matches: serviceQueryMatches });
else pass("service layer does not construct Supabase queries");

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-meals|@supabase\/supabase-js|react-native-url-polyfill/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (uiImports.length) fail("UI does not import Consumer Meals or SDK", "Mobile UI must not be wired to Consumer Meals in Phase 2A.", { matches: uiImports });
else pass("UI does not import Consumer Meals or SDK");

const navigationFiles = walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"));
const navigationImports = navigationFiles.filter((file) => /consumer-meals|mealRecordsSource|MEAL_RECORDS_SOURCE/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (navigationImports.length) fail("Navigation remains unchanged", "Phase 2A must not wire routes/navigation to Consumer Meals.", { matches: navigationImports });
else pass("Navigation remains unchanged");

const crossSurfaceFiles = [
  ...walk(path.join(root, "apps", "restaurant-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "admin-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const crossSurfaceImports = crossSurfaceFiles.filter((file) => /consumer-meals/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (crossSurfaceImports.length) fail("Restaurant/Admin do not import Mobile Consumer Meals", "Cross-surface Consumer Meals imports are not allowed.", { matches: crossSurfaceImports });
else pass("Restaurant/Admin do not import Mobile Consumer Meals");

const migrationFiles = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("Phase 2A/2B migration inventory is explicitly allowlisted", { count: migrationFiles.length });
else fail("Phase 2A/2B migration inventory is explicitly allowlisted", "Consumer Runtime Phase 2A plus Phase 2B may only include the frozen schema package and the approved forward-only grants.", { migrationFiles, expectedMigrationFiles });

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2a-"));
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

let networkCalls = 0;
let websocketCalls = 0;
const previousFetch = globalThis.fetch;
const previousWebSocket = globalThis.WebSocket;
globalThis.fetch = () => {
  networkCalls += 1;
  throw new Error("Phase 2A guard trapped fetch.");
};
globalThis.WebSocket = class {
  constructor() {
    websocketCalls += 1;
    throw new Error("Phase 2A guard trapped WebSocket.");
  }
};

Module._initPaths();
const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const errors = requireFromTemp("../consumer-auth/errors.js");
const flagsModule = requireFromTemp("./featureFlags.js");
const rangeModule = requireFromTemp("./readRange.js");
const mockMapper = requireFromTemp("./mockMealMappers.js");
const mapper = requireFromTemp("./supabaseMealMappers.js");
const liveRepoModule = requireFromTemp("./adapters/supabaseConsumerMealRecordsRepository.js");
const disabledRepoModule = requireFromTemp("./adapters/supabaseDisabledConsumerMealRecordsRepository.js");
const serviceModule = requireFromTemp("./consumerMealRecordsService.js");

const currentUserId = "00000000-0000-4000-8000-000000002a00";
const validSession = {
  user: {
    userId: currentUserId,
    provider: "supabase",
    isAnonymous: false,
    emailVerified: true,
    createdAt: "2026-07-13T00:00:00.000Z"
  },
  provider: "supabase",
  issuedAt: "2026-07-13T00:01:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z"
};

const validMealRow = {
  id: "meal-1",
  user_id: currentUserId,
  meal_type: "lunch",
  occurred_at: "2026-07-13T04:00:00.000Z",
  meal_date: "2026-07-13",
  timezone: "Asia/Taipei",
  title: "Lunch",
  note: null,
  source: "manual",
  created_at: "2026-07-13T04:00:00.000Z",
  updated_at: "2026-07-13T04:10:00.000Z",
  meal_record_items: [
    {
      id: "item-1",
      meal_record_id: "meal-1",
      user_id: currentUserId,
      restaurant_id: null,
      branch_id: null,
      menu_id: null,
      menu_item_id: null,
      display_name_snapshot: "Chicken rice",
      portion_snapshot: "1 bowl",
      nutrition_snapshot: { calories: "620", protein: 32, carbs: 70, fat: 18 },
      nutrition_source: "manual",
      nutrition_schema_version: "consumer-nutrition-snapshot-v1",
      occurred_at: "2026-07-13T04:00:00.000Z",
      timezone: "Asia/Taipei",
      confidence_score: "0.9",
      consumed_ratio: "1",
      correction_status: "none",
      created_at: "2026-07-13T04:00:00.000Z",
      updated_at: "2026-07-13T04:10:00.000Z"
    }
  ]
};

function authPortFor(resultFactory) {
  return {
    source: "supabase-live",
    getCurrentSession: async () => resultFactory(),
    observeAuthState: () => () => {},
    signIn: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    signUp: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    signOut: async () => auth.ok(undefined),
    refreshSession: async () => resultFactory(),
    sendPasswordReset: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    restoreSession: async () => resultFactory()
  };
}

function mealClientFor(response, calls) {
  const builder = {
    select: (columns) => {
      calls.push({ op: "select", columns });
      return builder;
    },
    eq: (column, value) => {
      calls.push({ op: "eq", column, value });
      return builder;
    },
    is: (column, value) => {
      calls.push({ op: "is", column, value });
      return builder;
    },
    gte: (column, value) => {
      calls.push({ op: "gte", column, value });
      return builder;
    },
    lte: (column, value) => {
      calls.push({ op: "lte", column, value });
      return builder;
    },
    order: (column, options) => {
      calls.push({ op: "order", column, options });
      return builder;
    },
    limit: async (count) => {
      calls.push({ op: "limit", count });
      return response;
    }
  };
  return {
    from: (table) => {
      calls.push({ op: "from", table });
      return builder;
    }
  };
}

function expectIssue(flags, messagePart) {
  if (!flags.issues.some((issue) => issue.includes(messagePart))) throw new Error(`expected flag issue containing: ${messagePart}`);
}

async function fakeMealReadTests() {
  const defaults = flagsModule.getConsumerMealRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.mealRecordsSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.issues.length) {
    throw new Error("default meal flags should remain mock/disabled");
  }
  const liveFlags = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
  });
  if (liveFlags.issues.length) throw new Error("valid live meal flags should be accepted");
  expectIssue(flagsModule.getConsumerMealRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "unknown" }), "Unknown");
  expectIssue(flagsModule.getConsumerMealRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live" }), "AUTH_SOURCE=supabase-live");
  expectIssue(flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true"
  }), "writes");

  const range = rangeModule.resolveMealReadRange({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 10 });
  if (range.startDate !== "2026-07-01" || range.endDate !== "2026-07-13" || range.limit !== 10) throw new Error("meal read range did not preserve input");
  for (const badInput of [
    { startDate: "2026/07/01", endDate: "2026-07-13" },
    { startDate: "2026-07-14", endDate: "2026-07-13" },
    { startDate: "2026-07-01", endDate: "2026-07-13", limit: 0 }
  ]) {
    try {
      rangeModule.resolveMealReadRange(badInput);
      throw new Error("invalid range should fail");
    } catch (error) {
      if (error.code !== "meal_read_invalid_range") throw error;
    }
  }

  const mappedMock = mockMapper.mapSavedMealRecordToConsumerMealRecord({
    mealId: "mock-meal-1",
    restaurantName: "Demo",
    mealName: "Demo meal",
    calories: 500,
    protein: 20,
    carbohydrates: 60,
    fat: 12,
    ingredients: "rice",
    portion: "1 bowl",
    mealPeriod: "lunch",
    date: "2026/07/13",
    source: "manual"
  });
  if (mappedMock.mealDate !== "2026-07-13" || mappedMock.items.length !== 1 || mappedMock.items[0].nutrition.calories !== 500) {
    throw new Error("mock meal mapping failed");
  }

  const mappedLive = mapper.mapSupabaseMealRecordRowToConsumerMealRecord(validMealRow, currentUserId);
  if (mappedLive.mealRecordId !== "meal-1" || mappedLive.items[0].nutrition.calories !== 620 || mappedLive.items[0].confidenceScore !== 0.9) {
    throw new Error("live meal row mapping failed");
  }
  for (const badRow of [
    { ...validMealRow, user_id: "other-user" },
    { ...validMealRow, meal_type: "bad" },
    { ...validMealRow, meal_record_items: [{ ...validMealRow.meal_record_items[0], user_id: "other-user" }] },
    { ...validMealRow, meal_record_items: [{ ...validMealRow.meal_record_items[0], nutrition_snapshot: { calories: "nope" } }] }
  ]) {
    try {
      mapper.mapSupabaseMealRecordRowToConsumerMealRecord(badRow, currentUserId);
      throw new Error("bad row should fail mapping");
    } catch (error) {
      if (!["meal_record_mapping_failed", "meal_item_mapping_failed"].includes(error.code)) throw error;
    }
  }

  const calls = [];
  const repository = new liveRepoModule.SupabaseConsumerMealRecordsRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: [validMealRow], error: null, status: 200 }, calls),
    readEnabled: true
  });
  const result = await repository.listCurrentUserMealRecords({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 5 });
  if (!result.ok || result.value.length !== 1) throw new Error("live meal repository read failed");
  const fromCall = calls.find((call) => call.op === "from");
  const selectCall = calls.find((call) => call.op === "select");
  const eqCall = calls.find((call) => call.op === "eq");
  const isCall = calls.find((call) => call.op === "is");
  const limitCall = calls.find((call) => call.op === "limit");
  if (fromCall?.table !== "meal_records" || selectCall?.columns.includes("*") || eqCall?.column !== "user_id" || eqCall?.value !== currentUserId || isCall?.column !== "deleted_at" || limitCall?.count !== 5) {
    throw new Error("live meal query did not use bounded current-user allowlist");
  }

  const emptyResult = await new liveRepoModule.SupabaseConsumerMealRecordsRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: [], error: null, status: 200 }, []),
    readEnabled: true
  }).listCurrentUserMealRecords({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 5 });
  if (!emptyResult.ok || emptyResult.value.length !== 0) throw new Error("empty live meal result should map to empty list");

  const missingSession = await new liveRepoModule.SupabaseConsumerMealRecordsRepository({
    authPort: authPortFor(() => auth.ok(null)),
    mealClient: mealClientFor({ data: [], error: null, status: 200 }, []),
    readEnabled: true
  }).listCurrentUserMealRecords({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 5 });
  if (missingSession.ok || missingSession.error.code !== "meal_session_missing") throw new Error("missing session should fail closed");

  const transport = await new liveRepoModule.SupabaseConsumerMealRecordsRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: null, error: { status: 500, message: "network unavailable" }, status: 500 }, []),
    readEnabled: true
  }).listCurrentUserMealRecords({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 5 });
  if (transport.ok || transport.error.code !== "meal_transport_failed") throw new Error("transport error should fail closed");

  const disabled = await new disabledRepoModule.SupabaseDisabledConsumerMealRecordsRepository().listCurrentUserMealRecords();
  if (disabled.ok || disabled.error.code !== "meal_source_unavailable") throw new Error("disabled meal source should fail closed");

  const factoryRepo = new liveRepoModule.SupabaseConsumerMealRecordsRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: [], error: null, status: 200 }, []),
    readEnabled: true
  });
  const service = new serviceModule.ConsumerMealRecordsService({ repository: factoryRepo });
  const serviceResult = await service.listCurrentUserMealRecords({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 5 });
  if (!serviceResult.ok) throw new Error("meal service did not delegate to repository");
}

try {
  await fakeMealReadTests();
  pass("fake meal read contract tests");
} catch (error) {
  fail("fake meal read contract tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
  globalThis.WebSocket = previousWebSocket;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 2A guard.", { networkCalls });
if (websocketCalls === 0) pass("guard opened no realtime socket");
else fail("guard opened no realtime socket", "WebSocket was constructed during Phase 2A guard.", { websocketCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2A",
  reason: issues.length ? "Phase 2A guard failed" : "Meal records read architecture and development live preparation verified with fake transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  approvedSdkImportFiles: [...approvedSdkImportFiles],
  approvedMealQueryFiles: [...approvedMealQueryFiles],
  checks,
  issues,
  liveMealSmokeExecuted: false,
  liveMealSmokeResult: "SKIPPED - Consumer Runtime Phase 2B has not started.",
  realSupabaseClientCreated: false,
  liveNetworkRequestUsed: false,
  databaseWriteUsed: false,
  rpcUsed: false,
  credentialsPrinted: false,
  rawRowsPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false,
  fixtureCreated: false,
  phase2bStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
