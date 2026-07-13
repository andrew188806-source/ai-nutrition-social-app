import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const appDir = path.join(root, "apps", "mobile", "app");
const componentDir = path.join(root, "apps", "mobile", "components");
const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const migrationsDir = path.join(root, "supabase", "migrations");
const phase2mMigrationName = "20260713080100_consumer_schema_phase_1_3_authenticated_planned_meal_read_grant.sql";
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
  phase2mMigrationName
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
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory includes exactly approved Phase 2M migration", { count: migrationFiles.length });
else fail("migration inventory includes exactly approved Phase 2M migration", "Unexpected active migration inventory.", { migrationFiles, expectedMigrationFiles });

const migration = read(`supabase/migrations/${phase2mMigrationName}`);
const migrationFlat = migration.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();
const expectedMigrationFlat = "grant select on table public.planned_meals to authenticated; revoke all on table public.planned_meals from anon;";
if (migrationFlat === expectedMigrationFlat) pass("Phase 2M migration is minimal planned_meals SELECT grant");
else fail("Phase 2M migration is minimal planned_meals SELECT grant", "Migration must only grant authenticated SELECT and revoke anon on planned_meals.", { migrationFlat });
if (!/\bgrant\s+(insert|update|delete|all)\s+on\s+table\s+public\.planned_meals/i.test(migration)) pass("no planned_meals direct write grant");
else fail("no planned_meals direct write grant", "Phase 2M must not grant planned_meals writes.");
if (!/\b(create|alter|drop)\s+(table|policy|index|type|view|function)\b/i.test(migration)) pass("Phase 2M migration does not change schema or RLS");
else fail("Phase 2M migration does not change schema or RLS", "Phase 2M migration may only adjust table-level read privilege.");

const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
if (/plannedMealsSources\s*=\s*new Set<ConsumerPlannedMealsSource>\(\["disabled", "mock", "supabase", "supabase_prepared"\]\)/.test(flags)) pass("planned meal source flag values include disabled/mock/supabase and deprecated prepared");
else fail("planned meal source flag values include disabled/mock/supabase and deprecated prepared", "Phase 2M must expose supabase and keep supabase_prepared fail-closed.");
if (/if \(!value\) return "disabled"/.test(flags) && /Consumer planned meals live read opt-in requires/.test(flags)) pass("planned meals source defaults disabled and live read requires explicit opt-in");
else fail("planned meals source defaults disabled and live read requires explicit opt-in", "Planned meals live reads must fail closed without opt-in.");
if (/plannedMealsSource === "supabase_prepared"[\s\S]*deprecated after Phase 2M/.test(flags)) pass("supabase_prepared is deprecated and fail-closed");
else fail("supabase_prepared is deprecated and fail-closed", "supabase_prepared should no longer be an activatable live source.");

const factory = read("apps/mobile/features/consumer-meals/factories.ts");
if (/SupabaseConsumerPlannedMealsRepository/.test(factory) && /plannedMealsSource === "supabase"/.test(factory) && /plannedMealsLiveReadOptIn/.test(factory)) pass("factory wires explicit live planned meals repository");
else fail("factory wires explicit live planned meals repository", "Factory must create live planned meals repository only for supabase source and opt-in.");
if (/supabaseWritesEnabled|mealRecordWritesEnabled/.test(factory) && /read-only runtime flags/.test(factory)) pass("factory requires read-only live planned meal flags");
else fail("factory requires read-only live planned meal flags", "Live planned meal reads must reject write-enabled runtime flags.");

const adapter = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealsRepository.ts");
if (/SUPABASE_CONSUMER_PLANNED_MEALS_TABLE/.test(adapter) && /\.select\(SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS\)/.test(adapter) && /\.eq\("user_id", userId\)/.test(adapter) && /\.eq\("planned_for", input\.plannedDate\)/.test(adapter)) {
  pass("live adapter reads planned_meals by authenticated user and planned date");
} else {
  fail("live adapter reads planned_meals by authenticated user and planned date", "Live adapter must read only current user planned meals for the selected date.");
}
if (!/\.\s*(insert|upsert|update|delete)\s*\(/.test(adapter)) pass("live planned meal adapter contains no direct writes");
else fail("live planned meal adapter contains no direct writes", "Live planned meal adapter must not write.");
if (!/\.\s*rpc\s*\(/.test(adapter)) pass("live planned meal adapter contains no RPC");
else fail("live planned meal adapter contains no RPC", "Live planned meal adapter must not call RPC.");
if (!/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/i.test(adapter)) pass("live planned meal adapter contains no privileged credential references");
else fail("live planned meal adapter contains no privileged credential references", "Live planned meal adapter must not reference privileged credentials.");

const mapper = read("apps/mobile/features/consumer-meals/plannedMealMappers.ts");
if (/plannedTime:\s*null/.test(mapper) && /items:\s*\[\]/.test(mapper)) pass("live planned meal mapper does not invent time or item rows");
else fail("live planned meal mapper does not invent time or item rows", "Frozen planned_meals schema has no time column or item table.");
if (/Object\.values\(snapshot\)\.some/.test(mapper)) pass("empty planned nutrition snapshots map to canonical null");
else fail("empty planned nutrition snapshots map to canonical null", "Empty planned_nutrition_snapshot should not create a fake nutrition object.");

const contracts = read("apps/mobile/features/consumer-meals/supabaseMealContracts.ts");
if (/SUPABASE_CONSUMER_PLANNED_MEALS_TABLE\s*=\s*"planned_meals"/.test(contracts) && /SupabasePlannedMealListResponseLike/.test(contracts)) pass("planned meals Supabase contract is typed");
else fail("planned meals Supabase contract is typed", "Supabase contract must include planned meals table and list response.");
if (!/planned_time|planned_meal_items/i.test(contracts)) pass("planned meals contract excludes nonexistent time/item schema");
else fail("planned meals contract excludes nonexistent time/item schema", "Planned meals contract must not invent schema objects.");

const overview = read("apps/mobile/features/consumer-meals/consumerTodayIntakeOverviewService.ts");
if (/plannedMealsService/.test(overview) && /plannedMealsStatus = "empty"/.test(overview) && /planned_meals_unavailable/.test(overview)) pass("shared overview separates planned meals available/empty/unavailable");
else fail("shared overview separates planned meals available/empty/unavailable", "Overview must keep planned meal state explicit.");

const sourceFiles = [
  ...walk(authRoot, (file) => file.endsWith(".ts")),
  ...walk(mealRoot, (file) => file.endsWith(".ts"))
].map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));

