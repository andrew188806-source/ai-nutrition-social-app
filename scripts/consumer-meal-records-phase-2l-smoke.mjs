import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const mockContract = process.argv.includes("--mock-contract");

const result = {
  status: "skipped",
  phase: "Consumer Runtime Integration Phase 2L Planned Meals Smoke",
  reason: "SKIPPED - Consumer Runtime Phase 2L default smoke does not enable planned meals.",
  clientCreated: false,
  signInUsed: false,
  networkRequestUsed: false,
  databaseReadUsed: false,
  databaseWriteUsed: false,
  rpcInvoked: false,
  credentialsPrinted: false,
  tokenPrinted: false,
  sessionPrinted: false,
  userIdPrinted: false,
  rawRowsPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

if (!mockContract) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2l-"));
const featureRoot = path.join(root, "apps", "mobile", "features");
copyFeatureTs("consumer-auth");
copyFeatureTs("consumer-meals");

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "consumerPlannedMealsService.js"));
const plannedServiceModule = requireFromTemp("./consumerPlannedMealsService.js");
const overviewServiceModule = requireFromTemp("./consumerTodayIntakeOverviewService.js");
const mockPlannedModule = requireFromTemp("./adapters/mockConsumerPlannedMealsRepository.js");
const disabledPlannedModule = requireFromTemp("./adapters/supabaseDisabledConsumerPlannedMealsRepository.js");

const checks = [];
function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}
function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  throw new Error(`${name}: ${message}`);
}

