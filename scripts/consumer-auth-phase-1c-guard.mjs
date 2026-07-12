import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mobileNodeModulesPath = path.join(root, "apps", "mobile", "node_modules");
const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedReactNativeBoundaryFiles = new Set([
  "apps/mobile/features/consumer-auth/asyncStorageConsumerAuthStorage.ts",
  "apps/mobile/features/consumer-auth/reactNativeAppStateSource.ts"
]);
const approvedProfileReadFiles = new Set(["apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts"]);
const issues = [];
const checks = [];

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

const requiredFiles = [
  "featureFlags.ts",
  "factories.ts",
  "supabaseConsumerClientFactory.ts",
  "supabaseSdkLoader.ts",
  "supabaseAuthContracts.ts",
  "supabaseAuthMappers.ts",
  "asyncStorageConsumerAuthStorage.ts",
  "appStateRefreshLifecycle.ts",
  "reactNativeAppStateSource.ts",
  "sessionStateStore.ts",
  path.join("adapters", "supabaseConsumerAuthAdapter.ts")
];

for (const file of requiredFiles) {
  const full = path.join(sourceRoot, file);
  if (fs.existsSync(full)) pass(`Phase 1C file exists: ${file}`);
  else fail(`Phase 1C file exists: ${file}`, "Missing Consumer Phase 1C runtime file.");
}

const sourceFiles = walk(sourceRoot, (file) => file.endsWith(".ts"));
const sourceText = sourceFiles.map((file) => ({ file, rel: relative(file), text: fs.readFileSync(file, "utf8") }));

const sdkImportMatches = sourceText.filter((item) => /@supabase\/supabase-js|react-native-url-polyfill/.test(item.text)).map((item) => item.rel);
const unapprovedSdkImports = sdkImportMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedSdkImports.length) fail("SDK imports limited to official lazy loader", "Supabase SDK/polyfill imports may only appear in supabaseSdkLoader.ts.", { matches: unapprovedSdkImports });
else pass("SDK imports limited to official lazy loader", { matches: sdkImportMatches });

const createClientMatches = sourceText.filter((item) => /\bcreateClient\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedCreateClient = createClientMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedCreateClient.length) fail("createClient limited to official lazy loader", "createClient may only appear in supabaseSdkLoader.ts.", { matches: unapprovedCreateClient });
else pass("createClient limited to official lazy loader", { matches: createClientMatches });

const reactNativeBoundaryMatches = sourceText.filter((item) => /from "react-native"|@react-native-async-storage\/async-storage/.test(item.text)).map((item) => item.rel);
const unapprovedReactNativeBoundary = reactNativeBoundaryMatches.filter((file) => !approvedReactNativeBoundaryFiles.has(file));
if (unapprovedReactNativeBoundary.length) fail("React Native boundary imports limited to adapters", "React Native AppState/AsyncStorage imports must stay in approved boundary files.", { matches: unapprovedReactNativeBoundary });
else pass("React Native boundary imports limited to adapters", { matches: reactNativeBoundaryMatches });

