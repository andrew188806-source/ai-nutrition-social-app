import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const appDir = path.join(root, "apps", "mobile", "app");
const componentDir = path.join(root, "apps", "mobile", "components");
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test:consumer-phase2j", "test:consumer-phase2j-smoke", "test:consumer-phase2j-mock-smoke"]) {
  if (packageJson.scripts?.[scriptName]) pass(`${scriptName} package script exists`);
  else fail(`${scriptName} package script exists`, `Missing package script ${scriptName}.`);
}

const types = read("apps/mobile/features/consumer-meals/types.ts");
const inputTypeMatch = types.match(/export type PersistDailyNutritionSummaryInput = \{[\s\S]*?\};/);
const inputType = inputTypeMatch?.[0] ?? "";
if (/export type PersistDailyNutritionSummaryInput = \{\s*summaryDate: string;\s*\};/s.test(types)) {
  pass("persistence public input is summaryDate only");
} else {
  fail("persistence public input is summaryDate only", "Public input must not accept user id, access token, totals, or raw payloads.");
}
if (!/userId|profileId|accessToken|session|calories|protein|carbohydrates|fat|fiber|mealCount|itemCount/.test(inputType)) {
  pass("persistence public input has no identity, token, or nutrition fields");
} else {
  fail("persistence public input has no identity, token, or nutrition fields", "Caller must not provide identity, tokens, or nutrition totals.");
}

const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
if (/EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE/.test(flags) && /dailyNutritionWriteSource = parseDailyNutritionWriteSource\(env\.EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE/.test(flags)) {
  pass("daily nutrition write source flag is wired");
} else {
  fail("daily nutrition write source flag is wired", "Phase 2J source flag must be parsed through featureFlags.");
}
if (/function parseDailyNutritionWriteSource\(value: string \| undefined, issues: string\[\]\): ConsumerDailyNutritionWriteSource \{\s*if \(!value\) return "disabled"/.test(flags)) {
  pass("daily nutrition write source defaults to disabled");
} else {
  fail("daily nutrition write source defaults to disabled", "Default daily nutrition write source must be disabled.");
}
if (/"disabled"[\s\S]*"mock"[\s\S]*"supabase"/.test(flags) && /dailyNutritionWriteSource === "supabase"[\s\S]*development-only/.test(flags)) {
  pass("live source remains explicit and development-only after Phase 2K");
} else {
  fail("live source remains explicit and development-only after Phase 2K", "Phase 2K live summary persistence must remain explicitly gated and development-only.");
}

const service = read("apps/mobile/features/consumer-meals/consumerDailyNutritionSummaryPersistenceService.ts");
if (/calculateDailyNutritionSummary/.test(service) && /mealRecordsService\.listCurrentUserMealRecords/.test(service)) {
  pass("persistence service calculates from current-user meal records before persistence");
} else {
  fail("persistence service calculates from current-user meal records before persistence", "Service must read current-user meals and use Phase 2E calculator.");
}
if (!/storedNutrition|plannedMeals|consumptionAdjustments|corrections|dailyNutritionSummaryService/.test(service)) {
  pass("persistence service excludes stored summaries, planned meals, corrections, and adjustments");
} else {
  fail("persistence service excludes stored summaries, planned meals, corrections, and adjustments", "Phase 2J must calculate only from actual current-user meal records.");
}

const summaryPersistenceRepo = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts");
if (/persist_authenticated_daily_nutrition_summary|SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION/.test(summaryPersistenceRepo) && /buildPersistDailyNutritionSummaryRpcArgs/.test(summaryPersistenceRepo)) {
  pass("summary persistence adapter preserves Phase 2J RPC contract mapper");
} else {
  fail("summary persistence adapter preserves Phase 2J RPC contract mapper", "Daily summary persistence adapter must preserve the prepared RPC mapping contract.");
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
if (writeMatches.length) fail("no unapproved Consumer write methods", "Phase 2J must not add direct Consumer write methods.", { matches: writeMatches });
else pass("no unapproved Consumer write methods");

const rpcMatches = mealSourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /\.\s*rpc\s*\(/.test(text) && !rel.endsWith("supabaseConsumerMealRecordWriteRepository.ts") && !rel.endsWith("supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts"))
  .map(({ rel }) => rel);
if (rpcMatches.length) fail("approved Consumer RPC invocation boundaries", "Only the Phase 2D meal write adapter and Phase 2K daily summary persistence adapter may invoke RPC.", { matches: rpcMatches });
else pass("approved Consumer RPC invocation boundaries");

const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiPersistenceMatches = uiFiles
  .filter((file) => /DailyNutritionSummaryPersistence|persistCurrentUserDailyNutritionSummary|DAILY_NUTRITION_WRITE/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (uiPersistenceMatches.length) fail("no UI persistence imports or calls", "UI and navigation must not call Phase 2J persistence.", { matches: uiPersistenceMatches });
else pass("no UI persistence imports or calls");

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory includes only approved Phase 2K addition", { count: migrationFiles.length });
else fail("migration inventory includes only approved Phase 2K addition", "Migration inventory must contain only approved migrations through Phase 2K.", { migrationFiles, expectedMigrationFiles });

try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2j-smoke.mjs")], {
    cwd: root,
    env: { ...process.env, TASTKIND_CONSUMER_PHASE2J_MOCK_CONTRACT: "" },
    encoding: "utf8"
  });
  const parsed = JSON.parse(output);
  if (
    parsed.status === "skipped" &&
    parsed.supabaseClientCreated === false &&
    parsed.networkRequestUsed === false &&
    parsed.databaseReadUsed === false &&
    parsed.databaseWriteUsed === false &&
    parsed.rpcInvoked === false
  ) {
    pass("default Phase 2J smoke is skipped without client, network, read, write, or RPC");
  } else {
    fail("default Phase 2J smoke is skipped without client, network, read, write, or RPC", "Default smoke must remain inert.", { parsed });
  }
} catch (error) {
  fail("default Phase 2J smoke is skipped without client, network, read, write, or RPC", error instanceof Error ? error.message : String(error));
}

try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2j-mock-contract-smoke.mjs")], {
    cwd: root,
    encoding: "utf8"
  });
  const parsed = JSON.parse(output);
  if (
    parsed.status === "passed" &&
    parsed.deterministic === true &&
    parsed.supabaseClientCreated === false &&
    parsed.networkRequestUsed === false &&
    parsed.databaseWriteUsed === false &&
    parsed.rpcInvoked === false
  ) {
    pass("mock Phase 2J contract smoke is deterministic and local-only");
  } else {
    fail("mock Phase 2J contract smoke is deterministic and local-only", "Mock contract smoke must pass without client, network, write, or RPC.", { parsed });
  }
} catch (error) {
  fail("mock Phase 2J contract smoke is deterministic and local-only", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2J",
  reason: issues.length ? "Phase 2J guard failed" : "Controlled daily nutrition summary persistence preparation verified",
  checks,
  issues,
  supabaseClientCreated: false,
  networkRequestUsed: false,
  databaseReadUsed: false,
  databaseWriteUsed: false,
  rpcInvoked: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
