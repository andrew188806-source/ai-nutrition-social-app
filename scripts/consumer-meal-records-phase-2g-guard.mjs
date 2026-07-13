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
  "20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql"
];
const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedMealQueryFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts"
]);
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
const overviewServicePath = path.join(mealRoot, "consumerTodayIntakeOverviewService.ts");
const overviewService = fs.readFileSync(overviewServicePath, "utf8");
const factories = fs.readFileSync(path.join(mealRoot, "factories.ts"), "utf8");
const types = fs.readFileSync(path.join(mealRoot, "types.ts"), "utf8");

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
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged from Phase 2F", { count: migrationFiles.length });
else fail("migration inventory unchanged from Phase 2F", "Phase 2G must not add active migrations.", { migrationFiles, expectedMigrationFiles });

if (/ConsumerTodayIntakeOverview/.test(types) && /storedSummaryStatus/.test(types) && /plannedMealsStatus/.test(types) && /actualConsumedStatus/.test(types)) pass("canonical Today Intake overview type exists");
else fail("canonical Today Intake overview type exists", "Phase 2G must define a shared canonical overview type with source/status fields.");

if (/getCurrentUserTodayIntakeOverview/.test(overviewService)) pass("shared overview public method exists");
else fail("shared overview public method exists", "Shared service must expose getCurrentUserTodayIntakeOverview(input?).");

if (!/\.\s*from\s*\(|\.\s*rpc\s*\(|@supabase\/supabase-js|react-native-url-polyfill/.test(overviewService)) pass("overview service does not construct Supabase queries or import SDK");
else fail("overview service does not construct Supabase queries or import SDK", "Overview service must orchestrate existing services only.");

if (/calculateDailyNutritionSummary/.test(overviewService) && /compareStoredAndCalculatedDailyNutritionSummary/.test(overviewService)) pass("overview service reuses Phase 2E calculator and parity helper");
else fail("overview service reuses Phase 2E calculator and parity helper", "Overview must reuse frozen calculator/parity helpers.");

if (/clock:\s*ConsumerTodayIntakeOverviewClock/.test(overviewService) && /toDateKeyInTimeZone/.test(overviewService) && !/new Date\(\)/.test(overviewService)) pass("overview service uses injected clock and timezone date key");
else fail("overview service uses injected clock and timezone date key", "Overview service must avoid uncontrolled new Date() and UTC substring default dates.");

if (!/\b(userId|ownerId|profileId|externalUserId)\s*[:?]\s*string\b/.test(types) || /ConsumerProfile/.test(types)) pass("overview type exposes no arbitrary user identity");
else fail("overview type exposes no arbitrary user identity", "Overview input/output must not expose user/profile identity fields.");

if (/mealRecordsSource !== flags\.dailyNutritionSource/.test(factories) && /requires meal and daily nutrition sources to match/.test(factories)) pass("overview factory rejects mixed meal/summary sources");
else fail("overview factory rejects mixed meal/summary sources", "Shared overview must fail closed for mixed mock/live source configurations.");

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const allowedPhase2IUiImports = new Set(["apps/mobile/app/index.tsx", "apps/mobile/app/today-intake.tsx"]);
const uiImports = uiFiles
  .map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ text }) => /consumer-meals|ConsumerTodayIntakeOverview|@supabase\/supabase-js|react-native-url-polyfill/.test(text));
const disallowedUiImports = uiImports
  .filter(({ rel, text }) => !allowedPhase2IUiImports.has(rel) || /@supabase\/supabase-js|react-native-url-polyfill|ConsumerTodayIntakeOverview|consumerMealRecordsService|consumerDailyNutritionSummaryService|dailyNutritionSummaryCalculator|supabaseConsumerMeal|MockConsumerMeal/.test(text))
  .map(({ rel }) => rel);
if (disallowedUiImports.length) fail("UI imports limited to Phase 2I shared overview hook", "Mobile UI may only import the Phase 2I shared overview hook from Home/Today Intake.", { matches: disallowedUiImports });
else pass("UI imports limited to Phase 2I shared overview hook", { matches: uiImports.map(({ rel }) => rel) });

