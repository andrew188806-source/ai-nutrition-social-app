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
const requiredFlags = {
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
};

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
    phase: "Consumer Runtime Integration Phase 2B Live Meal Read Smoke",
    reason,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    phase2cStarted: false
  }, null, 2));
}

function blocked(reason, missing = [], extra = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "Consumer Runtime Integration Phase 2B Live Meal Read Smoke",
    reason,
    missing,
    ...extra,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    phase2cStarted: false
  }, null, 2));
  process.exit(2);
}

const env = buildEnv();
if (env.TASTKIND_CONSUMER_PHASE2B_LIVE_MEAL_SMOKE !== "true") {
  skipped("SKIPPED - explicit Phase 2B Development live meal read opt-in was not enabled.");
  process.exit(0);
}

const missing = [];
for (const [key, expected] of Object.entries(requiredFlags)) {
  if (env[key] !== expected) missing.push(key);
}
const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail = env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword = env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL or Phase 1D/1C fallback email");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD or Phase 1D/1C fallback password");
if (missing.length) blocked("Live meal smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) {
  blocked("Live meal smoke refuses privileged credentials.", ["publishable/anon key"]);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2b-live-"));
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

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const requireFromAuthTemp = createRequire(path.join(tempRoot, "consumer-auth", "index.js"));
const requireFromMealTemp = createRequire(path.join(tempRoot, "consumer-meals", "consumerMealRecordsService.js"));
const authRuntime = requireFromAuthTemp("./index.js");
const mealFeatureFlags = requireFromMealTemp("./featureFlags.js");
const mealRepositoryModule = requireFromMealTemp("./adapters/supabaseConsumerMealRecordsRepository.js");
const mealServiceModule = requireFromMealTemp("./consumerMealRecordsService.js");

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

function verifyMealRecordShape(record) {
  if (!record || typeof record !== "object") return false;
  if (!record.mealRecordId || !record.mealType || !record.occurredAt || !record.mealDate || !record.timezone || !Array.isArray(record.items)) return false;
  return record.items.every((item) => item.mealRecordItemId && item.displayName && item.nutrition && item.nutritionSource && item.nutritionSchemaVersion);
}

function verifyStableOrdering(records) {
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    const occurredCompare = previous.occurredAt.localeCompare(current.occurredAt);
    if (occurredCompare < 0) return false;
    if (occurredCompare === 0 && previous.mealRecordId.localeCompare(current.mealRecordId) < 0) return false;
  }
  return true;
}

try {
  const flags = mealFeatureFlags.getConsumerMealRuntimeFlags(env);
  if (flags.issues.length) fail("live meal flags accepted", "Live meal flags were rejected by runtime parser.", { issueCount: flags.issues.length });
  pass("live meal flags accepted");

  const authFlags = authRuntime.getConsumerRuntimeFlags(env);
  if (authFlags.issues.length) fail("live auth flags accepted", "Live auth flags were rejected by runtime parser.", { issueCount: authFlags.issues.length });
  pass("live auth flags accepted");

  const authPort = new authRuntime.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed with typed auth error.", { code: signIn.error.code });
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false });

  const mealRepository = new mealRepositoryModule.SupabaseConsumerMealRecordsRepository({
    authPort,
    mealClient: supabase,
    readEnabled: true
  });
  const mealService = new mealServiceModule.ConsumerMealRecordsService({ repository: mealRepository });
  const mealRead = await mealService.listCurrentUserMealRecords({ limit: 20 });
  if (!mealRead.ok) fail("current meal records read", "Current meal records read failed with typed meal error.", { code: mealRead.error.code });
  pass("current meal records read", { resultCount: mealRead.value.length, rawRowsPrinted: false });

  const records = mealRead.value;
  if (records.length === 0) {
    pass("empty canonical result", { result: "empty-list" });
    pass("non-empty live row mapping skipped", { reason: "no meal records existed for the authenticated Development user" });
  } else {
    if (!records.every(verifyMealRecordShape)) fail("canonical meal shape", "Canonical meal result omitted required fields.");
    pass("canonical meal shape", { checkedRecords: records.length });
    if (!verifyStableOrdering(records)) fail("stable ordering", "Canonical meal results were not in occurredAt DESC, mealRecordId DESC order.");
    pass("stable ordering");
  }

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Integration Phase 2B Live Meal Read Smoke",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    phase2cStarted: false
  }, null, 2));
} catch (error) {
  try {
    await supabase.auth.signOut();
  } catch {
    // Best-effort cleanup; do not print provider error details.
  }
  console.log(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Integration Phase 2B Live Meal Read Smoke",
    reason: "Live meal read smoke failed.",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    recordIdsPrinted: false,
    rawRowsPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false,
    fixtureCreated: false,
    phase2cStarted: false
  }, null, 2));
  process.exitCode = 1;
}