const plannedWriteMatches = sourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /planned/i.test(rel + text) && /\.\s*(insert|upsert|update|delete)\s*\(/.test(text))
  .map(({ rel }) => rel);
if (plannedWriteMatches.length) fail("no planned meal write methods in runtime source", "Phase 2M must not implement planned meal writes.", { matches: plannedWriteMatches });
else pass("no planned meal write methods in runtime source");

const plannedRpcMatches = sourceFiles
  .filter(({ rel, text }) => rel.includes("apps/mobile/features/consumer-meals/") && /planned/i.test(rel + text) && /\.\s*rpc\s*\(/.test(text))
  .map(({ rel }) => rel);
if (plannedRpcMatches.length) fail("no planned meal RPC in runtime source", "Phase 2M must not implement planned meal RPC.", { matches: plannedRpcMatches });
else pass("no planned meal RPC in runtime source");

const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiMatches = uiFiles
  .filter((file) => /ConsumerPlannedMealsRepository|SupabaseConsumerPlannedMealsRepository|PLANNED_MEALS_SOURCE|@supabase\/supabase-js|react-native-url-polyfill/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (uiMatches.length) fail("Mobile UI remains unwired from planned meal runtime internals", "Phase 2M must not modify UI/routes/navigation.", { matches: uiMatches });
else pass("Mobile UI remains unwired from planned meal runtime internals");

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test:consumer-phase2m", "test:consumer-phase2m-smoke", "test:consumer-phase2m-live-smoke"]) {
  if (packageJson.scripts?.[scriptName]) pass(`${scriptName} package script exists`);
  else fail(`${scriptName} package script exists`, `Missing package script ${scriptName}.`);
}

try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2m-smoke.mjs")], {
    cwd: root,
    env: { ...process.env, TASTKIND_CONSUMER_PHASE2M_LIVE_PLANNED_MEALS_READ: "" },
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
    pass("default Phase 2M smoke is skipped without client, network, read, write, or RPC");
  } else {
    fail("default Phase 2M smoke is skipped without client, network, read, write, or RPC", "Default smoke must remain inert.", { parsed });
  }
} catch (error) {
  fail("default Phase 2M smoke is skipped without client, network, read, write, or RPC", error instanceof Error ? error.message : String(error));
}

const liveSmoke = read("scripts/consumer-meal-records-phase-2m-smoke.mjs");
if (/TASTKIND_CONSUMER_PHASE2M_LIVE_PLANNED_MEALS_READ/.test(liveSmoke) && /createConsumerPlannedMealsService/.test(liveSmoke) && /plannedMealsReadExecuted/.test(liveSmoke)) {
  pass("Phase 2M live smoke requires explicit opt-in and verifies planned meals");
} else {
  fail("Phase 2M live smoke requires explicit opt-in and verifies planned meals", "Live smoke must require opt-in and execute planned meals read.");
}
if (/actualTotalsUnchanged/.test(liveSmoke) && /planned meals excluded from actual totals/.test(liveSmoke)) pass("Phase 2M live smoke verifies planned meals do not affect actual totals");
else fail("Phase 2M live smoke verifies planned meals do not affect actual totals", "Live smoke must compare shared overview totals with planned meals disabled.");
if (!/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(liveSmoke) && /credentialsPrinted: false/.test(liveSmoke) && /plannedMealIdsPrinted: false/.test(liveSmoke)) pass("Phase 2M live smoke has sanitized output and no privileged credentials");
else fail("Phase 2M live smoke has sanitized output and no privileged credentials", "Live smoke must not use privileged credentials and must sanitize output.");

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2M",
  reason: issues.length ? "Phase 2M guard failed" : "Development live planned meals read architecture verified statically",
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
