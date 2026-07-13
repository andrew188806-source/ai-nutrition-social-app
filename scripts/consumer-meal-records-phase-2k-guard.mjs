import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const appDir = path.join(root, "apps", "mobile", "app");
const componentDir = path.join(root, "apps", "mobile", "components");
const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const migrationsDir = path.join(root, "supabase", "migrations");
const phase2kMigrationName = "20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql";
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
  phase2kMigrationName,
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

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory includes exactly approved Phase 2K migration", { count: migrationFiles.length });
else fail("migration inventory includes exactly approved Phase 2K migration", "Unexpected active migration inventory.", { migrationFiles, expectedMigrationFiles });

const migration = read(`supabase/migrations/${phase2kMigrationName}`);
const migrationFlat = migration.replace(/\s+/g, " ").trim().toLowerCase();
if (/create or replace function public\.persist_authenticated_daily_nutrition_summary\(/i.test(migration)) pass("Phase 2K RPC migration creates expected function");
else fail("Phase 2K RPC migration creates expected function", "Migration must create persist_authenticated_daily_nutrition_summary.");
if (/security definer/i.test(migration) && /set search_path = public, pg_temp/i.test(migration)) pass("RPC uses security definer with fixed search_path");
else fail("RPC uses security definer with fixed search_path", "RPC must use security definer and fixed search_path.");
if (/v_user_id uuid := auth\.uid\(\)/i.test(migration) && !/p_user_id|user_id uuid/.test(migration.split(")")[0])) pass("RPC derives identity from auth.uid and accepts no user id");
else fail("RPC derives identity from auth.uid and accepts no user id", "RPC must not accept caller-provided user identity.");
if (/on conflict \(user_id, local_date, timezone, calculation_version\) where is_current = true do update set/i.test(migrationFlat)) pass("RPC atomically upserts by current user/date identity");
else fail("RPC atomically upserts by current user/date identity", "RPC must use atomic insert-or-update on the current summary unique identity.");
if (/raise exception 'AUTHENTICATION_REQUIRED'/i.test(migration)) pass("RPC rejects unauthenticated callers");
else fail("RPC rejects unauthenticated callers", "RPC must reject missing auth.uid().");
if (/grant execute on function public\.persist_authenticated_daily_nutrition_summary/i.test(migration) && /\) to authenticated;/i.test(migration)) pass("authenticated has minimal execute grant");
else fail("authenticated has minimal execute grant", "Migration must grant function execute to authenticated.");
if (/revoke all on function public\.persist_authenticated_daily_nutrition_summary[\s\S]*from anon;/i.test(migration)) pass("anon execute revoked");
else fail("anon execute revoked", "Migration must revoke function execute from anon.");
if (/grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.daily_nutrition_summaries/i.test(migration)) fail("no direct summary table write grant", "Phase 2K must not grant direct summary table writes.");
else pass("no direct summary table write grant");
if (/revoke insert, update, delete on table public\.daily_nutrition_summaries from authenticated/i.test(migration)) pass("direct authenticated summary table writes remain revoked");
else fail("direct authenticated summary table writes remain revoked", "Migration must keep direct table writes revoked.");
if (/planned_meals|meal_corrections|meal_consumption_adjustments|user_restaurant_ratings|favorite_restaurants|recommendation_feedback/i.test(migration)) fail("migration excludes unrelated consumer domains", "Phase 2K migration must not touch planned/corrections/adjustments/ratings/favorites/recommendations.");
else pass("migration excludes unrelated consumer domains");
if (/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/i.test(migration)) fail("migration contains no privileged credential references", "Migration must not reference service-role or secret credentials.");
else pass("migration contains no privileged credential references");

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test:consumer-phase2k", "test:consumer-phase2k-smoke", "test:consumer-phase2k-live-smoke"]) {
  if (packageJson.scripts?.[scriptName]) pass(`${scriptName} package script exists`);
  else fail(`${scriptName} package script exists`, `Missing package script ${scriptName}.`);
}

const types = read("apps/mobile/features/consumer-meals/types.ts");
if (/ConsumerDailyNutritionWriteSource = "disabled" \| "mock" \| "supabase"/.test(types)) pass("write source values are disabled/mock/supabase");
else fail("write source values are disabled/mock/supabase", "Phase 2K source values must be disabled, mock, or supabase.");

const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
if (/if \(!value\) return "disabled"/.test(flags)) pass("daily summary write source defaults to disabled");
else fail("daily summary write source defaults to disabled", "Default write source must remain disabled.");
if (/Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE/.test(flags) && /return "disabled"/.test(flags)) pass("unknown source fails closed");
else fail("unknown source fails closed", "Unknown daily summary write source must fail closed to disabled with an issue.");
if (/dailyNutritionWriteSource === "supabase"[\s\S]*development-only/i.test(flags) && /dailyNutritionWriteSource === "supabase"[\s\S]*SUPABASE_WRITES_ENABLED=true/.test(flags)) pass("supabase write source requires explicit development writes");
else fail("supabase write source requires explicit development writes", "Live persistence source must require explicit development-only write flags.");

const service = read("apps/mobile/features/consumer-meals/consumerDailyNutritionSummaryPersistenceService.ts");
if (/mealRecordsService\.listCurrentUserMealRecords/.test(service) && /calculateDailyNutritionSummary/.test(service)) pass("service calculates from current-user meal records before persistence");
else fail("service calculates from current-user meal records before persistence", "Persistence service must calculate from current-user meals.");
if (!/plannedMeals|consumptionAdjustments|corrections|ratings|favorites|recommendation/.test(service)) pass("service excludes planned/corrections/adjustments/engagement runtime");
else fail("service excludes planned/corrections/adjustments/engagement runtime", "Persistence service must not include unrelated runtime domains.");

