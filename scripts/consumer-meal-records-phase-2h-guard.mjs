import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
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
  "20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql",
  "20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql"
];
const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedMealQueryFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts"
]);
const approvedMealRpcFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts"
]);

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
const overviewService = fs.readFileSync(path.join(mealRoot, "consumerTodayIntakeOverviewService.ts"), "utf8");
const factories = fs.readFileSync(path.join(mealRoot, "factories.ts"), "utf8");
const liveSmokePath = path.join(root, "scripts", "consumer-meal-records-phase-2h-live-smoke.mjs");
const liveSmoke = fs.readFileSync(liveSmokePath, "utf8");

const sdkImportMatches = sourceText.filter((item) => /@supabase\/supabase-js|react-native-url-polyfill/.test(item.text)).map((item) => item.rel);
const unapprovedSdkImports = sdkImportMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedSdkImports.length) fail("SDK imports limited to official lazy loader", "Supabase SDK/polyfill imports may only appear in supabaseSdkLoader.ts.", { matches: unapprovedSdkImports });
else pass("SDK imports limited to official lazy loader", { matches: sdkImportMatches });

const forbiddenMealPatterns = [
  [/\bfetch\s*\(/, "Consumer meal source must not add direct fetch calls."],
  [/\bXMLHttpRequest\b/, "Consumer meal source must not add direct XMLHttpRequest calls."],
  [/WebSocket\s*\(/, "Consumer meal source must not add explicit realtime sockets."],
  [new RegExp(["service", "role"].join("[_-]?"), "i"), "Privileged credentials must not appear in Mobile Consumer source."],
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
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged from Phase 2G", { count: migrationFiles.length });
else fail("migration inventory unchanged from Phase 2G", "Phase 2H must not add active migrations.", { migrationFiles, expectedMigrationFiles });

if (!/\.\s*from\s*\(|\.\s*rpc\s*\(|@supabase\/supabase-js|react-native-url-polyfill/.test(overviewService)) pass("overview service does not construct Supabase queries or import SDK");
else fail("overview service does not construct Supabase queries or import SDK", "Overview service must orchestrate existing services only.");

if (/createConsumerMealRecordsService/.test(factories) && /createConsumerDailyNutritionSummaryService/.test(factories) && /ConsumerTodayIntakeOverviewService/.test(factories)) pass("shared factory reuses frozen read services");
else fail("shared factory reuses frozen read services", "Phase 2H must use the Phase 2G shared service architecture.");

if (/mealRecordsSource !== flags\.dailyNutritionSource/.test(factories) && /requires meal and daily nutrition sources to match/.test(factories)) pass("mixed mock/live overview fails closed");
else fail("mixed mock/live overview fails closed", "Shared overview must fail closed for mixed source configurations.");

if (/storedSummaryStatus\s*=\s*"unavailable"/.test(overviewService) && /planned_meals_unavailable/.test(overviewService) && /return "partial"/.test(overviewService)) pass("optional live gaps produce explicit partial metadata");
else fail("optional live gaps produce explicit partial metadata", "Stored summary missing and planned runtime unavailable must be explicit partial metadata for non-empty actual days.");

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const allowedPhase2IUiImports = new Set(["apps/mobile/app/index.tsx", "apps/mobile/app/today-intake.tsx"]);
const uiImports = uiFiles
  .map((file) => ({ file, rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ text }) => /consumer-meals|ConsumerTodayIntakeOverview|@supabase\/supabase-js|react-native-url-polyfill/.test(text));
const disallowedUiImports = uiImports
  .filter(({ rel, text }) => !allowedPhase2IUiImports.has(rel) || /@supabase\/supabase-js|react-native-url-polyfill|ConsumerTodayIntakeOverview|consumerMealRecordsService|consumerDailyNutritionSummaryService|dailyNutritionSummaryCalculator/.test(text))
  .map(({ rel }) => rel);
if (disallowedUiImports.length) fail("UI imports limited to Phase 2I shared overview hook", "UI may only import the Phase 2I shared overview hook from Home/Today Intake.", { matches: disallowedUiImports });
else pass("UI imports limited to Phase 2I shared overview hook", { matches: uiImports.map(({ rel }) => rel) });

const navigationImports = walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .filter((file) => /ConsumerTodayIntakeOverview|TODAY_INTAKE/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (navigationImports.length) fail("Navigation remains unchanged", "Phase 2H must not wire routes/navigation to shared overview.", { matches: navigationImports });
else pass("Navigation remains unchanged");

if (/TASTKIND_CONSUMER_PHASE2H_LIVE_SHARED_INTAKE_READ/.test(liveSmoke) && /createConsumerTodayIntakeOverviewService/.test(liveSmoke) && /signIn/.test(liveSmoke) && /signOut/.test(liveSmoke)) pass("Phase 2H live smoke has explicit opt-in and shared overview flow");
else fail("Phase 2H live smoke has explicit opt-in and shared overview flow", "Live smoke must require explicit opt-in and call the shared overview service.");

const liveSmokeWriteMatches = liveSmoke
  .split(/\r?\n/)
  .map((line, index) => ({ line, lineNumber: index + 1 }))
  .filter(({ line }) => /\.\s*(insert|upsert|update|delete|rpc)\s*\(/.test(line) && !/storageValues\.delete\s*\(/.test(line));
if (!liveSmokeWriteMatches.length) pass("Phase 2H live smoke has no write or RPC invocation");
else fail("Phase 2H live smoke has no write or RPC invocation", "Phase 2H smoke must not invoke write or RPC methods.", { matches: liveSmokeWriteMatches });

try {
  const output = execFileSync(process.execPath, [liveSmokePath], {
    cwd: root,
    env: {
      ...process.env,
      TASTKIND_CONSUMER_PHASE2H_LIVE_SHARED_INTAKE_READ: ""
    },
    encoding: "utf8"
  });
  const parsed = JSON.parse(output);
  if (parsed.status === "skipped" && parsed.supabaseClientCreated === false && parsed.networkRequestUsed === false && parsed.databaseWriteUsed === false) {
    pass("default Phase 2H live smoke is skipped without network");
  } else {
    fail("default Phase 2H live smoke is skipped without network", "Default live smoke must skip without client/network/write.", { parsed });
  }
} catch {
  fail("default Phase 2H live smoke is skipped without network", "Default live smoke did not produce parseable skipped output.");
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2h-"));
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

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const errors = requireFromTemp("../consumer-auth/errors.js");
const serviceModule = requireFromTemp("./consumerTodayIntakeOverviewService.js");
const mealServiceModule = requireFromTemp("./consumerMealRecordsService.js");
const summaryServiceModule = requireFromTemp("./consumerDailyNutritionSummaryService.js");

const record = {
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
    }
  ]
};
const overviewServiceForPartial = new serviceModule.ConsumerTodayIntakeOverviewService({
  mealRecordsService: new mealServiceModule.ConsumerMealRecordsService({
    repository: { source: "mock", listCurrentUserMealRecords: async () => auth.ok([record]) }
  }),
  dailyNutritionSummaryService: new summaryServiceModule.ConsumerDailyNutritionSummaryService({
    repository: { source: "mock", getCurrentUserDailyNutritionSummary: async () => auth.err(new errors.ConsumerDailySummaryNotFoundError()) }
  }),
  clock: { now: () => new Date("2026-07-13T04:00:00.000Z") },
  mealRecordsSource: "mock",
  dailyNutritionSource: "mock",
  timezone: "Asia/Taipei"
});
const partial = await overviewServiceForPartial.getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
if (
  partial.ok &&
  partial.value.status === "partial" &&
  partial.value.mealCount === 1 &&
  partial.value.calculatedNutrition.calories === 300 &&
  partial.value.warnings.includes("stored_summary_unavailable") &&
  partial.value.warnings.includes("planned_meals_unavailable")
) {
  pass("fake partial overview semantics");
} else {
  fail("fake partial overview semantics", "Missing stored summary plus unavailable planned runtime must produce non-empty partial overview.");
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2H",
  reason: issues.length ? "Phase 2H guard failed" : "Development live shared intake read verification guard passed",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  checks,
  issues,
  defaultLiveSmokeExecuted: false,
  defaultLiveSmokeSkipped: true,
  explicitLiveSmokeExecutedByGuard: false,
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