const forbiddenSourcePatterns = [
  [/\bfetch\s*\(/, "Consumer Phase 1C guard code must not add direct fetch calls."],
  [/\bXMLHttpRequest\b/, "Consumer Phase 1C guard code must not add direct XMLHttpRequest calls."],
  [/WebSocket\s*\(/, "Consumer Phase 1C must not add explicit realtime sockets."],
  [/service[_-]?role/i, "Service-role wording must not appear in Mobile Consumer source."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in Mobile Consumer source."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in Mobile Consumer source."],
  [/\.(insert|upsert|update|rpc)\s*\(/, "Consumer Phase 1C must not add database write/RPC calls."],
  [/storage\.from\s*\(/, "Consumer Phase 1C must not add Supabase Storage calls."]
];

for (const [pattern, message] of forbiddenSourcePatterns) {
  const matches = sourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden source pattern absent: ${pattern}`);
}

const databaseQueryMatches = sourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedDatabaseQueries = databaseQueryMatches.filter((file) => !approvedProfileReadFiles.has(file));
if (unapprovedDatabaseQueries.length) fail("database query calls limited to Phase 1D profile adapter", "Consumer database queries may only appear in the approved Phase 1D read-only profile adapter.", { matches: unapprovedDatabaseQueries });
else pass("database query calls limited to Phase 1D profile adapter", { matches: databaseQueryMatches });

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-auth|@supabase\/supabase-js|react-native-url-polyfill/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (uiImports.length) fail("UI does not import Consumer Auth or SDK", "Mobile UI must not be wired to Consumer Auth/Profile in Phase 1C.", { matches: uiImports });
else pass("UI does not import Consumer Auth or SDK");

const crossSurfaceFiles = [
  ...walk(path.join(root, "apps", "restaurant-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "admin-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const crossSurfaceImports = crossSurfaceFiles.filter((file) => /consumer-auth/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (crossSurfaceImports.length) fail("Restaurant/Admin do not import Mobile Consumer Auth", "Cross-surface Consumer Auth imports are not allowed.", { matches: crossSurfaceImports });
else pass("Restaurant/Admin do not import Mobile Consumer Auth");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-auth-phase1c-"));
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

let networkCalls = 0;
let websocketCalls = 0;
const previousFetch = globalThis.fetch;
const previousWebSocket = globalThis.WebSocket;
globalThis.fetch = () => {
  networkCalls += 1;
  throw new Error("Phase 1C guard trapped fetch.");
};
globalThis.WebSocket = class {
  constructor() {
    websocketCalls += 1;
    throw new Error("Phase 1C guard trapped WebSocket.");
  }
};

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const requireFromTemp = createRequire(path.join(tempRoot, "index.js"));
const phase1c = requireFromTemp("./index.js");

function expectIssue(flags, messagePart) {
  if (!flags.issues.some((issue) => issue.includes(messagePart))) {
    throw new Error(`expected flag issue containing: ${messagePart}`);
  }
}

async function fakeLiveAuthTests() {
  const defaults = phase1c.getConsumerRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.profileSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.issues.length) {
    throw new Error("default flags should remain mock/disabled with no issues");
  }

  const liveFlags = phase1c.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "mock",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
  });
  if (liveFlags.issues.length || liveFlags.authSource !== "supabase-live" || !liveFlags.supabaseAuthEnabled) {
    throw new Error("Phase 1C live Auth flags should be accepted");
  }
  expectIssue(phase1c.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live" }), "requires");
  expectIssue(phase1c.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true" }), "can only be enabled");
  expectIssue(phase1c.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live" }), "profile");
  expectIssue(phase1c.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true" }), "writes");
  expectIssue(phase1c.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "surprise" }), "Unknown");

  const storage = new phase1c.MemoryConsumerAuthStorage();
  const fakeUser = {
    id: "00000000-0000-4000-8000-0000000001c0",
    app_metadata: { provider: "email" },
    is_anonymous: false,
    email_confirmed_at: "2026-07-12T00:00:00.000Z",
    created_at: "2026-07-12T00:00:00.000Z",
    last_sign_in_at: "2026-07-12T00:01:00.000Z"
  };
  const fakeSession = { user: fakeUser, expires_in: 3600 };
  const calls = [];
  let unsubscribed = false;
  const fakeAuthClient = {
    getSession: async () => { calls.push("getSession"); return { data: { session: fakeSession }, error: null }; },
    signInWithPassword: async () => { calls.push("signIn"); return { data: { session: fakeSession }, error: null }; },
    signUp: async () => { calls.push("signUp"); return { data: { session: fakeSession }, error: null }; },
    signOut: async () => { calls.push("signOut"); return { data: {}, error: null }; },
    refreshSession: async () => { calls.push("refresh"); return { data: { session: fakeSession }, error: null }; },
    resetPasswordForEmail: async () => { calls.push("reset"); return { data: {}, error: null }; },
    onAuthStateChange: (callback) => {
      calls.push("observe");
      callback("SIGNED_IN", fakeSession);
      return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
    },
    startAutoRefresh: () => calls.push("startAutoRefresh"),
    stopAutoRefresh: () => calls.push("stopAutoRefresh")
  };
  let sdkLoaderCalls = 0;
  const sdkLoader = (options) => {
    sdkLoaderCalls += 1;
    if (options.url !== "https://phase-1c.invalid" || options.publishableKey !== "anon-placeholder") throw new Error("factory passed wrong env");
    if (!options.auth.persistSession || !options.auth.autoRefreshToken || options.auth.detectSessionInUrl) throw new Error("factory passed wrong auth options");
    return { auth: fakeAuthClient };
  };

  const authPort = phase1c.createConsumerAuthPort(liveFlags, {
    env: { url: "https://phase-1c.invalid", publishableKey: "anon-placeholder" },
    storage,
    sdkLoader
  });
  if (authPort.source !== "supabase-live" || sdkLoaderCalls !== 1) throw new Error("live factory should create live auth adapter lazily once");

  const restored = await authPort.restoreSession();
  if (!restored.ok || restored.value?.user.userId !== fakeUser.id) throw new Error("restore/get session mapping failed");
  const signedIn = await authPort.signIn({ email: "demo@example.test", password: "password" });
  if (!signedIn.ok || signedIn.value.user.userId !== fakeUser.id) throw new Error("sign-in mapping failed");
  const signedUp = await authPort.signUp({ email: "new@example.test", password: "password", displayName: "New Demo" });
  if (!signedUp.ok || signedUp.value.user.userId !== fakeUser.id) throw new Error("sign-up session mapping failed");
  const refreshed = await authPort.refreshSession();
  if (!refreshed.ok || refreshed.value?.user.userId !== fakeUser.id) throw new Error("refresh mapping failed");
  const observed = [];
  const unsubscribe = authPort.observeAuthState((state) => observed.push(state.status));
  unsubscribe();
  if (!unsubscribed || observed[0] !== "signedIn") throw new Error("auth observer/unsubscribe failed");
  const signedOut = await authPort.signOut();
  if (!signedOut.ok) throw new Error("sign-out mapping failed");
  const reset = await authPort.sendPasswordReset({ email: "demo@example.test" });
  if (reset.ok || reset.error.code !== "operation_not_enabled" || calls.includes("reset")) throw new Error("password reset must remain disabled");

  const noSessionAuth = new phase1c.SupabaseConsumerAuthAdapter({
    authClient: { ...fakeAuthClient, signUp: async () => ({ data: { session: null }, error: null }) },
    transportEnabled: true
  });
  const confirmation = await noSessionAuth.signUp({ email: "confirm@example.test", password: "password" });
  if (confirmation.ok || confirmation.error.code !== "email_confirmation_required") throw new Error("sign-up without session should require email confirmation");

  const stateStore = new phase1c.ConsumerAuthStateStore(authPort);
  await stateStore.restore();
  if (stateStore.getState().status !== "signedIn") throw new Error("state store restore failed");
  await stateStore.refresh();
  if (stateStore.getState().status !== "signedIn") throw new Error("state store refresh failed");
  await stateStore.signUp({ email: "state@example.test", password: "password" });
  await stateStore.signOut();
  if (stateStore.getState().status === "error") throw new Error("state store sign-up/sign-out failed");

  const lifecycleEvents = [];
  const lifecycle = new phase1c.ConsumerAuthRefreshLifecycle(
    { startAutoRefresh: () => lifecycleEvents.push("start"), stopAutoRefresh: () => lifecycleEvents.push("stop") },
    { addEventListener: (_event, listener) => { listener("active"); listener("background"); listener("inactive"); return { remove: () => lifecycleEvents.push("remove") }; } }
  );
  lifecycle.initialize();
  lifecycle.initialize();
  lifecycle.dispose();
  if (lifecycleEvents.join(",") !== "start,stop,remove") throw new Error("AppState lifecycle failed");

  for (const badDeps of [
    {},
    { storage, sdkLoader },
    { env: { url: "https://phase-1c.invalid", publishableKey: "anon-placeholder" }, sdkLoader },
    { env: { url: "https://phase-1c.invalid", publishableKey: "anon-placeholder" }, storage }
  ]) {
    try {
      phase1c.createConsumerAuthPort(liveFlags, badDeps);
      throw new Error("bad live dependencies should fail closed");
    } catch (error) {
      if (!(error instanceof phase1c.ConsumerAuthError)) throw error;
    }
  }

  try {
    phase1c.createConsumerProfileRepository({ ...liveFlags, profileSource: "supabase-live", issues: [] });
    throw new Error("live profile repository without dependencies should fail closed");
  } catch (error) {
    if (!(error instanceof phase1c.ConsumerAuthError)) throw error;
  }

  const env = phase1c.getSupabaseConsumerEnvironment({
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://phase-1c.invalid",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: "anon-placeholder"
  });
  if (env.url !== "https://phase-1c.invalid" || env.publishableKey !== "anon-placeholder") throw new Error("public env mapping failed");

  const sdkLoaderSource = fs.readFileSync(path.join(sourceRoot, "supabaseSdkLoader.ts"), "utf8");
  if (!/processLock/.test(sdkLoaderSource) || !/detectSessionInUrl:\s*false/.test(fs.readFileSync(path.join(sourceRoot, "supabaseConsumerClientFactory.ts"), "utf8"))) {
    throw new Error("official SDK loader/factory auth options are incomplete");
  }
}

try {
  await fakeLiveAuthTests();
  pass("fake live Auth transport tests");
} catch (error) {
  fail("fake live Auth transport tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
  globalThis.WebSocket = previousWebSocket;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 1C guard.", { networkCalls });
if (websocketCalls === 0) pass("guard opened no realtime socket");
else fail("guard opened no realtime socket", "WebSocket was constructed during Phase 1C guard.", { websocketCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 1C",
  reason: issues.length ? "Phase 1C guard failed" : "Development Live Auth architecture verified with fake transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  approvedSdkImportFiles: [...approvedSdkImportFiles],
  approvedReactNativeBoundaryFiles: [...approvedReactNativeBoundaryFiles],
  checks,
  issues,
  realSupabaseClientCreated: false,
  liveSmokeExecuted: false,
  liveNetworkRequestUsed: false,
  databaseReadOrWriteUsed: false,
  credentialsPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
