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
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live",
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

function blocked(reason, missing = [], extra = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "Consumer Runtime Integration Phase 1D Live Profile Smoke",
    reason,
    missing,
    ...extra,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    databaseWriteUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false
  }, null, 2));
  process.exit(2);
}

const env = buildEnv();
if (env.TASTKIND_CONSUMER_PHASE1D_LIVE_PROFILE_SMOKE !== "true") {
  blocked("Live profile smoke is opt-in only. Set TASTKIND_CONSUMER_PHASE1D_LIVE_PROFILE_SMOKE=true in local environment.");
}

const missing = [];
for (const [key, expected] of Object.entries(requiredFlags)) {
  if (env[key] !== expected) missing.push(key);
}
const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail = env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword = env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL or TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD or TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD");
if (missing.length) blocked("Live profile smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) {
  blocked("Live profile smoke refuses privileged credentials.", ["publishable/anon key"]);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-profile-phase1d-live-"));
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
const phase1d = requireFromTemp("./index.js");

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
  const flags = phase1d.getConsumerRuntimeFlags(env);
  if (flags.issues.length) fail("live profile flags accepted", "Live profile flags were rejected by runtime parser.", { issueCount: flags.issues.length });
  pass("live profile flags accepted");

  const authPort = new phase1d.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed with typed auth error.", { code: signIn.error.code });
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false });

  const profileRepository = new phase1d.SupabaseConsumerProfileRepository({
    authPort,
    profileClient: supabase,
    readEnabled: true
  });
  const profile = await profileRepository.getCurrentProfile();
  if (!profile.ok && profile.error.code === "profile_not_found") {
    await authPort.signOut();
    blocked("Phase 1D live profile read is pending because the authenticated user has no consumer_profiles row.", [], {
      liveAuthVerified: true,
      liveProfileReadResult: "profile_not_found"
    });
  }
  if (!profile.ok) fail("current profile read", "Current profile read failed with typed profile error.", { code: profile.error.code });
  if (!profile.value.profileId || !profile.value.displayName) fail("canonical profile mapping", "Canonical profile mapping omitted required profile fields.");
  pass("current profile read", { canonicalProfileMapped: true, userIdPrinted: false });

  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed with typed auth error.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Integration Phase 1D Live Profile Smoke",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    databaseWriteUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Integration Phase 1D Live Profile Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    databaseWriteUsed: false,
    sqlExecuted: false,
    migrationCreated: false,
    seedExecuted: false
  }, null, 2));
  process.exitCode = 1;
}
