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
    phase: "Consumer Runtime Integration Phase 2F Live Daily Nutrition Summary Read Smoke",
    reason,
    supabaseClientCreated: false,
    networkRequestUsed: false,
    summaryReadExecuted: false,
    mealReadExecuted: false,
    parityExecuted: false,
    paritySkipped: true,
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

function blocked(reason, missing = [], extra = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "Consumer Runtime Integration Phase 2F Live Daily Nutrition Summary Read Smoke",
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
if (env.TASTKIND_CONSUMER_PHASE2F_LIVE_SUMMARY_READ !== "true") {
  skipped("SKIPPED - explicit Phase 2F Development live daily summary read opt-in was not enabled.");
  process.exit(0);
}

const requiredMealFlags = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN: "true"
};
const missing = [];
for (const [key, expected] of Object.entries(requiredMealFlags)) {
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
const signInEmail = env.TASTKIND_CONSUMER_PHASE2F_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword = env.TASTKIND_CONSUMER_PHASE2F_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2F_SMOKE_EMAIL or fallback email");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2F_SMOKE_PASSWORD or fallback password");
if (missing.length) blocked("Live daily summary read smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) blocked("Live daily summary read smoke refuses privileged credentials.", ["publishable/anon key"]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2f-live-"));
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

try {
  const mealFlags = mealRuntime.getConsumerMealRuntimeFlags(env);
  if (mealFlags.issues.length) fail("live daily summary flags accepted", "Live daily summary flags were rejected.", { issueCount: mealFlags.issues.length });
  pass("live daily summary flags accepted");

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

  const summaryDate = env.TASTKIND_CONSUMER_PHASE2F_SUMMARY_DATE ?? recentMeals.value[0]?.mealDate ?? new Date().toISOString().slice(0, 10);
  const timezone = env.TASTKIND_CONSUMER_PHASE2F_SUMMARY_TIMEZONE ?? recentMeals.value[0]?.timezone ?? "Asia/Taipei";
  const exactMeals = await mealService.listCurrentUserMealRecords({ startDate: summaryDate, endDate: summaryDate, limit: 100 });
  if (!exactMeals.ok) fail("summary-date meal records read", "Summary-date meal records read failed with typed meal error.", { code: exactMeals.error.code });
  pass("summary-date meal records read", { resultCount: exactMeals.value.length, rawRowsPrinted: false, recordIdsPrinted: false });

  const summaryService = mealRuntime.createConsumerDailyNutritionSummaryService(mealFlags, { authPort, mealClient: supabase });
  const storedSummary = await summaryService.getCurrentUserDailyNutritionSummary({ summaryDate, timezone });
  let storedFound = false;
  let parityExecuted = false;
  let paritySkipped = true;
  if (storedSummary.ok) {
    storedFound = true;
    pass("stored daily summary read", { found: true, rawRowsPrinted: false, summaryIdsPrinted: false });
  } else if (storedSummary.error.code === "daily_summary_not_found") {
    pass("stored daily summary read", { found: false, result: "not_found", rawRowsPrinted: false, summaryIdsPrinted: false });
  } else {
    fail("stored daily summary read", "Stored daily summary read failed with typed summary error.", { code: storedSummary.error.code });
  }

  const calculated = mealRuntime.calculateDailyNutritionSummary({
    summaryDate,
    timezone,
    calculatedAt: new Date().toISOString(),
    mealRecords: exactMeals.value
  });
  if (!calculated.ok) fail("in-memory daily summary recalculation", "Daily summary recalculation failed with typed error.", { code: calculated.error.code });
  pass("in-memory daily summary recalculation", { mealCount: exactMeals.value.length, itemCountAvailable: calculated.value.itemCountAvailable });

  if (storedSummary.ok) {
    const parity = mealRuntime.compareStoredAndCalculatedDailyNutritionSummary(storedSummary.value, calculated.value);
    parityExecuted = true;
    paritySkipped = false;
    if (!parity.ok) fail("stored/calculated parity", "Stored/calculated parity comparison failed with typed error.", { code: parity.error.code });
    if (!parity.value.matches) fail("stored/calculated parity", "Stored daily summary did not match in-memory recalculation.", { mismatchCount: parity.value.differences.length, mismatchMetrics: parity.value.differences.map((difference) => difference.metric) });
    pass("stored/calculated parity", { matches: true, itemCountCompared: storedSummary.value.itemCountAvailable && calculated.value.itemCountAvailable });
  } else {
    pass("stored/calculated parity skipped", { reason: "stored_summary_not_found" });
  }

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Integration Phase 2F Live Daily Nutrition Summary Read Smoke",
    checks,
    storedSummaryFound: storedFound,
    parityExecuted,
    paritySkipped,
    summaryDateSelected: true,
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
} catch (error) {
  try {
    await supabase.auth.signOut();
  } catch {
    // Best-effort cleanup; do not print provider error details.
  }
  console.log(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Integration Phase 2F Live Daily Nutrition Summary Read Smoke",
    reason: "Live daily summary read smoke failed.",
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
