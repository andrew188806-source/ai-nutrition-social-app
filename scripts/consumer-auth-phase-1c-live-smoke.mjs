import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mobilePackagePath = path.join(root, "apps", "mobile", "package.json");
const mobileNodeModulesPath = path.join(root, "apps", "mobile", "node_modules");
const requiredFlags = {
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "mock",
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

function blocked(reason, missing = []) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "Consumer Runtime Integration Phase 1C Live Smoke",
    reason,
    missing,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    databaseReadOrWriteUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false
  }, null, 2));
  process.exit(2);
}

const env = buildEnv();
if (env.TASTKIND_CONSUMER_PHASE1C_LIVE_SMOKE !== "true") {
  blocked("Live smoke is opt-in only. Set TASTKIND_CONSUMER_PHASE1C_LIVE_SMOKE=true in local environment.");
}

const missing = [];
for (const [key, expected] of Object.entries(requiredFlags)) {
  if (env[key] !== expected) missing.push(key);
}
const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail = env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword = env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD");
if (missing.length) blocked("Live smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) {
  blocked("Live smoke refuses privileged credentials.", ["publishable/anon key"]);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-auth-phase1c-live-"));
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && full.endsWith(".ts")) sourceFiles.push(full);
  }
}
walk(sourceRoot);

for (const file of sourceFiles) {
  const rel = path.relative(sourceRoot, file).replaceAll(path.sep, "/");
  const target = path.join(tempRoot, rel).replace(/\.ts$/, ".js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let source = fs.readFileSync(file, "utf8");
  if (rel === "index.ts") {
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
const requireFromTemp = createRequire(path.join(tempRoot, "index.js"));
const phase1c = requireFromTemp("./index.js");

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

function assertNoTokenLeak(session) {
  if (!session) return;
  const accessTokenField = ["access", "token"].join("_");
  const refreshTokenField = ["refresh", "token"].join("_");
  if (accessTokenField in session || refreshTokenField in session) {
    fail("canonical session excludes provider tokens", "Adapter leaked provider tokens into canonical session.");
  }
}

try {
  const flags = phase1c.getConsumerRuntimeFlags(env);
  if (flags.issues.length) fail("live flags accepted", "Live flags were rejected by runtime parser.", { issueCount: flags.issues.length });
  pass("live flags accepted");

  let observerEvents = [];
  const authPort = new phase1c.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const unsubscribe = authPort.observeAuthState((state) => observerEvents.push(state.status));
  pass("auth observer subscribed");

  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed with typed auth error.", { code: signIn.error.code });
  assertNoTokenLeak(signIn.value);
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false });

  const restored = await authPort.restoreSession();
  if (!restored.ok || !restored.value?.user.userId) fail("session restore", "Session restore failed after sign-in.");
  assertNoTokenLeak(restored.value);
  if (storageValues.size === 0) fail("session persisted to auth storage", "Supabase Auth did not write to the smoke storage adapter.");
  pass("session restore", { storageEntryCount: storageValues.size });

  const refreshed = await authPort.refreshSession();
  if (!refreshed.ok || !refreshed.value?.user.userId) fail("session refresh", "Session refresh failed.");
  assertNoTokenLeak(refreshed.value);
  pass("session refresh");

  if (!observerEvents.includes("signedIn")) fail("observer saw sign-in event", "Observer did not receive a signed-in event.");
  pass("observer saw sign-in event");

  if (env.TASTKIND_CONSUMER_PHASE1C_SMOKE_SIGN_UP_ENABLED === "true") {
    const signUpEmail = env.TASTKIND_CONSUMER_PHASE1C_SMOKE_SIGN_UP_EMAIL;
    const signUpPassword = env.TASTKIND_CONSUMER_PHASE1C_SMOKE_SIGN_UP_PASSWORD;
    if (!signUpEmail || !signUpPassword) {
      fail("optional sign-up env present", "Sign-up smoke was enabled but sign-up email/password env is incomplete.");
    }
    const signUp = await authPort.signUp({ email: signUpEmail, password: signUpPassword, displayName: "Phase 1C Smoke" });
    if (signUp.ok) {
      assertNoTokenLeak(signUp.value);
      pass("optional email sign-up", { result: "authenticated-session" });
    } else if (signUp.error.code === "email_confirmation_required") {
      pass("optional email sign-up", { result: "email-confirmation-required" });
    } else {
      fail("optional email sign-up", "Sign-up failed with an unexpected typed error.", { code: signUp.error.code });
    }
  } else {
    pass("optional email sign-up skipped", { reason: "explicit opt-in not enabled" });
  }

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  const afterSignOut = await authPort.restoreSession();
  if (!afterSignOut.ok || afterSignOut.value !== null) fail("restore after sign-out", "Restore after sign-out still returned a session.");
  pass("restore after sign-out");

  unsubscribe();
  observerEvents = [];
  pass("auth observer unsubscribed");

  const lifecycleEvents = [];
  const lifecycle = new phase1c.ConsumerAuthRefreshLifecycle(
    { startAutoRefresh: () => lifecycleEvents.push("start"), stopAutoRefresh: () => lifecycleEvents.push("stop") },
    { addEventListener: (_event, listener) => { listener("active"); listener("active"); listener("background"); listener("background"); listener("active"); return { remove: () => lifecycleEvents.push("remove") }; } }
  );
  lifecycle.initialize();
  lifecycle.dispose();
  if (lifecycleEvents.join(",") !== "start,stop,start,remove,stop") {
    fail("AppState lifecycle", "AppState lifecycle did not start/stop auto refresh exactly as expected.", { eventCount: lifecycleEvents.length });
  }
  pass("AppState lifecycle");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Integration Phase 1C Live Smoke",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    databaseReadOrWriteUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Integration Phase 1C Live Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    databaseReadOrWriteUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false
  }, null, 2));
  process.exitCode = 1;
}
