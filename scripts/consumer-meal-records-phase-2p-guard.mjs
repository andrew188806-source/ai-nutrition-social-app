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
  "20260713080100_consumer_schema_phase_1_3_authenticated_planned_meal_read_grant.sql",
  "20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql"
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

// Required Phase 2P files
for (const rel of [
  "apps/mobile/features/consumer-meals/consumerMealCorrectionService.ts",
  "apps/mobile/features/consumer-meals/adapters/disabledConsumerMealCorrectionRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerMealCorrectionRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerMealCorrectionRepository.ts",
  "scripts/consumer-meal-records-phase-2p-smoke.mjs"
]) {
  if (fs.existsSync(path.join(root, rel))) pass(`required Phase 2P file exists: ${rel}`);
  else fail(`required Phase 2P file exists: ${rel}`, "Missing Phase 2P meal correction file.");
}

// Migration inventory unchanged (no new migration in Phase 2P)
const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged at Phase 2O baseline (no Phase 2P migration)", { count: migrationFiles.length });
else fail("migration inventory unchanged at Phase 2O baseline (no Phase 2P migration)", "Phase 2P must not add migrations. Read grant for meal_analyses and meal_corrections is a future phase.", { migrationFiles, expectedMigrationFiles });

// types.ts — correction type contracts
const types = read("apps/mobile/features/consumer-meals/types.ts");
if (/ConsumerMealCorrectionSource\s*=\s*"disabled"\s*\|\s*"mock"\s*\|\s*"supabase-prepared"/.test(types)) pass("ConsumerMealCorrectionSource type is disabled/mock/supabase-prepared");
else fail("ConsumerMealCorrectionSource type is disabled/mock/supabase-prepared", "Correction source must have exactly three values: disabled, mock, supabase-prepared.");
if (/correctionType:\s*"nutrition_override"/.test(types) && /correctionType:\s*"ingredient_adjustment"/.test(types) && /correctionType:\s*"unknown"/.test(types)) pass("ConsumerMealCorrectionDetail discriminated union has nutrition_override, ingredient_adjustment, and unknown variants");
else fail("ConsumerMealCorrectionDetail discriminated union has nutrition_override, ingredient_adjustment, and unknown variants", "Correction detail must be a discriminated union with at least nutrition_override, ingredient_adjustment, and unknown.");
if (/ConsumerMealCorrectionItemOverview/.test(types) && /correctionStatus:\s*ConsumerMealCorrectionStatus/.test(types) && /correction:\s*ConsumerMealCorrectionDetail\s*\|/.test(types)) pass("ConsumerMealCorrectionItemOverview has correctionStatus and nullable correction detail");
else fail("ConsumerMealCorrectionItemOverview has correctionStatus and nullable correction detail", "Item overview must include correctionStatus and correction union.");
if (/ConsumerMealCorrectionOverview/.test(types) && /mealRecordId/.test(types) && /hasAnyCorrections/.test(types) && /correctionReadSource/.test(types)) pass("ConsumerMealCorrectionOverview has mealRecordId, hasAnyCorrections, correctionReadSource");
else fail("ConsumerMealCorrectionOverview has mealRecordId, hasAnyCorrections, correctionReadSource", "Correction overview must include mealRecordId, hasAnyCorrections, and correctionReadSource.");
if (/status:\s*"available"/.test(types) && /status:\s*"disabled"/.test(types) && /status:\s*"grant_pending"/.test(types) && /status:\s*"unauthenticated"/.test(types)) pass("ConsumerMealCorrectionReadResult discriminated union includes available/disabled/grant_pending/unauthenticated");
else fail("ConsumerMealCorrectionReadResult discriminated union includes available/disabled/grant_pending/unauthenticated", "Read result must be a discriminated union with at least available, disabled, grant_pending, and unauthenticated.");
if (/interface ConsumerMealCorrectionRepository/.test(types) && /getCurrentUserMealCorrectionOverview/.test(types)) pass("ConsumerMealCorrectionRepository interface with getCurrentUserMealCorrectionOverview exists");
else fail("ConsumerMealCorrectionRepository interface with getCurrentUserMealCorrectionOverview exists", "Correction repository interface must declare getCurrentUserMealCorrectionOverview.");
if (/correctionSource:\s*ConsumerMealCorrectionSource/.test(types)) pass("correctionSource in ConsumerMealRuntimeFlags");
else fail("correctionSource in ConsumerMealRuntimeFlags", "ConsumerMealRuntimeFlags must include correctionSource.");

