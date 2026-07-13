import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const appRoot = path.join(root, "apps", "mobile", "app");
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
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

for (const rel of [
  "apps/mobile/features/consumer-meals/consumerPlannedMealsService.ts",
  "apps/mobile/features/consumer-meals/plannedMealMappers.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseDisabledConsumerPlannedMealsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerPlannedMealsRepository.ts",
  "scripts/consumer-meal-records-phase-2l-smoke.mjs"
]) {
  if (fs.existsSync(path.join(root, rel))) pass(`required Phase 2L file exists: ${rel}`);
  else fail(`required Phase 2L file exists: ${rel}`, "Missing required Phase 2L architecture file.");
}

const types = read("apps/mobile/features/consumer-meals/types.ts");
if (/ConsumerPlannedMeal/.test(types) && /ConsumerPlannedMealsReadResult/.test(types) && /available/.test(types) && /empty/.test(types) && /unavailable/.test(types)) pass("canonical planned meal type and read result exist");
else fail("canonical planned meal type and read result exist", "Phase 2L must define canonical planned meal model and result union.");
if (!/userId\s*\??:|session\s*:|accessToken|token\s*:/.test(types.match(/export type GetCurrentUserPlannedMealsInput[\s\S]*?};/)?.[0] ?? "")) pass("planned meal public input excludes identity and token fields");
else fail("planned meal public input excludes identity and token fields", "Public planned meal input must not accept user/session/token.");

const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");
if (/EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE/.test(flags) && /\["disabled", "mock", "supabase", "supabase_prepared"\]/.test(flags)) pass("planned meals source flag values include disabled/mock/supabase and deprecated prepared");
else fail("planned meals source flag values include disabled/mock/supabase and deprecated prepared", "Missing planned meals source selector.");
if (/if \(!value\) return "disabled"/.test(flags) && /Unknown EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE/.test(flags)) pass("planned meals source defaults disabled and unknown fails closed");
else fail("planned meals source defaults disabled and unknown fails closed", "Planned meals source must default disabled and reject unknown values.");

const service = read("apps/mobile/features/consumer-meals/consumerPlannedMealsService.ts");
if (/toDateKeyInTimeZone/.test(service) && /clock\.now/.test(service) && !/new Date\(\)/.test(service)) pass("planned meal service uses injected clock/date contract");
else fail("planned meal service uses injected clock/date contract", "Planned meal service must use deterministic injected clock.");
if (/sort\(comparePlannedMeals\)/.test(service) && /plannedDate\.localeCompare/.test(service) && /plannedTime/.test(service) && /plannedMealId/.test(service)) pass("planned meal service uses deterministic sorting");
else fail("planned meal service uses deterministic sorting", "Planned meals must sort by date, time, stable id.");

