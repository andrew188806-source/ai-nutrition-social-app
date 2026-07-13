import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const featuresRoot = path.join(root, "apps", "mobile", "features");
const mobilePackagePath = path.join(root, "apps", "mobile", "package.json");
const mobileNodeModulesPath = path.join(root, "apps", "mobile", "node_modules");
const phase = "Consumer Runtime Integration Phase 2M Live Planned Meals Read Smoke";

function parseDotEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function buildEnv() {
  return {
    ...parseDotEnvFile(path.join(root, ".env.local")),
    ...parseDotEnvFile(path.join(root, "apps", "mobile", ".env.local")),
    ...process.env
  };
}

function printSkipped(reason) {
  console.log(JSON.stringify({
    status: "skipped",
    phase,
    reason,
    supabaseClientCreated: false,
    signInUsed: false,
    networkRequestUsed: false,
    databaseReadUsed: false,
    plannedMealsReadExecuted: false,
    sharedOverviewExecuted: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    plannedMealIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    snapshotPrinted: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  }, null, 2));
}

function printBlocked(reason, missing = [], extra = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase,
    reason,
    missing,
    ...extra,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    plannedMealIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    snapshotPrinted: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  }, null, 2));
  process.exit(2);
}

const env = buildEnv();
if (env.TASTKIND_CONSUMER_PHASE2M_LIVE_PLANNED_MEALS_READ !== "true") {
  printSkipped("SKIPPED - explicit Phase 2M Development live planned meals read opt-in was not enabled.");
  process.exit(0);
}

const requiredFlags = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE: "supabase",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_LIVE_READ_OPT_IN: "true"
};
const missing = [];
for (const [key, expected] of Object.entries(requiredFlags)) {
  if (env[key] !== expected) missing.push(key);
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED && env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED !== "false") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED=false or unset");
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN && env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN !== "false") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN=false or unset");
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE && env.EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE !== "disabled") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE=disabled or unset");
}

const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail =
  env.TASTKIND_CONSUMER_PHASE2M_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2H_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2F_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword =
  env.TASTKIND_CONSUMER_PHASE2M_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2H_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2F_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2M_SMOKE_EMAIL or fallback email");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2M_SMOKE_PASSWORD or fallback password");
if (missing.length) printBlocked("Live planned meals read smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) printBlocked("Live planned meals read smoke refuses privileged credentials.", ["publishable/anon key"]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2m-live-"));
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && full.endsWith(".ts")) sourceFiles.push(full);
  }
}
walk(path.join(featuresRoot, "consumer-auth"));
walk(path.join(featuresRoot, "consumer-meals"));

for (const file of sourceFiles) {
  const rel = path.relative(featuresRoot, file).replaceAll(path.sep, "/");
  const target = path.join(tempRoot, rel).replace(/\.ts$/, ".js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let source = fs.readFileSync(file, "utf8");
  if (rel === "consumer-auth/index.ts") {
    source = source
      .replace('export * from "./supabaseSdkLoader";', "")
      .replace('export * from "./asyncStorageConsumerAuthStorage";', "")
      .replace('export * from "./reactNativeAppStateSource";', "");
  }
  if (rel === "consumer-meals/index.ts") {
    source = source.replace('export * from "./todayIntakeUiModel";', "");
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, strict: true },
    fileName: file
  }).outputText;
  fs.writeFileSync(target, output, "utf8");
}
const analysisStub = path.join(tempRoot, "analysis", "analysisMealRecordStore.js");
fs.mkdirSync(path.dirname(analysisStub), { recursive: true });
fs.writeFileSync(analysisStub, "exports.getMealRecords = () => [];\n", "utf8");

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const requireFromAuthTemp = createRequire(path.join(tempRoot, "consumer-auth", "index.js"));
const requireFromMealTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const authRuntime = requireFromAuthTemp("./index.js");
const mealRuntime = requireFromMealTemp("./index.js");

const storageValues = new Map();
const storage = {
  getItem: async (key) => storageValues.get(key) ?? null,
  setItem: async (key, value) => { storageValues.set(key, value); },
  removeItem: async (key) => { storageValues.delete(key); }
};

