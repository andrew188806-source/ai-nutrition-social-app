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
    phase: "Consumer Runtime Integration Phase 2D Live Meal Write Smoke",
    reason,
    supabaseClientCreated: false,
    networkRequestUsed: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    rawRowsPrinted: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    nextPhaseStarted: false
  }, null, 2));
}

function blocked(reason, missing = [], extra = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "Consumer Runtime Integration Phase 2D Live Meal Write Smoke",
    reason,
    missing,
    ...extra,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    rawRowsPrinted: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    nextPhaseStarted: false
  }, null, 2));
  process.exit(2);
}

const env = buildEnv();
if (env.TASTKIND_CONSUMER_PHASE2D_LIVE_MEAL_WRITE !== "true") {
  skipped("SKIPPED - explicit Phase 2D Development live meal write opt-in was not enabled.");
  process.exit(0);
}

const requiredMealFlags = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN: "true"
};
const missing = [];
for (const [key, expected] of Object.entries(requiredMealFlags)) {
  if (env[key] !== expected) missing.push(key);
}
const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail = env.TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword = env.TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL or fallback email");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD or fallback password");
if (missing.length) blocked("Live meal write smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) blocked("Live meal write smoke refuses privileged credentials.", ["publishable/anon key"]);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2d-live-"));
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
  if (mealFlags.issues.length) fail("live meal write flags accepted", "Live meal write flags were rejected.", { issueCount: mealFlags.issues.length });
  pass("live meal write flags accepted");

  const authEnv = { ...env, EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false" };
  const authFlags = authRuntime.getConsumerRuntimeFlags(authEnv);
  if (authFlags.issues.length) fail("live auth flags accepted", "Live auth flags were rejected.", { issueCount: authFlags.issues.length });
  pass("live auth flags accepted");

  const authPort = new authRuntime.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed with typed auth error.", { code: signIn.error.code });
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false });

  const timestamp = new Date().toISOString();
  const mealDate = timestamp.slice(0, 10);
  const writeRepository = new mealRuntime.SupabaseConsumerMealRecordWriteRepository({
    authPort,
    mealClient: supabase,
    writeEnabled: true
  });
  const writeService = new mealRuntime.ConsumerMealRecordWriteService({ repository: writeRepository });
  const writeResult = await writeService.createCurrentUserMealRecord({
    mealType: "snack",
    occurredAt: timestamp,
    mealDate,
    timezone: "Asia/Taipei",
    title: "Development Phase 2D smoke meal",
    note: "Development-only atomic write smoke",
    source: "manual",
    items: [
      {
        displayName: "Development smoke item",
        portion: "1 serving",
        nutrition: { calories: 123, protein: 12, carbohydrates: 18, fat: 4, fiber: 3 },
        nutritionSource: "manual",
        confidenceScore: 0.99,
        consumedRatio: 1
      }
    ]
  });
  if (!writeResult.ok) fail("atomic RPC write", "Atomic meal write failed with typed error.", { code: writeResult.error.code });
  if (writeResult.value.items.length !== 1) fail("canonical write result items", "Atomic meal write did not return expected item count.");
  pass("atomic RPC write", { itemCount: writeResult.value.items.length, rawRowsPrinted: false, recordIdsPrinted: false });

  const readRepository = new mealRuntime.SupabaseConsumerMealRecordsRepository({
    authPort,
    mealClient: supabase,
    readEnabled: true
  });
  const readService = new mealRuntime.ConsumerMealRecordsService({ repository: readRepository });
  const readResult = await readService.listCurrentUserMealRecords({ startDate: mealDate, endDate: mealDate, limit: 20 });
  if (!readResult.ok) fail("read-after-write", "Read-after-write failed with typed meal error.", { code: readResult.error.code });
  const found = readResult.value.find((record) => record.mealRecordId === writeResult.value.mealRecordId);
  if (!found || found.items.length !== writeResult.value.items.length) fail("read-after-write", "Created record was not found by current-user meal read.");
  pass("read-after-write", { found: true, itemCount: found.items.length, recordIdsPrinted: false });

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Integration Phase 2D Live Meal Write Smoke",
    checks,
    developmentTargetVerified: true,
    atomicWriteCompleted: true,
    readAfterWriteVerified: true,
    persistentDevelopmentSmokeRecordCreated: true,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
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
    phase: "Consumer Runtime Integration Phase 2D Live Meal Write Smoke",
    reason: "Live meal write smoke failed.",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
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
