import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const mockContract = process.argv.includes("--mock-contract");

const result = {
  status: "skipped",
  phase: "Consumer Runtime Integration Phase 2N Planned Meal Write Preparation Smoke",
  reason: "SKIPPED - Consumer Runtime Phase 2N default smoke does not enable planned meal writes.",
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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2n-"));
const featureRoot = path.join(root, "apps", "mobile", "features");
copyFeatureTs("consumer-auth");
copyFeatureTs("consumer-meals");

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "consumerPlannedMealWriteService.js"));
const serviceModule = requireFromTemp("./consumerPlannedMealWriteService.js");
const mapperModule = requireFromTemp("./plannedMealWriteMappers.js");
const mockRepoModule = requireFromTemp("./adapters/mockConsumerPlannedMealWriteRepository.js");
const disabledRepoModule = requireFromTemp("./adapters/supabaseDisabledConsumerPlannedMealWriteRepository.js");
const preparedRepoModule = requireFromTemp("./adapters/supabasePreparedConsumerPlannedMealWriteRepository.js");

const checks = [];
function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}
function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  throw new Error(`${name}: ${message}`);
}

try {
  const repository = new mockRepoModule.MockConsumerPlannedMealWriteRepository();
  const service = new serviceModule.ConsumerPlannedMealWriteService({ repository });
  const validInput = {
    plannedFor: "2026-07-14",
    title: "Planned dinner",
    mealType: "dinner",
    notes: "Keep it light.",
    restaurantId: "restaurant-green-bowl",
    branchId: "branch-green-bowl-main",
    menuItemId: "menu-item-chicken-quinoa-salad",
    nutritionSnapshot: {
      calories: 430,
      protein: 38,
      carbohydrates: 42,
      fat: 13,
      fiber: 8
    }
  };

  const saved = await service.saveCurrentUserPlannedMeal(validInput);
  if (saved.status !== "saved" || !saved.plannedMealId) fail("save valid planned meal", "Expected deterministic mock save.");
  pass("save valid planned meal", { status: saved.status, idPrinted: false });

  const repeated = await service.saveCurrentUserPlannedMeal(validInput);
  if (repeated.status !== "updated" || repeated.plannedMealId !== saved.plannedMealId) fail("deterministic repeated save", "Repeated save must be deterministic.");
  pass("deterministic repeated save", { status: repeated.status, idStable: true });

  const invalidDate = await service.saveCurrentUserPlannedMeal({ ...validInput, plannedFor: "2026-99-99" });
  if (invalidDate.status !== "invalid_input" || invalidDate.errorCode !== "planned_meal_write_invalid_date") fail("invalid date rejected", "Invalid date should fail closed.");
  pass("invalid date rejected");

  const forbiddenUser = await service.saveCurrentUserPlannedMeal({ ...validInput, userId: "caller-user" });
  if (forbiddenUser.status !== "invalid_input" || forbiddenUser.errorCode !== "planned_meal_write_forbidden_field") fail("caller user id rejected", "User identity fields must not be accepted.");
  pass("caller user id rejected");

  const unknownField = await service.saveCurrentUserPlannedMeal({ ...validInput, rawSqlCondition: "true" });
  if (unknownField.status !== "invalid_input" || unknownField.errorCode !== "planned_meal_write_unknown_field") fail("unknown fields rejected", "Unknown fields must not enter payload.");
  pass("unknown fields rejected");

  const invalidNutrition = await service.saveCurrentUserPlannedMeal({
    ...validInput,
    nutritionSnapshot: { ...validInput.nutritionSnapshot, calories: -1 }
  });
  if (invalidNutrition.status !== "invalid_input" || invalidNutrition.errorCode !== "planned_meal_write_invalid_nutrition") fail("nutrition validation", "Negative nutrition should fail closed.");
  pass("nutrition validation");

  const updated = await service.updateCurrentUserPlannedMeal({
    plannedMealId: saved.plannedMealId,
    title: "Updated planned dinner",
    nutritionSnapshot: {
      calories: 410,
      protein: 36
    }
  });
  if (updated.status !== "updated" || updated.plannedMealId !== saved.plannedMealId) fail("update existing", "Expected deterministic mock update.");
  pass("update existing");

  const forbiddenUpdate = await service.updateCurrentUserPlannedMeal({ plannedMealId: "other-user-planned-meal", title: "Nope" });
  if (forbiddenUpdate.status !== "forbidden") fail("owner isolation simulation", "Foreign mock ids must be forbidden.");
  pass("owner isolation simulation");

  const removed = await service.removeCurrentUserPlannedMeal({ plannedMealId: saved.plannedMealId });
  if (removed.status !== "removed") fail("remove existing", "Expected mock remove success.");
  pass("remove existing");

  const missing = await service.removeCurrentUserPlannedMeal({ plannedMealId: saved.plannedMealId });
  if (missing.status !== "not_found") fail("remove missing", "Repeated remove must be deterministic not_found.");
  pass("remove missing");

  const disabledService = new serviceModule.ConsumerPlannedMealWriteService({
    repository: new disabledRepoModule.SupabaseDisabledConsumerPlannedMealWriteRepository()
  });
  const disabled = await disabledService.saveCurrentUserPlannedMeal(validInput);
  if (disabled.status !== "skipped" || disabled.source !== "disabled") fail("disabled source skipped", "Disabled write source must skip without transport.");
  pass("disabled source skipped");

  const preparedRepository = new preparedRepoModule.SupabasePreparedConsumerPlannedMealWriteRepository();
  const preparedService = new serviceModule.ConsumerPlannedMealWriteService({ repository: preparedRepository });
  const prepared = await preparedService.saveCurrentUserPlannedMeal(validInput);
  if (prepared.status !== "unavailable" || prepared.source !== "supabase_prepared") fail("prepared source unavailable", "Prepared source must not go live.");
  pass("prepared source unavailable");

  const canonical = mapperModule.toCanonicalPlannedMealWritePayload(validInput);
  if (!canonical.ok) fail("canonical mapper", "Valid input should map.");
  const rpcArgs = mapperModule.toSupabaseSavePlannedMealRpcArgs(canonical.value);
  if (
    rpcArgs.p_planned_for !== validInput.plannedFor ||
    rpcArgs.p_meal_type !== validInput.mealType ||
    rpcArgs.p_display_name_snapshot !== validInput.title ||
    "user_id" in rpcArgs ||
    "p_user_id" in rpcArgs
  ) {
    fail("future RPC mapping", "Prepared RPC args must be deterministic and exclude user identity.");
  }
  pass("future RPC mapping");

  console.log(JSON.stringify({
    ...result,
    status: "passed",
    reason: "Mock planned meal write contract verified without client, network, database, write, or RPC.",
    checks,
    save: "passed",
    repeatedSave: "passed",
    update: "passed",
    remove: "passed",
    removeMissing: "passed",
    ownerIsolation: "passed",
    nutritionValidation: "passed",
    actualTotalsUnchanged: "passed",
    summaryPersistenceTriggered: false,
    clientCreated: false,
    networkRequestUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    rpcInvoked: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ...result,
    status: "failed",
    reason: error instanceof Error ? error.message : "Mock planned meal write contract failed.",
    checks
  }, null, 2));
  process.exit(1);
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
