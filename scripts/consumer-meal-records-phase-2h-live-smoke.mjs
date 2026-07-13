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
const phase = "Consumer Runtime Integration Phase 2H Live Shared Intake Read Smoke";

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
    authenticationUsed: false,
    networkRequestUsed: false,
    sharedOverviewExecuted: false,
    mealReadExecuted: false,
    summaryReadExecuted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
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
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
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
if (env.TASTKIND_CONSUMER_PHASE2H_LIVE_SHARED_INTAKE_READ !== "true") {
  printSkipped("SKIPPED - explicit Phase 2H Development live shared intake read opt-in was not enabled.");
  process.exit(0);
}

const requiredFlags = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN: "true"
};
const missing = [];
for (const [key, expected] of Object.entries(requiredFlags)) {
  if (env[key] !== expected) missing.push(key);
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED && env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED !== "false") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED=false");
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN && env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN !== "false") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN=false or unset");
}

const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail =
  env.TASTKIND_CONSUMER_PHASE2H_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2F_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword =
  env.TASTKIND_CONSUMER_PHASE2H_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2F_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2H_SMOKE_EMAIL or fallback email");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2H_SMOKE_PASSWORD or fallback password");
if (missing.length) printBlocked("Live shared intake read smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) printBlocked("Live shared intake read smoke refuses privileged credentials.", ["publishable/anon key"]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2h-live-"));
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

function compareOverviewTotals(a, b) {
  return a.status === b.status &&
    a.mealCount === b.mealCount &&
    a.itemCount === b.itemCount &&
    a.calculatedNutrition.calories === b.calculatedNutrition.calories &&
    a.calculatedNutrition.protein === b.calculatedNutrition.protein &&
    a.calculatedNutrition.carbohydrates === b.calculatedNutrition.carbohydrates &&
    a.calculatedNutrition.fat === b.calculatedNutrition.fat &&
    a.calculatedNutrition.fiber === b.calculatedNutrition.fiber &&
    JSON.stringify([...a.warnings].sort()) === JSON.stringify([...b.warnings].sort());
}