// featureFlags.ts — correction source flag
const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
if (/EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE/.test(flags)) pass("featureFlags parses EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE");
else fail("featureFlags parses EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE", "featureFlags.ts must parse the correction source env var.");
if (/correctionSources\s*=\s*new Set/.test(flags) && /disabled/.test(flags) && /supabase-prepared/.test(flags)) pass("correction source Set includes disabled and supabase-prepared");
else fail("correction source Set includes disabled and supabase-prepared", "Correction source Set must include disabled, mock, and supabase-prepared.");
if (/if \(!value\) return "disabled"/.test(flags) && /Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE/.test(flags)) pass("correction source defaults disabled and unknown fails closed");
else fail("correction source defaults disabled and unknown fails closed", "Correction source must default to disabled and reject unknown values.");
if (/correctionSource,/.test(flags) || /correctionSource\n/.test(flags)) pass("correctionSource included in getConsumerMealRuntimeFlags return");
else fail("correctionSource included in getConsumerMealRuntimeFlags return", "getConsumerMealRuntimeFlags must return correctionSource.");

// supabaseMealContracts.ts — correction table contracts
const contracts = read("apps/mobile/features/consumer-meals/supabaseMealContracts.ts");
if (/SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE\s*=\s*"meal_analyses"/.test(contracts)) pass("meal_analyses table constant defined");
else fail("meal_analyses table constant defined", "SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE must be 'meal_analyses'.");
if (/SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE\s*=\s*"meal_corrections"/.test(contracts)) pass("meal_corrections table constant defined");
else fail("meal_corrections table constant defined", "SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE must be 'meal_corrections'.");
if (/SupabaseMealAnalysisRowLike/.test(contracts) && /meal_record_id/.test(contracts)) pass("SupabaseMealAnalysisRowLike type includes meal_record_id");
else fail("SupabaseMealAnalysisRowLike type includes meal_record_id", "Analysis row type must include meal_record_id for future join.");
if (/SupabaseMealCorrectionRowLike/.test(contracts) && /meal_analysis_id/.test(contracts) && /correction_type/.test(contracts)) pass("SupabaseMealCorrectionRowLike type includes meal_analysis_id and correction_type");
else fail("SupabaseMealCorrectionRowLike type includes meal_analysis_id and correction_type", "Correction row type must include meal_analysis_id and correction_type.");

