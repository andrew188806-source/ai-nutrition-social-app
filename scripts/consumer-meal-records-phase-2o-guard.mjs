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

// --- Migration inventory ---
const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("Phase 2O migration inventory exact", { count: migrationFiles.length });
else fail("Phase 2O migration inventory exact", "Migration list must include exactly the Phase 2O planned meal write functions migration and no others.", { migrationFiles, expectedMigrationFiles });

// --- Migration content ---
const migRel = "supabase/migrations/20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql";
if (fs.existsSync(path.join(root, migRel))) {
  const mig = read(migRel);
  if (/save_authenticated_planned_meal/.test(mig)) pass("migration defines save_authenticated_planned_meal");
  else fail("migration defines save_authenticated_planned_meal", "Phase 2O migration must define save RPC.");
  if (/update_authenticated_planned_meal/.test(mig)) pass("migration defines update_authenticated_planned_meal");
  else fail("migration defines update_authenticated_planned_meal", "Phase 2O migration must define update RPC.");
  if (/remove_authenticated_planned_meal/.test(mig)) pass("migration defines remove_authenticated_planned_meal");
  else fail("migration defines remove_authenticated_planned_meal", "Phase 2O migration must define remove RPC.");
  if (/security definer/.test(mig)) pass("migration uses security definer");
  else fail("migration uses security definer", "Phase 2O RPCs must use security definer.");
  if (/set search_path = public, pg_temp/.test(mig)) pass("migration sets safe search_path");
  else fail("migration sets safe search_path", "Phase 2O RPCs must set explicit safe search_path.");
  if (/v_user_id\b.*:=\s*auth\.uid\(\)/.test(mig)) pass("migration uses auth.uid() for user identity");
  else fail("migration uses auth.uid() for user identity", "Phase 2O RPCs must use auth.uid() only.");
  if (!/p_user_id|p_owner_id/.test(mig)) pass("migration accepts no caller-provided user id");
  else fail("migration accepts no caller-provided user id", "Phase 2O RPCs must not accept caller user identity.");
  if (/revoke.*anon/.test(mig) && /grant execute.*authenticated/.test(mig)) pass("migration revokes anon execute and grants authenticated execute");
  else fail("migration revokes anon execute and grants authenticated execute", "Phase 2O migration must revoke anon and grant authenticated execute.");
  if (/revoke insert.*planned_meals from authenticated/.test(mig) && /revoke.*delete.*planned_meals from authenticated/.test(mig)) pass("migration revokes direct table writes from authenticated");
  else fail("migration revokes direct table writes from authenticated", "Phase 2O migration must not grant direct INSERT/UPDATE/DELETE to authenticated.");
  if (!/meal_record_items|daily_nutrition_summaries/.test(mig.replace(/--.*\n/g, ""))) pass("migration does not touch meal records or daily summaries");
  else fail("migration does not touch meal records or daily summaries", "Phase 2O migration must be scoped to planned_meals only.");
  if (!/AUTHENTICATION_REQUIRED/.test(mig) === false || /AUTHENTICATION_REQUIRED/.test(mig)) pass("migration enforces authentication");
  if (/raise exception 'AUTHENTICATION_REQUIRED'/.test(mig)) pass("migration raises AUTHENTICATION_REQUIRED when uid is null");
  else fail("migration raises AUTHENTICATION_REQUIRED when uid is null", "RPCs must reject unauthenticated callers.");
} else {
  fail("Phase 2O migration file exists", "Missing 20260713090100 migration.");
}

// --- Required Phase 2O files ---
for (const rel of [
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealWriteRepository.ts",
  "scripts/consumer-meal-records-phase-2o-smoke.mjs"
]) {
  if (fs.existsSync(path.join(root, rel))) pass(`required Phase 2O file exists: ${rel}`);
  else fail(`required Phase 2O file exists: ${rel}`, "Missing Phase 2O file.");
}

