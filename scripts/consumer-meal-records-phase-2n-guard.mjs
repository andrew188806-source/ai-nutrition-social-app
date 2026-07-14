import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const appDir = path.join(root, "apps", "mobile", "app");
const componentDir = path.join(root, "apps", "mobile", "components");
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

for (const rel of [
  "apps/mobile/features/consumer-meals/consumerPlannedMealWriteService.ts",
  "apps/mobile/features/consumer-meals/plannedMealWriteMappers.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseDisabledConsumerPlannedMealWriteRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealWriteRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerPlannedMealWriteRepository.ts",
  "scripts/consumer-meal-records-phase-2n-smoke.mjs"
]) {
  if (fs.existsSync(path.join(root, rel))) pass(`required Phase 2N file exists: ${rel}`);
  else fail(`required Phase 2N file exists: ${rel}`, "Missing planned meal write preparation file.");
}

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
// Phase 2O adds one migration beyond 2N's expected list. Allow either the 2N-only set or the 2N+2O set.
const phase2OMigration = "20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql";
const expectedWith2O = [...expectedMigrationFiles, phase2OMigration];
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory at Phase 2N baseline", { count: migrationFiles.length });
else if (JSON.stringify(migrationFiles) === JSON.stringify(expectedWith2O)) pass("migration inventory at Phase 2O (2N baseline + 2O write function migration)", { count: migrationFiles.length });
else fail("migration inventory unchanged from Phase 2M or updated for Phase 2O only", "Phase 2N must not add migrations other than Phase 2O planned meal write functions.", { migrationFiles, expectedMigrationFiles });

const types = read("apps/mobile/features/consumer-meals/types.ts");
// Phase 2O supersedes the supabase_prepared write source with supabase. Allow either the 2N or 2O type definition.
const writeSourceLine = types.match(/ConsumerPlannedMealsWriteSource\s*=\s*[^\n]+/)?.[0] ?? "";
const has2NWriteSources = /supabase_prepared/.test(writeSourceLine);
const has2OWriteSources = /"supabase"/.test(writeSourceLine) && !/"supabase_prepared"/.test(writeSourceLine);
if (has2NWriteSources || has2OWriteSources) pass("planned meal write source values are controlled (Phase 2N or 2O)");
else fail("planned meal write source values are controlled (Phase 2N or 2O)", "Write source type must be either 2N (supabase_prepared) or 2O (supabase).");
if (/SaveCurrentUserPlannedMealInput/.test(types) && /UpdateCurrentUserPlannedMealInput/.test(types) && /RemoveCurrentUserPlannedMealInput/.test(types)) pass("canonical planned meal write inputs exist");
else fail("canonical planned meal write inputs exist", "Missing save/update/remove input contracts.");
const inputContracts = [
  types.match(/export type SaveCurrentUserPlannedMealInput[\s\S]*?};/)?.[0] ?? "",
  types.match(/export type UpdateCurrentUserPlannedMealInput[\s\S]*?};/)?.[0] ?? "",
  types.match(/export type RemoveCurrentUserPlannedMealInput[\s\S]*?};/)?.[0] ?? ""
].join("\n");
if (!/\b(userId|ownerId|profileId|session|accessToken|refreshToken|rawRow)\b/.test(inputContracts)) pass("planned meal write inputs exclude identity, session, token, and raw row fields");
else fail("planned meal write inputs exclude identity, session, token, and raw row fields", "Public write inputs must not accept ownership or raw transport fields.");
if (/ConsumerPlannedMealWriteResult/.test(types) && /saved/.test(types) && /updated/.test(types) && /removed/.test(types) && /not_found/.test(types) && /forbidden/.test(types)) pass("canonical write result union exists");
else fail("canonical write result union exists", "Write result must be typed and non-boolean.");

const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
// Phase 2O replaces supabase_prepared with supabase in the valid write source set. Allow either 2N or 2O set.
const hasWriteSourceFlag = /EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE/.test(flags);
const has2NFlagSet = /\["disabled", "mock", "supabase_prepared"\]/.test(flags);
const has2OFlagSet = /\["disabled", "mock", "supabase"\]/.test(flags);
if (hasWriteSourceFlag && (has2NFlagSet || has2OFlagSet)) pass("write source flag exists and controls live supabase access");
else fail("write source flag exists and controls live supabase access", "Missing planned meal write source flag.");
if (/if \(!value\) return "disabled"/.test(flags) && /Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE/.test(flags)) pass("write source defaults disabled and unknown fails closed");
else fail("write source defaults disabled and unknown fails closed", "Planned meal write source must default disabled and reject unknown values.");