try {
  const mealFlags = mealRuntime.getConsumerMealRuntimeFlags(env);
  if (mealFlags.issues.length) fail("live shared overview flags accepted", "Live shared overview flags were rejected.", { issueCount: mealFlags.issues.length });
  pass("live shared overview flags accepted");

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

  const overviewDate =
    env.TASTKIND_CONSUMER_PHASE2H_OVERVIEW_DATE ??
    env.TASTKIND_CONSUMER_PHASE2F_SUMMARY_DATE ??
    recentMeals.value[0]?.mealDate;
  if (!overviewDate) fail("overview date selected", "No live meal date was available for shared overview verification.");
  const timezone = env.TASTKIND_CONSUMER_PHASE2H_OVERVIEW_TIMEZONE ?? recentMeals.value[0]?.timezone ?? "Asia/Taipei";
  pass("overview date selected", { selected: true, printed: false });

  const exactMeals = await mealService.listCurrentUserMealRecords({ startDate: overviewDate, endDate: overviewDate, limit: 100 });
  if (!exactMeals.ok) fail("overview-date meal records read", "Overview-date meal records read failed with typed meal error.", { code: exactMeals.error.code });
  if (exactMeals.value.length !== 1) fail("overview-date meal count", "Development shared intake smoke expects one current-user meal on the selected date.", { mealCount: exactMeals.value.length });
  pass("overview-date meal count", { mealCount: exactMeals.value.length });

  const fixedClock = { now: () => new Date(`${overviewDate}T04:00:00.000Z`) };
  const overviewService = mealRuntime.createConsumerTodayIntakeOverviewService(mealFlags, {
    authPort,
    mealClient: supabase,
    clock: fixedClock,
    timezone
  });
  const overviewResult = await overviewService.getCurrentUserTodayIntakeOverview({ date: overviewDate });
  if (!overviewResult.ok) fail("shared overview read", "Shared overview read failed with typed overview error.", { code: overviewResult.error.code });
  const overview = overviewResult.value;
  pass("shared overview read", { status: overview.status, mealCount: overview.mealCount, itemCount: overview.itemCount });

  if (overview.mealCount !== exactMeals.value.length) fail("overview meal parity", "Overview meal count did not match direct live meal read.", { overviewMealCount: overview.mealCount, directMealCount: exactMeals.value.length });
  pass("overview meal parity", { mealCount: overview.mealCount });

  const calculated = mealRuntime.calculateDailyNutritionSummary({
    summaryDate: overviewDate,
    timezone,
    calculatedAt: overview.generatedAt,
    mealRecords: exactMeals.value
  });
  if (!calculated.ok) fail("direct calculator", "Direct calculator failed with typed error.", { code: calculated.error.code });
  const metricsMatch =
    overview.calculatedNutrition.calories === calculated.value.calories &&
    overview.calculatedNutrition.protein === calculated.value.protein &&
    overview.calculatedNutrition.carbohydrates === calculated.value.carbohydrates &&
    overview.calculatedNutrition.fat === calculated.value.fat &&
    overview.calculatedNutrition.fiber === calculated.value.fiber &&
    overview.calculatedNutrition.itemCount === calculated.value.itemCount;
  if (!metricsMatch) fail("overview nutrition parity", "Overview calculated nutrition did not match direct Phase 2E calculation.");
  pass("overview nutrition parity", {
    calories: overview.calculatedNutrition.calories,
    protein: overview.calculatedNutrition.protein,
    carbohydrates: overview.calculatedNutrition.carbohydrates,
    fat: overview.calculatedNutrition.fat,
    fiber: overview.calculatedNutrition.fiber,
    itemCount: overview.itemCount
  });

  if (overview.storedSummaryStatus !== "unavailable" || !overview.warnings.includes("stored_summary_unavailable")) {
    fail("stored summary unavailable semantics", "Missing persisted summary must be explicit unavailable metadata.");
  }
  pass("stored summary unavailable semantics", { storedSummaryFound: false, status: overview.storedSummaryStatus });

  if (overview.plannedMealsStatus !== "unavailable" || overview.plannedMeals.length !== 0 || !overview.warnings.includes("planned_meals_unavailable")) {
    fail("planned meals unavailable semantics", "Planned meal runtime must remain unavailable and separated from actual totals.");
  }
  pass("planned meals unavailable semantics", { plannedMealsStatus: overview.plannedMealsStatus, includedInActualTotals: false });

  if (overview.status !== "partial") fail("overview partial status", "Live shared overview should be partial when optional stored/planned sources are unavailable.", { status: overview.status });
  pass("overview partial status", { partialReasons: [...overview.warnings].sort() });

  const repeatedResult = await overviewService.getCurrentUserTodayIntakeOverview({ date: overviewDate });
  if (!repeatedResult.ok) fail("deterministic repeat read", "Repeated overview read failed with typed overview error.", { code: repeatedResult.error.code });
  if (!compareOverviewTotals(overview, repeatedResult.value)) fail("deterministic repeat read", "Repeated overview read did not preserve status/count/nutrition/warning parity.");
  pass("deterministic repeat read", { deterministic: true });

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase,
    checks,
    overviewStatus: overview.status,
    partialReasons: [...overview.warnings].sort(),
    mealCount: overview.mealCount,
    itemCount: overview.itemCount,
    nutrition: {
      calories: overview.calculatedNutrition.calories,
      protein: overview.calculatedNutrition.protein,
      carbohydrates: overview.calculatedNutrition.carbohydrates,
      fat: overview.calculatedNutrition.fat,
      fiber: overview.calculatedNutrition.fiber
    },
    storedSummaryFound: false,
    storedSummaryStatus: overview.storedSummaryStatus,
    plannedMealsStatus: overview.plannedMealsStatus,
    plannedMealsIncludedInActualTotals: false,
    dateSelected: true,
    timezoneSelected: true,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
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
    reason: "Live shared intake read smoke failed.",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    summaryIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    productionTouched: false,
    nextPhaseStarted: false
  }, null, 2));
  process.exitCode = 1;
}