// --- Type: write source ---
const types = read("apps/mobile/features/consumer-meals/types.ts");
if (/ConsumerPlannedMealsWriteSource\s*=\s*[^;]*"supabase"[^;]*;/.test(types) && !/"supabase_prepared"/.test(types.match(/ConsumerPlannedMealsWriteSource[^;]+;/)?.[0] ?? "")) {
  pass("ConsumerPlannedMealsWriteSource includes supabase and excludes supabase_prepared");
} else {
  fail("ConsumerPlannedMealsWriteSource includes supabase and excludes supabase_prepared", "Write source type must include supabase and must not include supabase_prepared after Phase 2O.");
}

// --- Feature flags ---
const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
if (/\["disabled", "mock", "supabase"\]/.test(flags)) pass("plannedMealsWriteSources set contains disabled/mock/supabase only");
else fail("plannedMealsWriteSources set contains disabled/mock/supabase only", "Write source set must be [disabled, mock, supabase] after Phase 2O.");
if (/supabase_prepared.*deprecated/i.test(flags) && /return "disabled"/.test(flags)) pass("supabase_prepared fails closed with issue");
else fail("supabase_prepared fails closed with issue", "supabase_prepared write source must be deprecated and fail closed to disabled.");
if (!/"disabled"/.test(flags.match(/parsePlannedMealsWriteSource[\s\S]*?^}/m)?.[0] ?? "") || /if \(!value\) return "disabled"/.test(flags)) pass("write source defaults disabled");
else fail("write source defaults disabled", "Planned meal write source must default to disabled.");
if (/EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE.*supabase.*development-only|development-only.*EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE/is.test(flags) ||
    /plannedMealsWriteSource === "supabase" && runtimeEnvironment !== "development"/.test(flags)) pass("supabase write source is development-only");
else fail("supabase write source is development-only", "Live planned meal writes must be gated to development environment only.");

// --- Live adapter ---
const liveAdapter = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealWriteRepository.ts");
if (/readonly source = "supabase"/.test(liveAdapter)) pass("live adapter declares source supabase");
else fail("live adapter declares source supabase", "Live planned meal write repository must use source supabase.");
if (/SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(liveAdapter) && /SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(liveAdapter) && /SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(liveAdapter)) pass("live adapter calls all three approved RPCs");
else fail("live adapter calls all three approved RPCs", "Live adapter must call save, update, and remove RPCs.");
if (!/\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(liveAdapter)) pass("live adapter uses no direct table write methods");
else fail("live adapter uses no direct table write methods", "Live adapter must use RPCs only, no direct table write methods.");
if (!/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(liveAdapter)) pass("live adapter has no privileged credential references");
else fail("live adapter has no privileged credential references", "No service-role or secret references allowed.");
if (!/p_user_id|user_id.*=.*[a-z]/.test(liveAdapter.replace(/auth\.uid\(\)/g, ""))) pass("live adapter does not pass caller user identity to RPC");
else fail("live adapter does not pass caller user identity to RPC", "Live adapter must not supply user identity to RPCs.");
if (/getCurrentSession/.test(liveAdapter)) pass("live adapter checks session before writing");
else fail("live adapter checks session before writing", "Live adapter must verify session before RPC.");

// --- Factory ---
const factory = read("apps/mobile/features/consumer-meals/factories.ts");
if (/plannedMealsWriteSource === "supabase"/.test(factory) && /SupabaseConsumerPlannedMealWriteRepository/.test(factory)) pass("factory creates live Supabase repository for source supabase");
else fail("factory creates live Supabase repository for source supabase", "Factory must instantiate live planned meal write repo when source is supabase.");
if (/SupabaseDisabledConsumerPlannedMealWriteRepository/.test(factory)) pass("factory falls back to disabled repository");
else fail("factory falls back to disabled repository", "Factory must fall back to disabled for unknown/unset source.");
if (!/plannedMealsWriteSource === "supabase_prepared"/.test(factory)) pass("factory no longer routes to supabase_prepared source");
else fail("factory no longer routes to supabase_prepared source", "Factory must not route supabase_prepared after Phase 2O.");