const mapper = read("apps/mobile/features/consumer-meals/plannedMealWriteMappers.ts");
if (/forbiddenKeys/.test(mapper) && /planned_meal_write_forbidden_field/.test(mapper) && /planned_meal_write_unknown_field/.test(mapper)) pass("mapper rejects caller identity and unknown fields");
else fail("mapper rejects caller identity and unknown fields", "Mapper must reject unsafe fields.");
if (/Number\.isFinite/.test(mapper) && /raw < 0/.test(mapper) && /planned_meal_write_invalid_nutrition/.test(mapper)) pass("nutrition snapshot is finite and non-negative");
else fail("nutrition snapshot is finite and non-negative", "Nutrition snapshot must reject NaN, Infinity, and negative values.");
if (/toSupabaseSavePlannedMealRpcArgs/.test(mapper) && !/\bp_user_id\b|\buser_id\b/.test(mapper.match(/export function toSupabaseSavePlannedMealRpcArgs[\s\S]*?}\n/)?.[0] ?? "")) pass("future save RPC args exclude caller user id");
else fail("future save RPC args exclude caller user id", "Future planned meal RPC args must not include caller-provided user identity.");

const service = read("apps/mobile/features/consumer-meals/consumerPlannedMealWriteService.ts");
if (/saveCurrentUserPlannedMeal/.test(service) && /updateCurrentUserPlannedMeal/.test(service) && /removeCurrentUserPlannedMeal/.test(service)) pass("write service exposes save/update/remove methods");
else fail("write service exposes save/update/remove methods", "Write service must prepare all planned operations.");
if (!/ConsumerTodayIntakeOverview|DailyNutritionSummary|MealRecordWrite/.test(service)) pass("write service excludes shared overview, daily summary, and meal record write side effects");
else fail("write service excludes shared overview, daily summary, and meal record write side effects", "Planned meal write service must stay scoped.");

