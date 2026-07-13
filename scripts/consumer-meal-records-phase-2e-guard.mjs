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

const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedMealQueryFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealsRepository.ts"
]);
const approvedMealRpcFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts"
]);
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
  "20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql",
  "20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql",
  "20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql",
  "20260713080100_consumer_schema_phase_1_3_authenticated_planned_meal_read_grant.sql"
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
  [/select\s*\(\s*["']\*["']\s*\)/, "Consumer meal reads must use explicit column allowlists."]
];
for (const [pattern, message] of forbiddenMealPatterns) {
  const matches = mealSourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden meal source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden meal source pattern absent: ${pattern}`);
}

const mealDatabaseQueryMatches = mealSourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealQueries = mealDatabaseQueryMatches.filter((file) => !approvedMealQueryFiles.has(file));
if (unapprovedMealQueries.length) fail("database query calls limited to approved read adapters", "Consumer meal database queries may only appear in approved read adapters.", { matches: unapprovedMealQueries });
else pass("database query calls limited to approved read adapters", { matches: mealDatabaseQueryMatches });

const mealRpcMatches = mealSourceText.filter((item) => /\.\s*rpc\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealRpc = mealRpcMatches.filter((file) => !approvedMealRpcFiles.has(file));
if (unapprovedMealRpc.length) fail("RPC calls limited to atomic meal write adapter", "Consumer meal RPC calls may only appear in the approved Phase 2D write adapter.", { matches: unapprovedMealRpc });
else pass("RPC calls limited to atomic meal write adapter", { matches: mealRpcMatches });

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged", { count: migrationFiles.length });
else fail("migration inventory allowlist includes completed Phase 2F grant", "Historical Phase 2E guard must allow the approved forward-only Phase 2F daily summary read grant.", { migrationFiles });

const summaryContract = fs.readFileSync(path.join(mealRoot, "supabaseMealContracts.ts"), "utf8");
if (/SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARIES_TABLE\s*=\s*"daily_nutrition_summaries"/.test(summaryContract) && /SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARY_SELECT_COLUMNS/.test(summaryContract)) pass("daily summary Supabase contract uses table and column allowlist");
else fail("daily summary Supabase contract uses table and column allowlist", "Summary read preparation must target daily_nutrition_summaries with explicit columns.");

const summaryAdapter = fs.readFileSync(path.join(mealRoot, "adapters", "supabaseConsumerDailyNutritionSummaryRepository.ts"), "utf8");
if (/readEnabled/.test(summaryAdapter) && /ConsumerDailySummarySourceUnavailableError/.test(summaryAdapter)) pass("Supabase summary adapter is read-gated");
else fail("Supabase summary adapter is read-gated", "Phase 2E live summary reads must remain disabled unless explicitly enabled in a future phase.");
if (/\.eq\("user_id", userId\)/.test(summaryAdapter) && /\.eq\("local_date", input\.summaryDate\)/.test(summaryAdapter) && /\.limit\(1\)/.test(summaryAdapter)) pass("Supabase summary adapter filters current user and exact date");
else fail("Supabase summary adapter filters current user and exact date", "Summary read preparation must be current-user and exact-date bounded.");

const calculator = fs.readFileSync(path.join(mealRoot, "dailyNutritionSummaryCalculator.ts"), "utf8");
if (!/Date\.now\(|new Date\(|process\.env|localStorage|AsyncStorage|fetch\s*\(/.test(calculator)) pass("recalculation engine is pure and deterministic");
else fail("recalculation engine is pure and deterministic", "Calculator must not use clock, environment, storage, or network.");
if (/record\.items/.test(calculator) && !/record\.nutrition/.test(calculator)) pass("calculator uses item totals and avoids record total double counting");
else fail("calculator uses item totals and avoids record total double counting", "Calculator must use meal items as authoritative nutrition source.");
if (/corrections\?\.length/.test(calculator) && /consumptionAdjustments\?\.length/.test(calculator) && /RuleUnavailable/.test(calculator)) pass("correction and adjustment rules fail closed");
else fail("correction and adjustment rules fail closed", "Unfrozen correction and adjustment rules must fail closed.");

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const allowedPhase2IUiImports = new Set(["apps/mobile/app/index.tsx", "apps/mobile/app/today-intake.tsx"]);
const uiImports = uiFiles
  .map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ text }) => /consumer-meals|dailyNutrition|@supabase\/supabase-js|react-native-url-polyfill/.test(text));
const disallowedUiImports = uiImports
  .filter(({ rel, text }) => !allowedPhase2IUiImports.has(rel) || /@supabase\/supabase-js|react-native-url-polyfill|consumerMealRecordsService|consumerDailyNutritionSummaryService|dailyNutritionSummaryCalculator|supabaseConsumerMeal|MockConsumerMeal/.test(text))
  .map(({ rel }) => rel);
if (disallowedUiImports.length) fail("UI imports limited to Phase 2I shared overview hook", "Mobile UI may only import the Phase 2I shared overview hook from Home/Today Intake.", { matches: disallowedUiImports });
else pass("UI imports limited to Phase 2I shared overview hook", { matches: uiImports.map(({ rel }) => rel) });

const navigationImports = walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ rel, text }) => /DAILY_NUTRITION_SOURCE|dailyNutrition/.test(text) || (/consumer-meals/.test(text) && !allowedPhase2IUiImports.has(rel)))
  .map(({ rel }) => rel);
if (navigationImports.length) fail("Navigation remains unchanged outside Phase 2I UI cutover", "Consumer daily summary route imports may only appear through the approved Phase 2I Home/Today Intake cutover.", { matches: navigationImports });
else pass("Navigation remains unchanged");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2e-"));
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
  throw new Error("Phase 2E guard trapped fetch.");
};

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const flagsModule = requireFromTemp("./featureFlags.js");
const factories = requireFromTemp("./factories.js");
const serviceModule = requireFromTemp("./consumerDailyNutritionSummaryService.js");
const disabledRepoModule = requireFromTemp("./adapters/supabaseDisabledConsumerDailyNutritionSummaryRepository.js");
const liveRepoModule = requireFromTemp("./adapters/supabaseConsumerDailyNutritionSummaryRepository.js");
const calculatorModule = requireFromTemp("./dailyNutritionSummaryCalculator.js");
const mapperModule = requireFromTemp("./dailyNutritionSummaryMappers.js");

const currentUserId = "00000000-0000-4000-8000-000000002e00";
const validSession = {
  user: { userId: currentUserId, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "2026-07-13T00:00:00.000Z" },
  provider: "supabase",
  issuedAt: "2026-07-13T00:01:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z"
};
const records = [
  {
    mealRecordId: "meal-a",
    mealType: "lunch",
    occurredAt: "2026-07-13T04:00:00.000Z",
    mealDate: "2026-07-13",
    timezone: "Asia/Taipei",
    source: "manual",
    createdAt: "2026-07-13T04:00:00.000Z",
    updatedAt: "2026-07-13T04:00:00.000Z",
    items: [
      {
        mealRecordItemId: "item-a",
        displayName: "item a",
        nutrition: { calories: 300, protein: 20, carbohydrates: 30, fat: 8, fiber: 3 },
        nutritionSource: "manual",
        nutritionSchemaVersion: "consumer-nutrition-snapshot-v1",
        occurredAt: "2026-07-13T04:00:00.000Z",
        timezone: "Asia/Taipei",
        consumedRatio: 1,
        correctionStatus: "none",
        createdAt: "2026-07-13T04:00:00.000Z",
        updatedAt: "2026-07-13T04:00:00.000Z"
      },
      {
        mealRecordItemId: "item-b",
        displayName: "item b",
        nutrition: { calories: 200, protein: 10, carbohydrates: 20, fat: 4, fiber: 2 },
        nutritionSource: "manual",
        nutritionSchemaVersion: "consumer-nutrition-snapshot-v1",
        occurredAt: "2026-07-13T04:10:00.000Z",
        timezone: "Asia/Taipei",
        consumedRatio: 0.5,
        correctionStatus: "none",
        createdAt: "2026-07-13T04:10:00.000Z",
        updatedAt: "2026-07-13T04:10:00.000Z"
      }
    ]
  },
  {
    mealRecordId: "meal-other-day",
    mealType: "dinner",
    occurredAt: "2026-07-12T12:00:00.000Z",
    mealDate: "2026-07-12",
    timezone: "Asia/Taipei",
    source: "manual",
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:00:00.000Z",
    items: []
  }
];

function authPortFor(resultFactory) {
  return {
    source: "supabase-live",
    getCurrentSession: async () => resultFactory(),
    observeAuthState: () => () => undefined,
    signIn: async () => auth.err(new Error("disabled")),
    signUp: async () => auth.err(new Error("disabled")),
    signOut: async () => auth.ok(undefined),
    refreshSession: async () => resultFactory(),
    sendPasswordReset: async () => auth.err(new Error("disabled")),
    restoreSession: async () => resultFactory()
  };
}

function queryClientFor(row, calls) {
  const builder = {
    select(columns) {
      calls.push(["select", columns]);
      return builder;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return builder;
    },
    gte(column, value) {
      calls.push(["gte", column, value]);
      return builder;
    },
    lte(column, value) {
      calls.push(["lte", column, value]);
      return builder;
    },
    is(column, value) {
      calls.push(["is", column, value]);
      return builder;
    },
    order(column, value) {
      calls.push(["order", column, value]);
      return builder;
    },
    async limit(count) {
      calls.push(["limit", count]);
      return { data: row ? [row] : [], error: null, status: 200 };
    }
  };
  return {
    from(table) {
      calls.push(["from", table]);
      return builder;
    },
    rpc() {
      throw new Error("summary read must not use rpc");
    }
  };
}

async function fakeSummaryTests() {
  const defaults = flagsModule.getConsumerMealRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.mealRecordsSource !== "mock" || defaults.dailyNutritionSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.dailyNutritionLiveReadOptIn || defaults.issues.length) {
    throw new Error("default flags should keep daily summaries on mock and disabled live transport");
  }
  const unknown = flagsModule.getConsumerMealRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "unknown" });
  if (!unknown.issues.some((issue) => issue.includes("Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE"))) throw new Error("unknown daily summary source must fail closed");
  const live = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "supabase-live"
  });
  if (!live.issues.some((issue) => issue.includes("DAILY_NUTRITION_LIVE_READ_OPT_IN"))) throw new Error("live summary reads must require explicit Phase 2F opt-in");
  const disabledRepo = new disabledRepoModule.SupabaseDisabledConsumerDailyNutritionSummaryRepository();
  const disabled = await disabledRepo.getCurrentUserDailyNutritionSummary({ summaryDate: "2026-07-13" });
  if (disabled.ok || disabled.error.code !== "daily_summary_source_unavailable") throw new Error("disabled summary repository must fail closed");
  const service = new serviceModule.ConsumerDailyNutritionSummaryService({ repository: disabledRepo });
  const invalidDate = await service.getCurrentUserDailyNutritionSummary({ summaryDate: "20260713" });
  if (invalidDate.ok || invalidDate.error.code !== "daily_summary_invalid_date") throw new Error("summary service must reject invalid dates");
  const factoryLiveBlocked = factories.assertConsumerDailyNutritionSummaryRuntimeFlags(live);
  if (factoryLiveBlocked.ok || factoryLiveBlocked.error.code !== "daily_summary_configuration_invalid") throw new Error("summary live flags must fail closed");

  const calculated = calculatorModule.calculateDailyNutritionSummary({
    summaryDate: "2026-07-13",
    timezone: "Asia/Taipei",
    calculatedAt: "2026-07-13T15:00:00.000Z",
    mealRecords: records
  });
  if (!calculated.ok) throw new Error(`summary calculation failed: ${calculated.error.code}`);
  if (calculated.value.calories !== 400 || calculated.value.protein !== 25 || calculated.value.carbohydrates !== 40 || calculated.value.fat !== 10 || calculated.value.fiber !== 4 || calculated.value.mealCount !== 1 || calculated.value.itemCount !== 2) {
    throw new Error("summary calculation did not use item totals and consumed ratio correctly");
  }
  const empty = calculatorModule.calculateDailyNutritionSummary({
    summaryDate: "2026-07-14",
    calculatedAt: "2026-07-14T00:00:00.000Z",
    mealRecords: records
  });
  if (!empty.ok || empty.value.calories !== 0 || empty.value.calculationStatus !== "missing") throw new Error("empty day calculation must return zero missing summary");
  const invalidNutrition = calculatorModule.calculateDailyNutritionSummary({
    summaryDate: "2026-07-13",
    calculatedAt: "2026-07-13T00:00:00.000Z",
    mealRecords: [{ ...records[0], items: [{ ...records[0].items[0], nutrition: { calories: Number.NaN } }] }]
  });
  if (invalidNutrition.ok || invalidNutrition.error.code !== "daily_summary_invalid_nutrition") throw new Error("invalid nutrition must fail closed");
  const adjustment = calculatorModule.calculateDailyNutritionSummary({
    summaryDate: "2026-07-13",
    calculatedAt: "2026-07-13T00:00:00.000Z",
    mealRecords: records,
    consumptionAdjustments: [{ mealRecordId: "meal-a", completionRatio: 0.5 }]
  });
  if (adjustment.ok || adjustment.error.code !== "daily_summary_rule_unavailable") throw new Error("unfrozen adjustment rule must fail closed");
  const parityMatch = calculatorModule.compareStoredAndCalculatedDailyNutritionSummary(calculated.value, { ...calculated.value, provenance: "stored" });
  if (!parityMatch.ok || !parityMatch.value.matches) throw new Error("matching summaries should pass parity");
  const parityMismatch = calculatorModule.compareStoredAndCalculatedDailyNutritionSummary({ ...calculated.value, calories: 399, provenance: "stored" }, calculated.value);
  if (!parityMismatch.ok || parityMismatch.value.matches || parityMismatch.value.differences[0].metric !== "calories") throw new Error("mismatched summaries should report deterministic differences");

  const row = {
    id: "summary-a",
    user_id: currentUserId,
    local_date: "2026-07-13",
    timezone: "Asia/Taipei",
    calculation_version: "consumer-daily-summary-v1",
    total_calories: "400",
    total_protein_g: "25",
    total_carbohydrates_g: "40",
    total_fat_g: "10",
    total_fiber_g: "4",
    meal_count: 1,
    source_cutoff_at: "2026-07-13T15:00:00.000Z",
    recalculated_at: "2026-07-13T15:00:00.000Z",
    is_current: true
  };
  const mapped = mapperModule.mapSupabaseDailyNutritionSummaryRowToConsumerSummary(row, currentUserId);
  if (mapped.summaryDate !== "2026-07-13" || mapped.provenance !== "stored" || mapped.itemCount !== null || mapped.itemCountAvailable !== false) throw new Error("summary mapper did not produce canonical stored summary");
  let ownerRejected = false;
  try {
    mapperModule.mapSupabaseDailyNutritionSummaryRowToConsumerSummary({ ...row, user_id: "other" }, currentUserId);
  } catch {
    ownerRejected = true;
  }
  if (!ownerRejected) throw new Error("summary mapper must reject owner mismatch");

  const noReadCalls = [];
  const readDisabled = await new liveRepoModule.SupabaseConsumerDailyNutritionSummaryRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: queryClientFor(row, noReadCalls),
    readEnabled: false
  }).getCurrentUserDailyNutritionSummary({ summaryDate: "2026-07-13" });
  if (readDisabled.ok || readDisabled.error.code !== "daily_summary_source_unavailable" || noReadCalls.length !== 0) throw new Error("disabled live summary adapter must not query");

  const calls = [];
  const liveRepo = new liveRepoModule.SupabaseConsumerDailyNutritionSummaryRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: queryClientFor(row, calls),
    readEnabled: true
  });
  const liveResult = await liveRepo.getCurrentUserDailyNutritionSummary({ summaryDate: "2026-07-13", timezone: "Asia/Taipei" });
  if (!liveResult.ok || liveResult.value.calories !== 400) throw new Error("fake live summary read did not map");
  if (!calls.some((call) => call[0] === "from" && call[1] === "daily_nutrition_summaries")) throw new Error("fake live summary read did not target summary table");
  if (!calls.some((call) => call[0] === "select" && !call[1].includes("*"))) throw new Error("fake live summary read must use explicit columns");
  if (!calls.some((call) => call[0] === "eq" && call[1] === "user_id" && call[2] === currentUserId)) throw new Error("fake live summary read must filter current user");
}

try {
  await fakeSummaryTests();
  pass("fake daily summary contract tests");
} catch (error) {
  fail("fake daily summary contract tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 2E guard.", { networkCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2E",
  reason: issues.length ? "Phase 2E guard failed" : "Daily nutrition summary read architecture and recalculation design verified with fake transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  checks,
  issues,
  liveSummaryReadExecuted: false,
  liveNetworkRequestUsed: false,
  databaseWriteUsed: false,
  rpcUsed: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
