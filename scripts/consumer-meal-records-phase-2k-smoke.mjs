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

function skipped(reason) {
  console.log(JSON.stringify({
    status: "skipped",
    phase: "Consumer Runtime Integration Phase 2K Live Daily Nutrition Summary Persistence Smoke",
    reason,
    supabaseClientCreated: false,
    signInUsed: false,
    networkRequestUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
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

function blocked(reason, missing = [], extra = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "Consumer Runtime Integration Phase 2K Live Daily Nutrition Summary Persistence Smoke",
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
if (env.TASTKIND_CONSUMER_PHASE2K_LIVE_SUMMARY_PERSISTENCE !== "true") {
  skipped("SKIPPED - explicit Phase 2K Development live daily summary persistence opt-in was not enabled.");
  process.exit(0);
}

const requiredFlags = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE: "supabase",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN: "true"
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

const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail = env.TASTKIND_CONSUMER_PHASE2K_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2F_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword = env.TASTKIND_CONSUMER_PHASE2K_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2F_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2K_SMOKE_EMAIL or fallback email");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2K_SMOKE_PASSWORD or fallback password");
if (missing.length) blocked("Live daily summary persistence smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) blocked("Live daily summary persistence smoke refuses privileged credentials.", ["publishable/anon key"]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2k-live-"));
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

try {
  const mealFlags = mealRuntime.getConsumerMealRuntimeFlags(env);
  if (mealFlags.issues.length) fail("live daily summary persistence flags accepted", "Live daily summary persistence flags were rejected.", { issueCount: mealFlags.issues.length });
  pass("live daily summary persistence flags accepted");

  const authEnv = { ...env, EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false" };
  const authFlags = authRuntime.getConsumerRuntimeFlags(authEnv);
  if (authFlags.issues.length) fail("live auth flags accepted", "Live auth flags were rejected.", { issueCount: authFlags.issues.length });
  pass("live auth flags accepted");

  const authPort = new authRuntime.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed with typed auth error.", { code: signIn.error.code });
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false });

  const mealService = mealRuntime.createConsumerMealRecordsService(mealFlags, { authPort, mealClient: supabase });
  const recentMeals = await mealService.listCurrentUserMealRecords({ limit: 20 });
  if (!recentMeals.ok) fail("current meal records read", "Current meal records read failed with typed meal error.", { code: recentMeals.error.code });

  const summaryDate = env.TASTKIND_CONSUMER_PHASE2K_SUMMARY_DATE ?? recentMeals.value[0]?.mealDate ?? new Date().toISOString().slice(0, 10);
  const timezone = env.TASTKIND_CONSUMER_PHASE2K_SUMMARY_TIMEZONE ?? recentMeals.value[0]?.timezone ?? "Asia/Taipei";
  const exactMeals = await mealService.listCurrentUserMealRecords({ startDate: summaryDate, endDate: summaryDate, limit: 100 });
  if (!exactMeals.ok) fail("summary-date meal records read", "Summary-date meal records read failed with typed meal error.", { code: exactMeals.error.code });
  if (exactMeals.value.length < 1) fail("summary-date meal records read", "Phase 2K live persistence requires at least one Development meal record for the selected date.");
  pass("summary-date meal records read", { mealCount: exactMeals.value.length, rawRowsPrinted: false, recordIdsPrinted: false });

  const calculated = mealRuntime.calculateDailyNutritionSummary({
    summaryDate,
    timezone,
    calculatedAt: new Date().toISOString(),
    mealRecords: exactMeals.value
  });
  if (!calculated.ok) fail("daily summary calculation", "Daily summary calculation failed with typed error.", { code: calculated.error.code });
  pass("daily summary calculation", {
    summaryDateSelected: true,
    mealCount: calculated.value.mealCount,
    itemCount: calculated.value.itemCount,
    nutrition: {
      calories: calculated.value.calories,
      protein: calculated.value.protein,
      carbohydrates: calculated.value.carbohydrates,
      fat: calculated.value.fat,
      fiber: calculated.value.fiber
    }
  });

  const persistenceService = mealRuntime.createConsumerDailyNutritionSummaryPersistenceService(mealFlags, {
    authPort,
    mealClient: supabase,
    clock: { now: () => new Date() },
    timezone
  });
  const firstPersistence = await persistenceService.persistCurrentUserDailyNutritionSummary({ summaryDate });
  if (firstPersistence.status !== "persisted") fail("first summary persistence RPC", "First summary persistence did not return persisted.", { status: firstPersistence.status, errorCode: firstPersistence.errorCode });
  pass("first summary persistence RPC", { status: firstPersistence.status, rpcInvoked: true });

  const summaryService = mealRuntime.createConsumerDailyNutritionSummaryService(mealFlags, { authPort, mealClient: supabase });
  const firstStored = await summaryService.getCurrentUserDailyNutritionSummary({ summaryDate, timezone });
  if (!firstStored.ok) fail("read-after-write", "Stored summary read-after-write failed with typed summary error.", { code: firstStored.error.code });
  pass("read-after-write", { storedSummaryFound: true, summaryIdsPrinted: false, rawRowsPrinted: false });

  const firstParity = mealRuntime.compareStoredAndCalculatedDailyNutritionSummary(firstStored.value, calculated.value);
  if (!firstParity.ok) fail("stored/calculated parity", "Stored/calculated parity comparison failed with typed error.", { code: firstParity.error.code });
  if (!firstParity.value.matches) fail("stored/calculated parity", "Stored summary did not match calculated totals.", { mismatchCount: firstParity.value.differences.length, mismatchMetrics: firstParity.value.differences.map((difference) => difference.metric) });
  pass("stored/calculated parity", { matches: true });

  const secondPersistence = await persistenceService.persistCurrentUserDailyNutritionSummary({ summaryDate });
  if (secondPersistence.status !== "persisted") fail("second summary persistence RPC", "Second summary persistence did not return persisted.", { status: secondPersistence.status, errorCode: secondPersistence.errorCode });
  pass("second summary persistence RPC", { status: secondPersistence.status, rpcInvoked: true });

  const secondStored = await summaryService.getCurrentUserDailyNutritionSummary({ summaryDate, timezone });
  if (!secondStored.ok) fail("second read-after-write", "Second stored summary read failed with typed summary error.", { code: secondStored.error.code });

  const secondParity = mealRuntime.compareStoredAndCalculatedDailyNutritionSummary(secondStored.value, calculated.value);
  if (!secondParity.ok || !secondParity.value.matches) fail("repeat stored/calculated parity", "Second stored summary did not match calculated totals.");
  pass("repeat stored/calculated parity", { matches: true });

  const countResponse = await supabase
    .from("daily_nutrition_summaries")
    .select("id", { count: "exact", head: true })
    .eq("local_date", summaryDate)
    .eq("timezone", timezone)
    .eq("calculation_version", calculated.value.calculationVersion)
    .eq("is_current", true);
  if (countResponse.error) fail("same user/date row count", "Authenticated row-count check failed.");
  if (countResponse.count !== 1) fail("same user/date row count", "Repeated persistence should leave exactly one current summary row for the authenticated user/date.", { count: countResponse.count });
  pass("same user/date row count", { count: countResponse.count });

  const deterministicNutrition =
    firstStored.value.calories === secondStored.value.calories &&
    firstStored.value.protein === secondStored.value.protein &&
    firstStored.value.carbohydrates === secondStored.value.carbohydrates &&
    firstStored.value.fat === secondStored.value.fat &&
    firstStored.value.fiber === secondStored.value.fiber &&
    firstStored.value.mealCount === secondStored.value.mealCount;
  if (!deterministicNutrition) fail("deterministic repeated persistence", "Repeated persistence changed canonical nutrition values.");
  pass("deterministic repeated persistence", { nutritionStable: true });

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Integration Phase 2K Live Daily Nutrition Summary Persistence Smoke",
    checks,
    summaryDateSelected: true,
    mealCount: calculated.value.mealCount,
    itemCount: calculated.value.itemCount,
    calculatedNutrition: {
      calories: calculated.value.calories,
      protein: calculated.value.protein,
      carbohydrates: calculated.value.carbohydrates,
      fat: calculated.value.fat,
      fiber: calculated.value.fiber
    },
    firstPersistence: "passed",
    readAfterWrite: "passed",
    storedSummaryFound: true,
    storedCalculatedParity: "passed",
    secondPersistence: "passed",
    duplicatePrevention: "passed",
    sameUserDateRowCount: 1,
    deterministicResult: "passed",
    supabaseClientCreated: true,
    signInUsed: true,
    networkRequestUsed: true,
    databaseReadUsed: true,
    databaseWriteUsed: true,
    rpcInvoked: true,
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
} catch (error) {
  try {
    await supabase.auth.signOut();
  } catch {
    // Best-effort cleanup; do not print provider error details.
  }
  console.log(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Integration Phase 2K Live Daily Nutrition Summary Persistence Smoke",
    reason: "Live daily summary persistence smoke failed.",
    checks,
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
  process.exitCode = 1;
}