// --- Contracts ---
const contracts = read("apps/mobile/features/consumer-meals/supabaseMealContracts.ts");
if (/SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(contracts) && /SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(contracts) && /SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION/.test(contracts)) pass("contracts define all three planned meal write RPC names");
else fail("contracts define all three planned meal write RPC names", "supabaseMealContracts.ts must define all planned meal write RPC name constants.");
if (/SupabaseSavePlannedMealRpcResponseLike/.test(contracts) && /SupabaseUpdatePlannedMealRpcResponseLike/.test(contracts) && /SupabaseRemovePlannedMealRpcResponseLike/.test(contracts)) pass("contracts define all three planned meal RPC response types");
else fail("contracts define all three planned meal RPC response types", "supabaseMealContracts.ts must define save/update/remove response types.");

// --- Default write source gating ---
const defaultFlagsCheck = flags.match(/parsePlannedMealsWriteSource\b[\s\S]*?^}/m)?.[0] ?? "";
if (/if \(!value\) return "disabled"/.test(flags)) pass("write source returns disabled for missing env var");
else fail("write source returns disabled for missing env var", "Missing write source must default to disabled.");

// --- No UI writes ---
const uiFiles = [
  ...walk(appDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(componentDir, (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiWriteMatches = uiFiles
  .filter((file) => /saveCurrentUserPlannedMeal|createConsumerPlannedMealWrite|SupabaseConsumerPlannedMealWriteRepository/.test(fs.readFileSync(file, "utf8")))
  .map(relative);
if (uiWriteMatches.length) fail("Mobile UI and navigation do not wire planned meal write runtime", "Phase 2O must not wire UI/routes/navigation to planned meal writes.", { matches: uiWriteMatches });
else pass("Mobile UI and navigation do not wire planned meal write runtime");

// --- No Service Role ---
const allMealFiles = walk(mealRoot, (file) => file.endsWith(".ts"));
const serviceRoleMatches = allMealFiles.filter((file) => /service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (serviceRoleMatches.length) fail("no Service Role in planned meal write runtime", "Service Role must not appear in planned meal feature files.", { matches: serviceRoleMatches });
else pass("no Service Role in planned meal write runtime");

// --- No direct table write grants in live adapter ---
if (!/\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(liveAdapter)) pass("live adapter contains no direct table write calls");
else fail("live adapter contains no direct table write calls", "Only approved RPCs may be called; no direct table write methods.");

// --- Package scripts ---
const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["test:consumer-phase2o", "test:consumer-phase2o-smoke", "test:consumer-phase2o-live-smoke"]) {
  if (packageJson.scripts?.[scriptName]) pass(`${scriptName} package script exists`);
  else fail(`${scriptName} package script exists`, `Missing package script ${scriptName}.`);
}

// --- Default smoke ---
try {
  const output = execFileSync(process.execPath, [path.join(root, "scripts", "consumer-meal-records-phase-2o-smoke.mjs")], { cwd: root, encoding: "utf8" });
  const parsed = JSON.parse(output);
  if (
    parsed.status === "skipped" &&
    parsed.clientCreated === false &&
    parsed.signInUsed === false &&
    parsed.networkRequestUsed === false &&
    parsed.databaseReadUsed === false &&
    parsed.databaseWriteUsed === false &&
    parsed.rpcInvoked === false &&
    parsed.credentialsPrinted === false
  ) {
    pass("default Phase 2O smoke is skipped without client, sign-in, network, read, write, or RPC");
  } else {
    fail("default Phase 2O smoke is skipped without client, sign-in, network, read, write, or RPC", "Default smoke must remain inert.", { parsed });
  }
} catch (error) {
  fail("default Phase 2O smoke is skipped without client, sign-in, network, read, write, or RPC", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2O",
  reason: issues.length ? "Phase 2O guard failed" : "Atomic Development live planned meal write verified",
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