const navigationImports = walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ rel, text }) => /ConsumerTodayIntakeOverview|TODAY_INTAKE/.test(text) || (/consumer-meals/.test(text) && !allowedPhase2IUiImports.has(rel)))
  .map(({ rel }) => rel);
if (navigationImports.length) fail("Navigation remains unchanged outside Phase 2I UI cutover", "Shared overview route imports may only appear through the approved Phase 2I Home/Today Intake cutover.", { matches: navigationImports });
else pass("Navigation remains unchanged");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2g-"));
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
  throw new Error("Phase 2G guard trapped fetch.");
};

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const errors = requireFromTemp("../consumer-auth/errors.js");
const serviceModule = requireFromTemp("./consumerTodayIntakeOverviewService.js");
const mealServiceModule = requireFromTemp("./consumerMealRecordsService.js");
const summaryServiceModule = requireFromTemp("./consumerDailyNutritionSummaryService.js");
const factoriesModule = requireFromTemp("./factories.js");
const flagsModule = requireFromTemp("./featureFlags.js");

function mealRecord(overrides = {}) {
  return {
    mealRecordId: overrides.mealRecordId ?? "meal-a",
    mealType: overrides.mealType ?? "lunch",
    occurredAt: overrides.occurredAt ?? "2026-07-13T04:00:00.000Z",
    mealDate: overrides.mealDate ?? "2026-07-13",
    timezone: overrides.timezone ?? "Asia/Taipei",
    title: overrides.title ?? "Lunch",
    source: overrides.source ?? "manual",
    createdAt: overrides.createdAt ?? "2026-07-13T04:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-13T04:00:00.000Z",
    items: overrides.items ?? [
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
  };
}

function serviceFor({ mealsResult, summaryResult, plannedResult, clockDate = "2026-07-13T15:00:00.000Z" }) {
  const mealRecordsService = new mealServiceModule.ConsumerMealRecordsService({
    repository: {
      source: "mock",
      listCurrentUserMealRecords: async () => mealsResult
    }
  });
  const dailyNutritionSummaryService = new summaryServiceModule.ConsumerDailyNutritionSummaryService({
    repository: {
      source: "mock",
      getCurrentUserDailyNutritionSummary: async () => summaryResult
    }
  });
  return new serviceModule.ConsumerTodayIntakeOverviewService({
    mealRecordsService,
    dailyNutritionSummaryService,
    plannedMealsRepository: plannedResult
      ? { listCurrentUserPlannedMeals: async () => plannedResult }
      : undefined,
    clock: { now: () => new Date(clockDate) },
    mealRecordsSource: "mock",
    dailyNutritionSource: "mock",
    timezone: "Asia/Taipei"
  });
}

async function fakeOverviewTests() {
  const records = [mealRecord()];
  const calculatedSummary = {
    summaryDate: "2026-07-13",
    timezone: "Asia/Taipei",
    calculationVersion: "consumer-daily-summary-v1",
    calories: 400,
    protein: 25,
    carbohydrates: 40,
    fat: 10,
    fiber: 4,
    mealCount: 1,
    itemCount: null,
    itemCountAvailable: false,
    sourceCutoffAt: "2026-07-13T15:00:00.000Z",
    recalculatedAt: "2026-07-13T15:00:00.000Z",
    isCurrent: true,
    provenance: "stored",
    calculationStatus: "current"
  };

  const empty = await serviceFor({
    mealsResult: auth.ok([]),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError())
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-14" });
  if (!empty.ok || empty.value.status !== "empty" || empty.value.mealCount !== 0 || empty.value.itemCount !== 0 || empty.value.actualConsumedStatus !== "empty") {
    throw new Error("empty day must return canonical zero overview without treating empty as error");
  }

  const single = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError())
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (
    !single.ok ||
    single.value.status !== "partial" ||
    single.value.calculatedNutrition.calories !== 400 ||
    single.value.itemCount !== 2 ||
    single.value.storedSummaryStatus !== "unavailable" ||
    !single.value.warnings.includes("stored_summary_unavailable") ||
    !single.value.warnings.includes("planned_meals_unavailable")
  ) {
    throw new Error("single-day overview did not calculate item totals or mark unavailable optional sources as partial");
  }

  const parityMatch = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.ok(calculatedSummary),
    plannedResult: auth.ok([])
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (!parityMatch.ok || parityMatch.value.status !== "complete" || parityMatch.value.warnings.includes("stored_summary_parity_mismatch")) {
    throw new Error("matching stored summary should not create parity warning");
  }
  if (parityMatch.value.storedNutrition?.itemCount !== null || parityMatch.value.storedNutrition?.itemCountAvailable !== false) {
    throw new Error("stored item count must remain unavailable");
  }

  const parityMismatch = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.ok({ ...calculatedSummary, calories: 399 })
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (!parityMismatch.ok || parityMismatch.value.status !== "partial" || !parityMismatch.value.warnings.includes("stored_summary_parity_mismatch")) {
    throw new Error("stored/calculated mismatch must be explicit partial metadata");
  }

  const summaryError = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.err(new errors.ConsumerDailySummaryTransportFailedError())
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (!summaryError.ok || summaryError.value.status !== "partial" || summaryError.value.storedSummaryStatus !== "error") {
    throw new Error("summary transport failure must be partial, not empty or silent fallback");
  }

  const planned = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError()),
    plannedResult: auth.ok([{ date: "2026-07-13", title: "Planned dinner", mealType: "dinner" }])
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (!planned.ok || planned.value.plannedMealsStatus !== "available" || planned.value.calculatedNutrition.calories !== 400 || planned.value.mealCount !== 1) {
    throw new Error("planned meals must stay separated from actual consumed totals");
  }

  const invalidDate = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError())
  }).getCurrentUserTodayIntakeOverview({ date: "2026-02-31" });
  if (invalidDate.ok || invalidDate.error.code !== "today_intake_overview_invalid_date") throw new Error("invalid date must fail closed");

  const mealFailure = await serviceFor({
    mealsResult: auth.err(new errors.ConsumerMealTransportFailedError()),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError())
  }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (mealFailure.ok || mealFailure.error.code !== "today_intake_overview_meal_read_failed") throw new Error("meal transport failure must be typed");

  const deterministicA = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError())
  }).getCurrentUserTodayIntakeOverview();
  const deterministicB = await serviceFor({
    mealsResult: auth.ok(records),
    summaryResult: auth.err(new errors.ConsumerDailySummaryNotFoundError())
  }).getCurrentUserTodayIntakeOverview();
  if (!deterministicA.ok || !deterministicB.ok || deterministicA.value.date !== deterministicB.value.date || deterministicA.value.generatedAt !== deterministicB.value.generatedAt) {
    throw new Error("overview default date and generatedAt must be deterministic with injected clock");
  }

  const flags = flagsModule.getConsumerMealRuntimeFlags({});
  const factoryService = factoriesModule.createConsumerTodayIntakeOverviewService(flags, { clock: { now: () => new Date("2026-07-13T00:00:00.000Z") } });
  const factoryOverview = await factoryService.getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (!factoryOverview.ok) throw new Error("mock factory overview should be usable without network");
  const mixed = factoriesModule.assertConsumerTodayIntakeOverviewRuntimeFlags({
    ...flags,
    mealRecordsSource: "mock",
    dailyNutritionSource: "supabase-live"
  });
  if (mixed.ok || mixed.error.code !== "today_intake_overview_configuration_invalid") throw new Error("mixed source overview config must fail closed");
}

try {
  await fakeOverviewTests();
  pass("fake shared overview contract tests");
} catch (error) {
  fail("fake shared overview contract tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 2G guard.", { networkCalls });

const liveSmoke = fs.readFileSync(path.join(root, "scripts", "consumer-meal-records-phase-2g-live-smoke.mjs"), "utf8");
if (/status:\s*"skipped"/.test(liveSmoke) && /supabaseClientCreated:\s*false/.test(liveSmoke) && /networkRequestUsed:\s*false/.test(liveSmoke)) pass("Phase 2G live smoke is hard-skipped");
else fail("Phase 2G live smoke is hard-skipped", "Live shared model smoke must not create a client or network request in Phase 2G.");

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2G",
  reason: issues.length ? "Phase 2G guard failed" : "Home/Today Intake shared runtime read model preparation verified with fake transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  checks,
  issues,
  liveSharedSmokeExecuted: false,
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