const requireFromMobilePackage = createRequire(mobilePackagePath);
const { createClient } = requireFromMobilePackage("@supabase/supabase-js");
const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage
  }
});

const checks = [];
function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}
function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  throw new Error(message);
}

function totalsOf(overview) {
  return {
    mealCount: overview.mealCount,
    itemCount: overview.itemCount,
    calories: overview.calculatedNutrition.calories,
    protein: overview.calculatedNutrition.protein,
    carbohydrates: overview.calculatedNutrition.carbohydrates,
    fat: overview.calculatedNutrition.fat,
    fiber: overview.calculatedNutrition.fiber
  };
}

function stablePlannedShape(result) {
  return {
    status: result.status,
    plannedDate: result.plannedDate,
    mealCount: result.status === "available" ? result.meals.length : 0,
    nutritionSnapshotCount: result.status === "available" ? result.meals.filter((meal) => meal.estimatedNutrition).length : 0,
    itemCount: result.status === "available" ? result.meals.reduce((sum, meal) => sum + meal.items.length, 0) : 0
  };
}

try {
  const mealFlags = mealRuntime.getConsumerMealRuntimeFlags(env);
  if (mealFlags.issues.length) fail("live planned meal flags accepted", "Live planned meal flags were rejected.", { issueCount: mealFlags.issues.length });
  pass("live planned meal flags accepted");

  const authFlags = authRuntime.getConsumerRuntimeFlags(env);
  if (authFlags.issues.length) fail("live auth flags accepted", "Live auth flags were rejected.", { issueCount: authFlags.issues.length });
  pass("live auth flags accepted");

  const authPort = new authRuntime.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed with typed auth error.", { code: signIn.error.code });
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false });

  const mealService = mealRuntime.createConsumerMealRecordsService(mealFlags, { authPort, mealClient: supabase });
  const recentMeals = await mealService.listCurrentUserMealRecords({ limit: 20 });
  if (!recentMeals.ok) fail("current meal records read", "Current meal records read failed with typed meal error.", { code: recentMeals.error.code });
  pass("current meal records read", { resultCount: recentMeals.value.length, rawRowsPrinted: false, recordIdsPrinted: false });

  const plannedDate =
    env.TASTKIND_CONSUMER_PHASE2M_PLANNED_DATE ??
    env.TASTKIND_CONSUMER_PHASE2I_OVERVIEW_DATE ??
    env.TASTKIND_CONSUMER_PHASE2H_OVERVIEW_DATE ??
    recentMeals.value[0]?.mealDate ??
    new Date().toISOString().slice(0, 10);
  const timezone = env.TASTKIND_CONSUMER_PHASE2M_TIMEZONE ?? recentMeals.value[0]?.timezone ?? "Asia/Taipei";
  const fixedClock = { now: () => new Date(`${plannedDate}T04:00:00.000Z`) };
  pass("planned meal date selected", { selected: true, printed: false });

  const plannedMealsService = mealRuntime.createConsumerPlannedMealsService(mealFlags, {
    authPort,
    mealClient: supabase,
    clock: fixedClock,
    timezone
  });
  const plannedResult = await plannedMealsService.getCurrentUserPlannedMeals({ plannedDate });
  if (plannedResult.status !== "available" && plannedResult.status !== "empty") {
    fail("planned meals live read", "Live planned meal read must return available or empty.", { status: plannedResult.status });
  }
  pass("planned meals live read", stablePlannedShape(plannedResult));
  if (plannedResult.status === "available" && plannedResult.meals.some((meal) => meal.plannedTime !== null || meal.items.length !== 0)) {
    fail("planned meals schema boundary", "Live planned meals must not invent time or item rows absent from the frozen schema.");
  }
  pass("planned meals schema boundary", { timeMapped: false, itemRowsInvented: false });

  const repeatPlannedResult = await plannedMealsService.getCurrentUserPlannedMeals({ plannedDate });
  if (JSON.stringify(stablePlannedShape(plannedResult)) !== JSON.stringify(stablePlannedShape(repeatPlannedResult))) {
    fail("deterministic repeated planned meals read", "Repeated planned meal read changed status/count shape.");
  }
  pass("deterministic repeated planned meals read", { deterministic: true });

  const overviewService = mealRuntime.createConsumerTodayIntakeOverviewService(mealFlags, {
    authPort,
    mealClient: supabase,
    clock: fixedClock,
    timezone
  });
  const overviewResult = await overviewService.getCurrentUserTodayIntakeOverview({ date: plannedDate });
  if (!overviewResult.ok) fail("shared overview live read", "Shared overview live read failed.", { code: overviewResult.error.code });
  const overview = overviewResult.value;
  if (overview.warnings.includes("planned_meals_unavailable")) {
    fail("planned meals available to shared overview", "Shared overview must not report planned_meals_unavailable when live planned read succeeds.");
  }
  if (overview.plannedMealsStatus !== plannedResult.status) {
    fail("shared overview planned status", "Shared overview planned status must match canonical planned meal read.", {
      overviewStatus: overview.plannedMealsStatus,
      plannedStatus: plannedResult.status
    });
  }
  pass("shared overview planned status", { status: overview.plannedMealsStatus, plannedMealCount: overview.plannedMeals.length });

  const disabledPlannedFlags = {
    ...mealFlags,
    plannedMealsSource: "disabled",
    plannedMealsLiveReadOptIn: false,
    issues: []
  };
  const overviewWithoutPlansService = mealRuntime.createConsumerTodayIntakeOverviewService(disabledPlannedFlags, {
    authPort,
    mealClient: supabase,
    clock: fixedClock,
    timezone
  });
  const overviewWithoutPlansResult = await overviewWithoutPlansService.getCurrentUserTodayIntakeOverview({ date: plannedDate });
  if (!overviewWithoutPlansResult.ok) fail("shared overview comparison read", "Shared overview comparison read failed.", { code: overviewWithoutPlansResult.error.code });
  const liveTotals = totalsOf(overview);
  const disabledTotals = totalsOf(overviewWithoutPlansResult.value);
  if (JSON.stringify(liveTotals) !== JSON.stringify(disabledTotals)) {
    fail("planned meals excluded from actual totals", "Planned meals changed actual consumed totals.", { totalsChanged: true });
  }
  pass("planned meals excluded from actual totals", { actualTotalsUnchanged: true });

  const repeatOverviewResult = await overviewService.getCurrentUserTodayIntakeOverview({ date: plannedDate });
  if (!repeatOverviewResult.ok) fail("deterministic repeated overview read", "Repeated shared overview read failed.", { code: repeatOverviewResult.error.code });
  if (JSON.stringify(totalsOf(overview)) !== JSON.stringify(totalsOf(repeatOverviewResult.value)) || overview.plannedMealsStatus !== repeatOverviewResult.value.plannedMealsStatus) {
    fail("deterministic repeated overview read", "Repeated overview changed planned status or actual totals.");
  }
  pass("deterministic repeated overview read", { deterministic: true });

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase,
    checks,
    plannedMealsStatus: plannedResult.status,
    plannedMealCount: plannedResult.status === "available" ? plannedResult.meals.length : 0,
    nutritionSnapshotCount: plannedResult.status === "available" ? plannedResult.meals.filter((meal) => meal.estimatedNutrition).length : 0,
    plannedItemsInvented: false,
    plannedTimeMapped: false,
    overviewStatus: overview.status,
    overviewPlannedMealsStatus: overview.plannedMealsStatus,
    actualTotalsUnchanged: "passed",
    deterministicPlannedRead: "passed",
    deterministicOverviewRead: "passed",
    supabaseClientCreated: true,
    signInUsed: true,
    networkRequestUsed: true,
    databaseReadUsed: true,
    plannedMealsReadExecuted: true,
    sharedOverviewExecuted: true,
    databaseWriteUsed: false,
    rpcInvoked: false,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    plannedMealIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    snapshotPrinted: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  }, null, 2));
} catch {
  try {
    await supabase.auth.signOut();
  } catch {
    // Best-effort cleanup; do not print provider error details.
  }
  console.log(JSON.stringify({
    status: "failed",
    phase,
    reason: "Live planned meals read smoke failed.",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    plannedMealIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    snapshotPrinted: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  }, null, 2));
  process.exitCode = 1;
}