// Disabled repository
const disabledRepo = read("apps/mobile/features/consumer-meals/adapters/disabledConsumerMealCorrectionRepository.ts");
if (/status:\s*"disabled"/.test(disabledRepo) && !/\.\s*(from|rpc|insert|upsert|update|delete)\s*\(/.test(disabledRepo)) pass("disabled correction repository returns disabled without transport");
else fail("disabled correction repository returns disabled without transport", "Disabled repository must return disabled status without any DB or transport calls.");

// Mock repository
const mockRepo = read("apps/mobile/features/consumer-meals/adapters/mockConsumerMealCorrectionRepository.ts");
if (/MOCK_CORRECTED_MEAL_RECORD_ID/.test(mockRepo) && /status:\s*"available"/.test(mockRepo) && /status:\s*"empty"/.test(mockRepo)) pass("mock correction repository is deterministic with available and empty semantics");
else fail("mock correction repository is deterministic with available and empty semantics", "Mock repository must return available for known ID and empty for unknown.");
if (/correctionType:\s*"nutrition_override"/.test(mockRepo) && /correctionStatus:\s*"confirmed"/.test(mockRepo)) pass("mock repository returns canonical correction detail with confirmed status");
else fail("mock repository returns canonical correction detail with confirmed status", "Mock data must include a confirmed nutrition_override correction.");
if (!/\bMath\.random\b|crypto\.randomUUID|Date\.now\b|new Date\(/.test(mockRepo)) pass("mock correction repository uses no randomness or current time");
else fail("mock correction repository uses no randomness or current time", "Mock corrections must be deterministic.");

// Supabase-prepared repository
const preparedRepo = read("apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerMealCorrectionRepository.ts");
if (/SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE/.test(preparedRepo) && /SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE/.test(preparedRepo)) pass("prepared repository references future correction query tables");
else fail("prepared repository references future correction query tables", "Prepared repository must reference the meal_analyses and meal_corrections table constants.");
if (/grant_pending/.test(preparedRepo) && /correction_read_grant_pending/.test(preparedRepo)) pass("prepared repository returns grant_pending with correction_read_grant_pending error code");
else fail("prepared repository returns grant_pending with correction_read_grant_pending error code", "Prepared repository must return grant_pending until a read grant migration is added.");
if (!/\.\s*(from|rpc|insert|upsert|update|delete)\s*\(/.test(preparedRepo) && !/createClient|@supabase\/supabase-js/.test(preparedRepo)) pass("prepared repository performs no DB client, table, or RPC operation");
else fail("prepared repository performs no DB client, table, or RPC operation", "Prepared repository must not invoke any Supabase transport in Phase 2P.");

// No write operations in any correction adapter
const correctionAdapters = [
  "apps/mobile/features/consumer-meals/adapters/disabledConsumerMealCorrectionRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerMealCorrectionRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerMealCorrectionRepository.ts"
];
const correctionWriteMatches = correctionAdapters.filter((rel) => /\.\s*(insert|upsert|update|delete)\s*\(/.test(read(rel)));
if (correctionWriteMatches.length) fail("no direct writes in correction adapters", "Correction adapters must not call insert/upsert/update/delete.", { matches: correctionWriteMatches });
else pass("no direct writes in correction adapters");

// No Service Role in any correction adapter
const correctionSecretMatches = correctionAdapters.filter((rel) => /service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(read(rel)));
if (correctionSecretMatches.length) fail("no privileged credential references in correction adapters", "Correction adapters must not reference privileged credentials.", { matches: correctionSecretMatches });
else pass("no privileged credential references in correction adapters");

// No correction write methods anywhere in consumer-meals source
const mealFiles = walk(mealRoot, (file) => file.endsWith(".ts")).map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const correctionWriteSourceMatches = mealFiles
  .filter(({ rel, text }) => /correction/i.test(rel + text) && /\.\s*(insert|upsert|update|delete)\s*\(/.test(text))
  .map(({ rel }) => rel);
if (correctionWriteSourceMatches.length) fail("no correction write methods in consumer-meals source", "Phase 2P must not implement correction writes.", { matches: correctionWriteSourceMatches });
else pass("no correction write methods in consumer-meals source");

// factories.ts — correction factory
const factory = read("apps/mobile/features/consumer-meals/factories.ts");
if (/createConsumerMealCorrectionRepository/.test(factory) && /createConsumerMealCorrectionService/.test(factory)) pass("factory exposes correction repository and service factories");
else fail("factory exposes correction repository and service factories", "factories.ts must export createConsumerMealCorrectionRepository and createConsumerMealCorrectionService.");
if (/correctionSource === "mock"/.test(factory) && /correctionSource === "supabase-prepared"/.test(factory) && /DisabledConsumerMealCorrectionRepository/.test(factory)) pass("factory selects disabled/mock/prepared correction sources");
else fail("factory selects disabled/mock/prepared correction sources", "Factory must instantiate each of the three correction source repositories.");

// No UI wiring for correction runtime
const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiMatches = uiFiles
  .filter((file) => /ConsumerMealCorrectionRepository|createConsumerMealCorrection|MEAL_CORRECTION_SOURCE|getCurrentUserMealCorrectionOverview/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (uiMatches.length) fail("Mobile UI does not import correction runtime internals", "Phase 2P must not wire UI/routes/navigation to correction runtime.", { matches: uiMatches });
else pass("Mobile UI does not import correction runtime internals");

// Package scripts
const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test:consumer-phase2p", "test:consumer-phase2p-smoke", "test:consumer-phase2p-mock-smoke"]) {
  if (packageJson.scripts?.[scriptName]) pass(`${scriptName} package script exists`);
  else fail(`${scriptName} package script exists`, `Missing package script ${scriptName}.`);
}

// Default smoke is SKIPPED
try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2p-smoke.mjs")], { cwd: root, encoding: "utf8" });
  const parsed = JSON.parse(output);
  if (
    parsed.status === "skipped" &&
    parsed.clientCreated === false &&
    parsed.networkRequestUsed === false &&
    parsed.databaseReadUsed === false &&
    parsed.databaseWriteUsed === false &&
    parsed.rpcInvoked === false
  ) {
    pass("default Phase 2P smoke is skipped without client, network, read, write, or RPC");
  } else {
    fail("default Phase 2P smoke is skipped without client, network, read, write, or RPC", "Default smoke must remain inert.", { parsed });
  }
} catch (error) {
  fail("default Phase 2P smoke is skipped without client, network, read, write, or RPC", error instanceof Error ? error.message : String(error));
}

// Mock-contract smoke passes
try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2p-smoke.mjs"), "--mock-contract"], { cwd: root, encoding: "utf8" });
  const parsed = JSON.parse(output);
  if (
    parsed.status === "passed" &&
    parsed.databaseReadUsed === false &&
    parsed.databaseWriteUsed === false &&
    parsed.rpcInvoked === false &&
    parsed.correctionOverviewShape === "passed" &&
    parsed.discriminatedUnionShape === "passed" &&
    parsed.disabledRepositoryReturnsDisabled === "passed" &&
    parsed.preparedRepositoryReturnsGrantPending === "passed"
  ) {
    pass("mock-contract Phase 2P smoke passes with canonical correction overview shape");
  } else {
    fail("mock-contract Phase 2P smoke passes with canonical correction overview shape", "Mock-contract smoke must verify canonical correction architecture.", { parsed });
  }
} catch (error) {
  fail("mock-contract Phase 2P smoke passes with canonical correction overview shape", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2P",
  reason: issues.length ? "Phase 2P guard failed" : "Meal correction canonical architecture verified statically",
  checks,
  issues,
  defaultSmokeSkipped: true,
  databaseWriteUsedByGuard: false,
  rpcInvokedByGuard: false,
  sqlExecutedByGuard: false,
  migrationCreatedByGuard: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  correctionGrantPending: true,
  correctionReadGrantMigrationRequired: "meal_analyses and meal_corrections require an authenticated SELECT grant before supabase-live correction reads are possible"
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