const adapter = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts");
if (/SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION/.test(adapter) && /\.rpc\s*\(/.test(adapter)) pass("adapter invokes approved summary RPC");
else fail("adapter invokes approved summary RPC", "Live adapter must call only the approved summary RPC.");
if (!/\.\s*(insert|upsert|update|delete)\s*\(/.test(adapter) && !/from\(\s*SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARIES_TABLE/.test(adapter)) pass("adapter does not direct-write summary table");
else fail("adapter does not direct-write summary table", "Adapter must not directly insert/update/upsert/delete summary table.");
if (/authPort|getCurrentSession/.test(adapter) && /mapSupabaseDailyNutritionSummaryRowToConsumerSummary/.test(adapter)) pass("adapter uses canonical session and mapper");
else fail("adapter uses canonical session and mapper", "Adapter must use current session and canonical summary mapper.");
if (/userIdPrinted|summaryIdsPrinted|rawRowsPrinted/.test(adapter)) fail("adapter should not include output sanitization fields", "Output sanitization belongs to scripts, not runtime adapter.");
else pass("adapter contains no script output fields");

const mealSourceFiles = [
  ...walk(authRoot, (file) => file.endsWith(".ts")),
  ...walk(mealRoot, (file) => file.endsWith(".ts"))
].map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));

const secretMatches = mealSourceFiles.filter(({ text }) => /service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(text)).map(({ rel }) => rel);
if (secretMatches.length) fail("no secret/service-role references in Consumer runtime source", "Consumer runtime source must not include privileged credential references.", { matches: secretMatches });
else pass("no secret/service-role references in Consumer runtime source");

const writeMatches = mealSourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /\.\s*(insert|upsert|update|delete)\s*\(/.test(text) && !rel.endsWith("supabaseConsumerMealRecordWriteRepository.ts"))
  .map(({ rel }) => rel);
if (writeMatches.length) fail("no unapproved direct Consumer write methods", "Phase 2K must not add direct table write methods.", { matches: writeMatches });
else pass("no unapproved direct Consumer write methods");

const rpcMatches = mealSourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /\.\s*rpc\s*\(/.test(text) && !rel.endsWith("supabaseConsumerMealRecordWriteRepository.ts") && !rel.endsWith("supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts"))
  .map(({ rel }) => rel);
if (rpcMatches.length) fail("approved Consumer RPC invocation boundaries", "Only Phase 2D meal write and Phase 2K summary persistence adapters may invoke RPC.", { matches: rpcMatches });
else pass("approved Consumer RPC invocation boundaries");

const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiPersistenceMatches = uiFiles
  .filter((file) => /DailyNutritionSummaryPersistence|persistCurrentUserDailyNutritionSummary|DAILY_NUTRITION_WRITE/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (uiPersistenceMatches.length) fail("no UI persistence imports or triggers", "UI and navigation must not trigger summary persistence.", { matches: uiPersistenceMatches });
else pass("no UI persistence imports or triggers");

const home = read("apps/mobile/app/index.tsx");
const today = read("apps/mobile/app/today-intake.tsx");
if (/useTodayIntakeUiModel/.test(home) && /useTodayIntakeUiModel/.test(today) && !/persistCurrentUserDailyNutritionSummary|DailyNutritionSummaryPersistence/.test(home + today)) {
  pass("Phase 2I shared UI read path remains read-only");
} else {
  fail("Phase 2I shared UI read path remains read-only", "Home/Today Intake must remain shared-read only with no persistence trigger.");
}

try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2k-smoke.mjs")], {
    cwd: root,
    env: { ...process.env, TASTKIND_CONSUMER_PHASE2K_LIVE_SUMMARY_PERSISTENCE: "" },
    encoding: "utf8"
  });
  const parsed = JSON.parse(output);
  if (
    parsed.status === "skipped" &&
    parsed.supabaseClientCreated === false &&
    parsed.signInUsed === false &&
    parsed.networkRequestUsed === false &&
    parsed.databaseReadUsed === false &&
    parsed.databaseWriteUsed === false &&
    parsed.rpcInvoked === false
  ) {
    pass("default Phase 2K smoke is skipped without client, network, read, write, or RPC");
  } else {
    fail("default Phase 2K smoke is skipped without client, network, read, write, or RPC", "Default smoke must remain inert.", { parsed });
  }
} catch (error) {
  fail("default Phase 2K smoke is skipped without client, network, read, write, or RPC", error instanceof Error ? error.message : String(error));
}

const liveSmoke = read("scripts/consumer-meal-records-phase-2k-smoke.mjs");
if (/TASTKIND_CONSUMER_PHASE2K_LIVE_SUMMARY_PERSISTENCE/.test(liveSmoke) && /createConsumerDailyNutritionSummaryPersistenceService/.test(liveSmoke) && /compareStoredAndCalculatedDailyNutritionSummary/.test(liveSmoke)) {
  pass("Phase 2K live smoke requires explicit opt-in and verifies parity");
} else {
  fail("Phase 2K live smoke requires explicit opt-in and verifies parity", "Live smoke must require opt-in and verify persistence/parity path.");
}
if (!/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(liveSmoke) && /credentialsPrinted: false/.test(liveSmoke)) pass("Phase 2K live smoke has sanitized output and no privileged credentials");
else fail("Phase 2K live smoke has sanitized output and no privileged credentials", "Live smoke must not use privileged credentials and must sanitize output.");

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2K",
  reason: issues.length ? "Phase 2K guard failed" : "Atomic daily nutrition summary persistence verified statically",
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
  nextPhaseStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