const disabledRepo = read("apps/mobile/features/consumer-meals/adapters/supabaseDisabledConsumerPlannedMealWriteRepository.ts");
if (/status:\s*"skipped"/.test(disabledRepo) && !/\.\s*(from|rpc|insert|upsert|update|delete)\s*\(/.test(disabledRepo)) pass("disabled repository skips without transport");
else fail("disabled repository skips without transport", "Disabled source must not create transport or write.");

const mockRepo = read("apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealWriteRepository.ts");
if (/deterministicPlannedMealId/.test(mockRepo) && /not_found/.test(mockRepo) && /forbidden/.test(mockRepo)) pass("mock repository is deterministic with not_found and forbidden semantics");
else fail("mock repository is deterministic with not_found and forbidden semantics", "Mock repository must cover local write semantics.");
if (!/\bMath\.random\b|crypto\.randomUUID|Date\.now|new Date\(/.test(mockRepo)) pass("mock repository uses no randomness or current time");
else fail("mock repository uses no randomness or current time", "Mock writes must be deterministic.");

const preparedRepo = read("apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerPlannedMealWriteRepository.ts");
if (/save_authenticated_planned_meal|SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(preparedRepo) && /planned_meal_write_prepared_not_live/.test(preparedRepo)) pass("prepared repository records future RPC contracts and returns unavailable");
else fail("prepared repository records future RPC contracts and returns unavailable", "Prepared repository must map future RPC contracts but not go live.");
if (!/\.\s*(from|rpc|insert|upsert|update|delete)\s*\(/.test(preparedRepo) && !/createClient|@supabase\/supabase-js/.test(preparedRepo)) pass("prepared repository performs no client, network, database, or RPC operation");
else fail("prepared repository performs no client, network, database, or RPC operation", "Prepared source must not invoke transport in Phase 2N.");

const factory = read("apps/mobile/features/consumer-meals/factories.ts");
if (/createConsumerPlannedMealWriteService/.test(factory) && /createConsumerPlannedMealWriteRepository/.test(factory)) pass("factory exposes planned meal write service and repository");
else fail("factory exposes planned meal write service and repository", "Missing planned meal write factory.");
// Phase 2O replaces supabase_prepared with supabase in the factory. Allow either 2N or 2O factory shape.
const has2NFactoryShape = /plannedMealsWriteSource === "mock"/.test(factory) && /plannedMealsWriteSource === "supabase_prepared"/.test(factory) && /SupabaseDisabledConsumerPlannedMealWriteRepository/.test(factory);
const has2OFactoryShape = /plannedMealsWriteSource === "mock"/.test(factory) && /plannedMealsWriteSource === "supabase"/.test(factory) && /SupabaseDisabledConsumerPlannedMealWriteRepository/.test(factory);
if (has2NFactoryShape || has2OFactoryShape) pass("factory selects controlled planned write sources");
else fail("factory selects controlled planned write sources", "Factory must select planned write sources explicitly.");

const mealFiles = walk(mealRoot, (file) => file.endsWith(".ts")).map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const plannedWriteFiles = mealFiles.filter(({ rel, text }) => /PlannedMealWrite|plannedMealWrite|PLANNED_MEALS_WRITE|save_authenticated_planned_meal|remove_authenticated_planned_meal/.test(rel + text));
const transportWriteFiles = plannedWriteFiles.filter(({ rel }) => /supabase|Supabase|prepared|Prepared/.test(rel));
const forbiddenWriteMatches = transportWriteFiles.filter(({ text }) => /\.\s*(insert|upsert|update|delete)\s*\(/.test(text)).map(({ rel }) => rel);
if (forbiddenWriteMatches.length) fail("planned meal write preparation has no direct table writes", "Phase 2N must not call direct write methods.", { matches: forbiddenWriteMatches });
else pass("planned meal write preparation has no direct table writes");
// Phase 2O adds a live adapter that calls .rpc(). Exclude the Phase 2O live repo file from the 2N RPC-free check.
const phase2NRpcFiles = plannedWriteFiles.filter(({ rel, text }) => /\.\s*rpc\s*\(/.test(text) && !/supabaseConsumerPlannedMealWriteRepository/.test(rel));
if (phase2NRpcFiles.length) fail("planned meal write preparation invokes no RPC (Phase 2N files only)", "Phase 2N files must not call RPC.", { matches: phase2NRpcFiles.map(({ rel }) => rel) });
else pass("planned meal write preparation invokes no RPC (Phase 2N files only)");
const secretMatches = plannedWriteFiles.filter(({ text }) => /service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(text)).map(({ rel }) => rel);
if (secretMatches.length) fail("planned meal write preparation has no privileged credential references", "No service-role or secret references are allowed.", { matches: secretMatches });
else pass("planned meal write preparation has no privileged credential references");

const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiMatches = uiFiles
  .filter((file) => /ConsumerPlannedMealWrite|createConsumerPlannedMealWrite|PLANNED_MEALS_WRITE|saveCurrentUserPlannedMeal|removeCurrentUserPlannedMeal/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (uiMatches.length) fail("Mobile UI and navigation do not import planned meal write runtime", "Phase 2N must not wire UI/routes/navigation.", { matches: uiMatches });
else pass("Mobile UI and navigation do not import planned meal write runtime");

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test:consumer-phase2n", "test:consumer-phase2n-smoke", "test:consumer-phase2n-mock-smoke"]) {
  if (packageJson.scripts?.[scriptName]) pass(`${scriptName} package script exists`);
  else fail(`${scriptName} package script exists`, `Missing package script ${scriptName}.`);
}

try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2n-smoke.mjs")], { cwd: root, encoding: "utf8" });
  const parsed = JSON.parse(output);
  if (parsed.status === "skipped" && parsed.clientCreated === false && parsed.networkRequestUsed === false && parsed.databaseReadUsed === false && parsed.databaseWriteUsed === false && parsed.rpcInvoked === false) {
    pass("default Phase 2N smoke is skipped without client, network, read, write, or RPC");
  } else {
    fail("default Phase 2N smoke is skipped without client, network, read, write, or RPC", "Default smoke must remain inert.", { parsed });
  }
} catch (error) {
  fail("default Phase 2N smoke is skipped without client, network, read, write, or RPC", error instanceof Error ? error.message : String(error));
}

try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2n-smoke.mjs"), "--mock-contract"], { cwd: root, encoding: "utf8" });
  const parsed = JSON.parse(output);
  if (parsed.status === "passed" && parsed.databaseWriteUsed === false && parsed.rpcInvoked === false && parsed.actualTotalsUnchanged === "passed" && parsed.summaryPersistenceTriggered === false) {
    pass("mock Phase 2N contract smoke passes locally");
  } else {
    fail("mock Phase 2N contract smoke passes locally", "Mock contract smoke must verify local-only planned meal write semantics.", { parsed });
  }
} catch (error) {
  fail("mock Phase 2N contract smoke passes locally", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2N",
  reason: issues.length ? "Phase 2N guard failed" : "Controlled planned meal write preparation verified",
  checks,
  issues,
  clientCreated: false,
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