try {
  const clock = { now: () => new Date("2026-07-13T04:00:00.000Z") };
  const plannedService = new plannedServiceModule.ConsumerPlannedMealsService({
    repository: new mockPlannedModule.MockConsumerPlannedMealsRepository(),
    clock,
    timezone: "Asia/Taipei"
  });
  const disabledPlannedService = new plannedServiceModule.ConsumerPlannedMealsService({
    repository: new disabledPlannedModule.SupabaseDisabledConsumerPlannedMealsRepository(),
    clock,
    timezone: "Asia/Taipei"
  });

  const available = await plannedService.getCurrentUserPlannedMeals({ plannedDate: "2026-07-13" });
  if (available.status !== "available" || available.meals.length !== 1) fail("available planned meals", "Expected one deterministic mock planned meal.");
  pass("available planned meals", { count: available.meals.length });

  const empty = await plannedService.getCurrentUserPlannedMeals({ plannedDate: "2026-07-15" });
  if (empty.status !== "empty" || empty.meals.length !== 0) fail("empty planned meals", "Expected empty result for date without plans.");
  pass("empty planned meals");

  const unavailable = await disabledPlannedService.getCurrentUserPlannedMeals({ plannedDate: "2026-07-13" });
  if (unavailable.status !== "unavailable") fail("unavailable planned meals", "Disabled source must return canonical unavailable.");
  pass("unavailable planned meals", { reason: unavailable.reason });

  const repeated = await plannedService.getCurrentUserPlannedMeals({ plannedDate: "2026-07-13" });
  if (JSON.stringify(available) !== JSON.stringify(repeated)) fail("repeated read", "Mock planned meals must be deterministic.");
  pass("repeated read");

  const sorted = available.meals.map((meal) => meal.plannedMealId).join(",");
  if (sorted !== [...available.meals].sort((left, right) => (
    left.plannedDate.localeCompare(right.plannedDate) ||
    (left.plannedTime ?? "").localeCompare(right.plannedTime ?? "") ||
    left.plannedMealId.localeCompare(right.plannedMealId)
  )).map((meal) => meal.plannedMealId).join(",")) {
    fail("deterministic sorting", "Planned meal sorting must be stable.");
  }
  pass("deterministic sorting");

  const overviewWithPlans = await overviewService({ plannedMealsService: plannedService }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  const overviewWithoutPlans = await overviewService({ plannedMealsService: disabledPlannedService }).getCurrentUserTodayIntakeOverview({ date: "2026-07-13" });
  if (!overviewWithPlans.ok || overviewWithPlans.value.plannedMealsStatus !== "available") {
    fail("shared overview integration", "Mock planned meals must flow into shared overview.");
  }
  pass("shared overview integration", { plannedMealsStatus: overviewWithPlans.value.plannedMealsStatus });

  if (!overviewWithoutPlans.ok || !overviewWithoutPlans.value.warnings.includes("planned_meals_unavailable")) {
    fail("unavailable partial reason", "Disabled planned meals must produce planned_meals_unavailable warning.");
  }
  pass("unavailable partial reason");

  const actualA = overviewWithPlans.value.calculatedNutrition;
  const actualB = overviewWithoutPlans.value.calculatedNutrition;
  if (
    actualA.calories !== actualB.calories ||
    actualA.protein !== actualB.protein ||
    actualA.carbohydrates !== actualB.carbohydrates ||
    actualA.fat !== actualB.fat ||
    actualA.fiber !== actualB.fiber ||
    overviewWithPlans.value.mealCount !== overviewWithoutPlans.value.mealCount ||
    overviewWithPlans.value.itemCount !== overviewWithoutPlans.value.itemCount
  ) {
    fail("planned nutrition excluded from actual totals", "Planned meals must not change actual consumed totals.");
  }
  pass("planned nutrition excluded from actual totals");

  console.log(JSON.stringify({
    ...result,
    status: "passed",
    reason: "Mock planned meals contract verified without client, network, database, write, or RPC.",
    checks,
    availableCase: "passed",
    emptyCase: "passed",
    unavailableCase: "passed",
    dateFiltering: "passed",
    deterministicSorting: "passed",
    repeatedRead: "passed",
    sharedOverviewIntegration: "passed",
    actualNutritionUnchanged: "passed"
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ...result,
    status: "failed",
    reason: error instanceof Error ? error.message : "Mock planned meals contract failed.",
    checks
  }, null, 2));
  process.exit(1);
}

function overviewService({ plannedMealsService }) {
  return new overviewServiceModule.ConsumerTodayIntakeOverviewService({
    mealRecordsService: {
      listCurrentUserMealRecords: async () => ({
        ok: true,
        value: [
          {
            mealRecordId: "mock-actual-lunch",
            mealType: "lunch",
            occurredAt: "2026-07-13T04:30:00.000Z",
            mealDate: "2026-07-13",
            timezone: "Asia/Taipei",
            title: "實際午餐",
            note: null,
            source: "manual",
            createdAt: "2026-07-13T04:30:00.000Z",
            updatedAt: "2026-07-13T04:30:00.000Z",
            items: [
              {
                mealRecordItemId: "mock-actual-lunch-item",
                restaurantId: null,
                branchId: null,
                menuId: null,
                menuItemId: null,
                displayName: "雞肉飯",
                userEnteredName: null,
                aiDetectedName: null,
                normalizedName: null,
                portion: "1 bowl",
                nutrition: {
                  calories: 400,
                  protein: 30,
                  carbohydrates: 45,
                  fat: 10,
                  fiber: 4
                },
                nutritionSource: "manual",
                nutritionSchemaVersion: "test",
                sourceEntityVersion: null,
                occurredAt: "2026-07-13T04:30:00.000Z",
                timezone: "Asia/Taipei",
                confidenceScore: null,
                consumedRatio: 1,
                correctionStatus: "none",
                createdAt: "2026-07-13T04:30:00.000Z",
                updatedAt: "2026-07-13T04:30:00.000Z"
              }
            ]
          }
        ]
      })
    },
    dailyNutritionSummaryService: {
      getCurrentUserDailyNutritionSummary: async () => ({
        ok: false,
        error: { code: "daily_summary_source_unavailable" }
      })
    },
    plannedMealsService,
    clock: { now: () => new Date("2026-07-13T04:00:00.000Z") },
    mealRecordsSource: "mock",
    dailyNutritionSource: "mock",
    timezone: "Asia/Taipei"
  });
}

function copyFeatureTs(featureName) {
  const sourceDir = path.join(featureRoot, featureName);
  for (const file of walk(sourceDir, (candidate) => candidate.endsWith(".ts"))) {
    const rel = path.relative(sourceDir, file);
    const target = path.join(tempRoot, featureName, rel).replace(/\.ts$/, ".js");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const source = fs.readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true
      },
      fileName: file
    }).outputText;
    fs.writeFileSync(target, compiled);
  }
}

function walk(dir, predicate) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, predicate));
    if (entry.isFile() && predicate(full)) files.push(full);
  }
  return files;
}