const plannedFiles = walk(mealRoot, (file) => file.endsWith(".ts") && /PlannedMeals|plannedMeal|plannedMealMappers/.test(file)).map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const plannedSource = plannedFiles.map((item) => item.text).join("\n");
if (!/\.\s*(insert|upsert|update|delete)\s*\(/.test(plannedSource)) pass("planned meals source contains no writes");
else fail("planned meals source contains no writes", "Phase 2L must not implement planned meal writes.");
if (!/\.\s*rpc\s*\(/.test(plannedSource)) pass("planned meals source contains no RPC invocation");
else fail("planned meals source contains no RPC invocation", "Phase 2L must not invoke planned meal RPC.");
const preparedSource = read("apps/mobile/features/consumer-meals/adapters/supabasePreparedConsumerPlannedMealsRepository.ts");
if (!/\.\s*from\s*\(/.test(preparedSource)) pass("prepared planned meals source contains no direct Supabase query");
else fail("prepared planned meals source contains no direct Supabase query", "Phase 2L prepared source must not query Supabase.");
if (!/@supabase\/supabase-js|react-native-url-polyfill|createClient/.test(plannedSource)) pass("planned meals source creates no Supabase client");
else fail("planned meals source creates no Supabase client", "Phase 2L must not create a live Supabase client.");

const contracts = read("apps/mobile/features/consumer-meals/supabaseMealContracts.ts");
if (/SUPABASE_CONSUMER_PLANNED_MEALS_TABLE\s*=\s*"planned_meals"/.test(contracts) && /SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS/.test(contracts)) pass("prepared schema contract records planned_meals table and columns");
else fail("prepared schema contract records planned_meals table and columns", "Prepared source must document frozen planned_meals mapping.");

const overview = read("apps/mobile/features/consumer-meals/consumerTodayIntakeOverviewService.ts");
if (/plannedMealsService/.test(overview) && /getCurrentUserPlannedMeals/.test(overview)) pass("shared overview uses canonical planned meal service");
else fail("shared overview uses canonical planned meal service", "Overview must integrate through canonical planned meal service.");
if (/planned_meals_unavailable/.test(overview) && /plannedMealsStatus = "empty"/.test(overview)) pass("overview separates unavailable and empty planned meals");
else fail("overview separates unavailable and empty planned meals", "Unavailable and empty planned meal states must remain distinct.");

const uiFiles = walk(appRoot, (file) => file.endsWith(".ts") || file.endsWith(".tsx")).map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const uiBoundaryMatches = uiFiles.filter(({ text }) => /ConsumerPlannedMealsRepository|ConsumerPlannedMealsService|supabaseConsumerPlanned|@supabase\/supabase-js|react-native-url-polyfill/.test(text)).map(({ rel }) => rel);
if (uiBoundaryMatches.length === 0) pass("Mobile routes do not import planned meal repositories, service, or Supabase SDK");
else fail("Mobile routes do not import planned meal repositories, service, or Supabase SDK", "Phase 2L must not wire planned meal runtime directly into UI routes.", { matches: uiBoundaryMatches });

const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged", { count: migrationFiles.length });
else fail("migration inventory unchanged", "Phase 2L must not add migrations.", { migrationFiles, expectedMigrationFiles });

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["test:consumer-phase2l"] && packageJson.scripts?.["test:consumer-phase2l-smoke"] && packageJson.scripts?.["test:consumer-phase2l-mock-smoke"]) pass("Phase 2L package scripts exist");
else fail("Phase 2L package scripts exist", "Missing Phase 2L guard or smoke scripts.");

const defaultSmoke = run(process.execPath, ["scripts/consumer-meal-records-phase-2l-smoke.mjs"]);
if (defaultSmoke.status === 0 && /"status": "skipped"/.test(defaultSmoke.stdout) && /"clientCreated": false/.test(defaultSmoke.stdout) && /"networkRequestUsed": false/.test(defaultSmoke.stdout) && /"databaseWriteUsed": false/.test(defaultSmoke.stdout) && /"rpcInvoked": false/.test(defaultSmoke.stdout)) pass("default Phase 2L smoke is skipped without client/network/read/write/RPC");
else fail("default Phase 2L smoke is skipped without client/network/read/write/RPC", "Default smoke must be fully inert.", { stdout: defaultSmoke.stdout, stderr: defaultSmoke.stderr });

const mockSmoke = run(process.execPath, ["scripts/consumer-meal-records-phase-2l-smoke.mjs", "--mock-contract"]);
if (mockSmoke.status === 0 && /"status": "passed"/.test(mockSmoke.stdout) && /"actualNutritionUnchanged": "passed"/.test(mockSmoke.stdout)) pass("mock Phase 2L contract smoke passes");
else fail("mock Phase 2L contract smoke passes", "Mock contract smoke must verify planned meal semantics.", { stdout: mockSmoke.stdout, stderr: mockSmoke.stderr });

const forbiddenRepoPatterns = [
  [/service[_-]?role/i, "Service Role must not appear in Consumer planned meal runtime."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret key env vars must not appear."],
  [/PRODUCTION_SUPABASE|production project/i, "Production-specific logic must not appear."]
];
for (const [pattern, message] of forbiddenRepoPatterns) {
  const matches = plannedFiles.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden planned meal runtime pattern: ${pattern}`, message, { matches });
  else pass(`forbidden planned meal runtime pattern absent: ${pattern}`);
}

const output = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2L",
  reason: issues.length ? "Phase 2L guard failed" : "Planned meals canonical read architecture verified",
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

console.log(JSON.stringify(output, null, 2));
if (issues.length) process.exit(1);

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
}
