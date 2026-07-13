import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const appDir = path.join(root, "apps", "mobile", "app");
const componentDir = path.join(root, "apps", "mobile", "components");
const featuresRoot = path.join(root, "apps", "mobile", "features");
const mobileNodeModulesPath = path.join(root, "apps", "mobile", "node_modules");
const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const plannedMealRoot = path.join(root, "apps", "mobile", "features", "planned-meal");
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

const homePath = path.join(appDir, "index.tsx");
const todayPath = path.join(appDir, "today-intake.tsx");
const home = fs.readFileSync(homePath, "utf8");
const today = fs.readFileSync(todayPath, "utf8");
const uiModel = fs.readFileSync(path.join(mealRoot, "todayIntakeUiModel.ts"), "utf8");

if (/useTodayIntakeUiModel/.test(home) && !/getTodayMealRecords|calculateTodayNutritionSummary|mapMealRecordsToMealSlots|getPlannedDinner\(/.test(home)) {
  pass("Home uses shared overview UI model");
} else {
  fail("Home uses shared overview UI model", "Home must cut over to useTodayIntakeUiModel and stop route-local meal/nutrition reads.");
}

if (/useTodayIntakeUiModel/.test(today) && /getUiMealCalories/.test(today) && !/getTodayMealRecords|calculateTodayNutritionSummary|getEffectiveCalories|getPlannedDinner\(/.test(today)) {
  pass("Today Intake uses shared overview UI model");
} else {
  fail("Today Intake uses shared overview UI model", "Today Intake must cut over to useTodayIntakeUiModel and stop route-local meal/nutrition reads.");
}

if (/getCurrentUserTodayIntakeOverview/.test(uiModel) && /createConsumerTodayIntakeOverviewService/.test(uiModel)) {
  pass("UI-facing model uses canonical shared overview method");
} else {
  fail("UI-facing model uses canonical shared overview method", "The UI-facing model must call getCurrentUserTodayIntakeOverview through the canonical service.");
}

if (!/calculateTodayNutritionSummary|getEffectiveCalories|mapMealRecordsToMealSlots|dailyNutritionSummaryCalculator|compareStoredAndCalculatedDailyNutritionSummary/.test(uiModel)) {
  pass("UI-facing model does not import legacy or Phase 2E calculators");
} else {
  fail("UI-facing model does not import legacy or Phase 2E calculators", "UI-facing model may map canonical values but must not calculate actual nutrition independently.");
}

if (/plannedMealsStatus|planned_meals_unavailable|dinnerPlanForDisplay/.test(uiModel) && !/planned.*totals/i.test(uiModel)) {
  pass("planned meals remain separated from actual totals");
} else {
  fail("planned meals remain separated from actual totals", "Planned meals must remain display-only and outside actual consumed totals.");
}

const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const forbiddenUiPatterns = [
  [/@supabase\/supabase-js|react-native-url-polyfill/, "UI must not import Supabase SDK."],
  [/consumerMealRecordsService|consumerDailyNutritionSummaryService|supabaseConsumerMeal|MockConsumerMeal|dailyNutritionSummaryCalculator/, "UI must not import repositories/services/calculator directly."],
  [/\.\s*(insert|upsert|update|delete|rpc)\s*\(/, "UI must not invoke writes or RPC."]
];
for (const [pattern, message] of forbiddenUiPatterns) {
  const matches = uiFiles.filter((file) => pattern.test(fs.readFileSync(file, "utf8"))).map(relative);
  if (matches.length) fail(`forbidden UI pattern: ${pattern}`, message, { matches });
  else pass(`forbidden UI pattern absent: ${pattern}`);
}

const mealSourceFiles = [
  ...walk(authRoot, (file) => file.endsWith(".ts")),
  ...walk(mealRoot, (file) => file.endsWith(".ts"))
].map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));

const secretMatches = mealSourceFiles
  .filter(({ text }) => /service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(text))
  .map(({ rel }) => rel);
if (secretMatches.length) fail("no secret/service-role references in Consumer runtime source", "Consumer runtime source must not include privileged credential references.", { matches: secretMatches });
else pass("no secret/service-role references in Consumer runtime source");

const writeMatches = mealSourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /\.\s*(insert|upsert|update|delete)\s*\(/.test(text) && !rel.endsWith("supabaseConsumerMealRecordWriteRepository.ts"))
  .map(({ rel }) => rel);
if (writeMatches.length) fail("no unapproved Consumer write methods", "Phase 2I must not add Consumer write paths.", { matches: writeMatches });
else pass("no unapproved Consumer write methods");

const rpcMatches = mealSourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /\.\s*rpc\s*\(/.test(text) && !rel.endsWith("supabaseConsumerMealRecordWriteRepository.ts"))
  .map(({ rel }) => rel);
if (rpcMatches.length) fail("no new Consumer RPC invocation", "Only the existing Phase 2D write adapter may reference RPC.", { matches: rpcMatches });
else pass("no new Consumer RPC invocation");

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged from Phase 2H", { count: migrationFiles.length });
else fail("migration inventory unchanged from Phase 2H", "Phase 2I must not add migrations.", { migrationFiles, expectedMigrationFiles });

const liveSmokePath = path.join(root, "scripts", "consumer-meal-records-phase-2i-live-smoke.mjs");
const liveSmoke = fs.readFileSync(liveSmokePath, "utf8");
if (/TASTKIND_CONSUMER_PHASE2I_LIVE_UI_READ/.test(liveSmoke) && /getCurrentUserTodayIntakeUiModel/.test(liveSmoke) && /signIn/.test(liveSmoke) && /signOut/.test(liveSmoke)) {
  pass("Phase 2I live smoke uses explicit opt-in and UI-facing path");
} else {
  fail("Phase 2I live smoke uses explicit opt-in and UI-facing path", "Phase 2I smoke must verify the UI-facing shared read path.");
}
if (!/\.\s*(insert|upsert|update|delete|rpc)\s*\(/.test(liveSmoke.replace(/storageValues\.delete\s*\(/g, ""))) pass("Phase 2I live smoke has no write or RPC invocation");
else fail("Phase 2I live smoke has no write or RPC invocation", "Phase 2I smoke must not invoke write or RPC methods.");

try {
  const output = execFileSync(process.execPath, [liveSmokePath], {
    cwd: root,
    env: { ...process.env, TASTKIND_CONSUMER_PHASE2I_LIVE_UI_READ: "" },
    encoding: "utf8"
  });
  const parsed = JSON.parse(output);
  if (parsed.status === "skipped" && parsed.supabaseClientCreated === false && parsed.networkRequestUsed === false && parsed.databaseWriteUsed === false) {
    pass("default Phase 2I live smoke is skipped without network");
  } else {
    fail("default Phase 2I live smoke is skipped without network", "Default smoke must skip without client/network/write.", { parsed });
  }
} catch {
  fail("default Phase 2I live smoke is skipped without network", "Default smoke did not produce parseable skipped output.");
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2i-"));
const tempSourceFiles = [
  ...mealSourceFiles,
  ...walk(plannedMealRoot, (file) => file.endsWith(".ts")).map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
];
for (const { rel, text } of tempSourceFiles) {
  const sourcePath = path.join(root, rel);
  const target = path.join(tempRoot, rel.replace("apps/mobile/features/", "")).replace(/\.ts$/, ".js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let source = text.replace(
    'import { zhTW } from "../../../../lib/i18n/zh-TW";',
    'import { zhTW } from "../__test_i18n";'
  );
  if (rel.endsWith("consumer-meals/todayIntakeUiModel.ts")) {
    source = source
      .replace('import { SupabaseConsumerAuthAdapter } from "../consumer-auth/adapters/supabaseConsumerAuthAdapter";', "const SupabaseConsumerAuthAdapter = class { constructor(..._args: unknown[]) {} };")
      .replace('import { createAsyncStorageConsumerAuthStorage } from "../consumer-auth/asyncStorageConsumerAuthStorage";', "const createAsyncStorageConsumerAuthStorage = () => ({});")
      .replace('import { getConsumerRuntimeFlags } from "../consumer-auth/featureFlags";', "const getConsumerRuntimeFlags = () => ({});")
      .replace('import { getSupabaseConsumerEnvironment } from "../consumer-auth/supabaseConsumerEnvironment";', "const getSupabaseConsumerEnvironment = (env: unknown) => env;")
      .replace('import { SupabaseConsumerClientFactory } from "../consumer-auth/supabaseConsumerClientFactory";', "const SupabaseConsumerClientFactory = class { constructor(..._args: unknown[]) {} getOrCreateClient() { return { client: { auth: {} } }; } };")
      .replace('import { createOfficialSupabaseConsumerSdkLoader } from "../consumer-auth/supabaseSdkLoader";', "const createOfficialSupabaseConsumerSdkLoader = () => (() => ({}));");
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, strict: true },
    fileName: sourcePath
  }).outputText;
  fs.writeFileSync(target, output, "utf8");
}
const analysisStub = path.join(tempRoot, "analysis", "analysisMealRecordStore.js");
fs.mkdirSync(path.dirname(analysisStub), { recursive: true });
fs.writeFileSync(analysisStub, "exports.getMealRecords = () => [];\n", "utf8");
const i18nTarget = path.join(tempRoot, "__test_i18n.js");
fs.writeFileSync(i18nTarget, `
exports.zhTW = {
  mobile: {
    refinedLogic: {
      lifestyleWorld: { todayIntake: { mealSlotOptions: ["早餐", "午餐", "晚餐", "點心"] } },
      mealBuddyCard: { emptyField: "未填寫" }
    },
    plannedDinner: { defaultPlan: null },
    todayNutritionSummary: {
      reminders: { lowProtein: "蛋白質偏低", lowVegetable: "蔬菜偏少", highSodium: "留意鈉含量" }
    }
  }
};
`, "utf8");

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

try {
  const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
  const auth = requireFromTemp("../consumer-auth/types.js");
  const serviceModule = requireFromTemp("./consumerTodayIntakeOverviewService.js");
  const mealServiceModule = requireFromTemp("./consumerMealRecordsService.js");
  const summaryServiceModule = requireFromTemp("./consumerDailyNutritionSummaryService.js");
  const uiModule = requireFromTemp("./todayIntakeUiModel.js");
  const record = {
    mealRecordId: "meal-a",
    mealType: "lunch",
    occurredAt: "2026-07-13T04:00:00.000Z",
    mealDate: "2026-07-13",
    timezone: "Asia/Taipei",
    source: "manual",
    createdAt: "2026-07-13T04:00:00.000Z",
    updatedAt: "2026-07-13T04:00:00.000Z",
    items: [{
      mealRecordItemId: "item-a",
      displayName: "item a",
      nutrition: { calories: 123, protein: 12, carbohydrates: 18, fat: 4, fiber: 3 },
      nutritionSource: "manual",
      nutritionSchemaVersion: "consumer-nutrition-snapshot-v1",
      occurredAt: "2026-07-13T04:00:00.000Z",
      timezone: "Asia/Taipei",
      consumedRatio: 1,
      correctionStatus: "none",
      createdAt: "2026-07-13T04:00:00.000Z",
      updatedAt: "2026-07-13T04:00:00.000Z"
    }]
  };
  const overviewService = new serviceModule.ConsumerTodayIntakeOverviewService({
    mealRecordsService: new mealServiceModule.ConsumerMealRecordsService({
      repository: { source: "mock", listCurrentUserMealRecords: async () => auth.ok([record]) }
    }),
    dailyNutritionSummaryService: new summaryServiceModule.ConsumerDailyNutritionSummaryService({
      repository: { source: "mock", getCurrentUserDailyNutritionSummary: async () => auth.err({ code: "daily_summary_not_found" }) }
    }),
    clock: { now: () => new Date("2026-07-13T04:00:00.000Z") },
    mealRecordsSource: "mock",
    dailyNutritionSource: "mock",
    timezone: "Asia/Taipei"
  });
  const model = await uiModule.getCurrentUserTodayIntakeUiModel({ date: "2026-07-13", overviewService });
  if (
    model.summary.totals.calories === 123 &&
    model.summary.totals.protein === 12 &&
    model.summary.totals.carbs === 18 &&
    model.summary.totals.fat === 4 &&
    model.mealRecords.length === 1 &&
    model.overview.status === "partial"
  ) {
    pass("fake UI model maps canonical overview totals");
  } else {
    fail("fake UI model maps canonical overview totals", "UI model did not preserve canonical actual totals.");
  }
} catch (error) {
  fail("fake UI model maps canonical overview totals", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2I",
  reason: issues.length ? "Phase 2I guard failed" : "Home / Today Intake shared read model cutover verified",
  checks,
  issues,
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
