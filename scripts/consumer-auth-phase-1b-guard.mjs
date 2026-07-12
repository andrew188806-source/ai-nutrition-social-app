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
const lockPath = path.join(root, "package-lock.json");
const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
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
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function lockPackage(lock, packagePath) {
  return lock.packages?.[packagePath] ?? null;
}

const mobilePackage = readJson(mobilePackagePath);
const lock = fs.existsSync(lockPath) ? readJson(lockPath) : { packages: {} };
const dependencies = mobilePackage.dependencies ?? {};
const mobileLock = lockPackage(lock, "apps/mobile") ?? { dependencies: {} };
const supabaseLock = lockPackage(lock, "apps/mobile/node_modules/@supabase/supabase-js");
const urlPolyfillLock = lockPackage(lock, "apps/mobile/node_modules/react-native-url-polyfill");
const expoLock = lockPackage(lock, "apps/mobile/node_modules/expo");
const reactNativeLock = lockPackage(lock, "apps/mobile/node_modules/react-native");
const dependencyInventory = {
  expoSpec: dependencies.expo ?? null,
  expoInstalled: expoLock?.version ?? null,
  reactNativeSpec: dependencies["react-native"] ?? null,
  reactNativeInstalled: reactNativeLock?.version ?? null,
  asyncStorageSpec: dependencies["@react-native-async-storage/async-storage"] ?? null,
  supabaseJsSpec: dependencies["@supabase/supabase-js"] ?? null,
  supabaseJsInstalled: supabaseLock?.version ?? null,
  reactNativeUrlPolyfillSpec: dependencies["react-native-url-polyfill"] ?? null,
  reactNativeUrlPolyfillInstalled: urlPolyfillLock?.version ?? null,
  expoSecureStoreSpec: dependencies["expo-secure-store"] ?? null,
  reactNativeGetRandomValuesSpec: dependencies["react-native-get-random-values"] ?? null
};

if (dependencyInventory.asyncStorageSpec === "2.2.0") pass("AsyncStorage dependency present", { version: dependencyInventory.asyncStorageSpec });
else fail("AsyncStorage dependency present", "Mobile auth storage needs the existing AsyncStorage dependency.", dependencyInventory);

if (dependencyInventory.supabaseJsSpec && dependencyInventory.supabaseJsInstalled) pass("@supabase/supabase-js installed consistently", { spec: dependencyInventory.supabaseJsSpec, installed: dependencyInventory.supabaseJsInstalled });
else fail("@supabase/supabase-js installed consistently", "Mobile package.json and package-lock must both include @supabase/supabase-js.", dependencyInventory);

if (dependencyInventory.reactNativeUrlPolyfillSpec && dependencyInventory.reactNativeUrlPolyfillInstalled) pass("react-native-url-polyfill installed consistently", { spec: dependencyInventory.reactNativeUrlPolyfillSpec, installed: dependencyInventory.reactNativeUrlPolyfillInstalled });
else fail("react-native-url-polyfill installed consistently", "Mobile package.json and package-lock must both include react-native-url-polyfill.", dependencyInventory);

if (mobileLock.dependencies?.["@supabase/supabase-js"] === dependencyInventory.supabaseJsSpec && mobileLock.dependencies?.["react-native-url-polyfill"] === dependencyInventory.reactNativeUrlPolyfillSpec) {
  pass("apps/mobile package-lock dependency specs match package.json");
} else {
  fail("apps/mobile package-lock dependency specs match package.json", "package-lock apps/mobile dependency specs do not match package.json.", { mobileLockDependencies: mobileLock.dependencies });
}

if (dependencyInventory.expoSpec === "^54.0.0" && dependencyInventory.reactNativeSpec === "0.81.5") {
  pass("Expo and React Native package specs unchanged", { expo: dependencyInventory.expoSpec, reactNative: dependencyInventory.reactNativeSpec });
} else {
  fail("Expo and React Native package specs unchanged", "Expo or React Native package spec changed unexpectedly.", dependencyInventory);
}

if (!dependencyInventory.expoSecureStoreSpec && !dependencyInventory.reactNativeGetRandomValuesSpec) {
  pass("No extra Phase 1B storage/random dependencies added");
} else {
  fail("No extra Phase 1B storage/random dependencies added", "SecureStore/random-values should remain deferred unless explicitly approved.", dependencyInventory);
}

const requiredPreparationFiles = [
  "supabaseAuthContracts.ts",
  "supabaseAuthMappers.ts",
  "supabaseConsumerClientFactory.ts",
  "supabaseSdkLoader.ts",
  "appStateRefreshLifecycle.ts",
  path.join("adapters", "supabaseConsumerAuthAdapter.ts")
];
for (const file of requiredPreparationFiles) {
  const full = path.join(sourceRoot, file);
  if (fs.existsSync(full)) pass(`Phase 1B preparation file exists: ${file}`);
  else fail(`Phase 1B preparation file exists: ${file}`, "Missing Phase 1B preparation file.");
}

const sourceFiles = walk(sourceRoot, (file) => file.endsWith(".ts"));
const sourceText = sourceFiles.map((file) => ({ file, rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const sdkImportMatches = sourceText.filter((item) => /@supabase\/supabase-js|react-native-url-polyfill/.test(item.text)).map((item) => item.rel);
const unapprovedSdkImports = sdkImportMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedSdkImports.length) fail("SDK imports limited to approved lazy loader", "Supabase SDK/polyfill imports may only appear in supabaseSdkLoader.ts.", { matches: unapprovedSdkImports });
else pass("SDK imports limited to approved lazy loader", { matches: sdkImportMatches });

const createClientMatches = sourceText.filter((item) => /\bcreateClient\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedCreateClient = createClientMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedCreateClient.length) fail("createClient limited to approved lazy loader", "createClient may only appear in the lazy SDK loader and must not be called by guards/UI.", { matches: unapprovedCreateClient });
else pass("createClient limited to approved lazy loader", { matches: createClientMatches });

const forbidden = [
  [/\bfetch\s*\(/, "Phase 1B Consumer auth transport must not perform network requests."],
  [/\bXMLHttpRequest\b/, "Phase 1B Consumer auth transport must not perform network requests."],
  [/WebSocket\s*\(/, "Phase 1B must not open realtime/auth sockets."],
  [/service[_-]?role/i, "Service-role wording must not appear in Mobile Consumer source."],
  [/SUPABASE_SERVICE/i, "Service-role env vars must not appear in Mobile Consumer source."],
  [/SECRET_KEY/i, "Secret env vars must not appear in Mobile Consumer source."]
];
for (const [pattern, message] of forbidden) {
  const matches = sourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden Mobile Consumer source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden Mobile Consumer source pattern absent: ${pattern}`);
}

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-auth|@supabase\/supabase-js|react-native-url-polyfill/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (uiImports.length) fail("UI does not import Consumer auth transport or SDK", "UI must not be wired to Consumer Auth/Profile or SDK in Phase 1B.", { matches: uiImports });
else pass("UI does not import Consumer auth transport or SDK");

const crossSurfaceFiles = [
  ...walk(path.join(root, "apps", "restaurant-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "admin-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const crossSurfaceImports = crossSurfaceFiles.filter((file) => /consumer-auth/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (crossSurfaceImports.length) fail("Restaurant/Admin do not import Mobile Consumer auth", "Cross-surface imports are not allowed.", { matches: crossSurfaceImports });
else pass("Restaurant/Admin do not import Mobile Consumer auth");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-auth-phase1b-"));
for (const file of sourceFiles) {
  const rel = path.relative(sourceRoot, file);
  const target = path.join(tempRoot, rel).replace(/\.ts$/, ".js");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let source = fs.readFileSync(file, "utf8");
  if (rel === "index.ts") {
    source = source.replace('export * from "./supabaseSdkLoader";', "");
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
  throw new Error("Phase 1B guard trapped fetch.");
};
globalThis.WebSocket = class {
  constructor() {
    websocketCalls += 1;
    throw new Error("Phase 1B guard trapped WebSocket.");
  }
};

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const requireFromTemp = createRequire(path.join(tempRoot, "index.js"));
const phase1b = requireFromTemp("./index.js");

async function fakeClientTests() {
  const fakeUser = {
    id: "00000000-0000-4000-8000-000000000001",
    app_metadata: { provider: "email" },
    is_anonymous: false,
    email_confirmed_at: "2026-07-12T00:00:00.000Z",
    created_at: "2026-07-12T00:00:00.000Z",
    last_sign_in_at: "2026-07-12T00:01:00.000Z"
  };
  const fakeSession = { user: fakeUser, expires_in: 3600 };
  const mappedUser = phase1b.mapSupabaseUserToConsumerAuthUser(fakeUser);
  if (mappedUser.userId !== fakeUser.id || mappedUser.provider !== "supabase" || !mappedUser.emailVerified) throw new Error("user mapping failed");
  const mappedSession = phase1b.mapSupabaseSessionToConsumerAuthSession(fakeSession);
  if (!mappedSession || mappedSession.user.userId !== fakeUser.id || mappedSession.access_token) throw new Error("session mapping leaked or failed");
  try {
    phase1b.mapSupabaseUserToConsumerAuthUser({ ...fakeUser, id: null });
    throw new Error("missing id should fail");
  } catch (error) {
    if (!(error instanceof phase1b.ConsumerProfileMappingError)) throw error;
  }
  try {
    phase1b.mapSupabaseAuthEvent("UNKNOWN_EVENT", fakeSession);
    throw new Error("unknown event should fail closed");
  } catch (error) {
    if (!(error instanceof phase1b.ConsumerAuthConfigurationError)) throw error;
  }
  const invalidCredentials = phase1b.mapSupabaseAuthError({ message: "Invalid login credentials", status: 400 });
  if (invalidCredentials.code !== "operation_not_enabled") throw new Error("provider error mapping failed");

  let unsubscribed = false;
  const fakeClient = {
    getSession: async () => ({ data: { session: fakeSession }, error: null }),
    signInWithPassword: async () => ({ data: { session: fakeSession }, error: null }),
    signUp: async () => ({ data: { session: fakeSession }, error: null }),
    signOut: async () => ({ data: {}, error: null }),
    refreshSession: async () => ({ data: { session: fakeSession }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    onAuthStateChange: (callback) => {
      callback("SIGNED_IN", fakeSession);
      return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
    }
  };
  const disabledAdapter = new phase1b.SupabaseConsumerAuthAdapter({ authClient: fakeClient, transportEnabled: false });
  const disabledSignIn = await disabledAdapter.signIn({ email: "demo@example.test", password: "password" });
  if (disabledSignIn.ok || disabledSignIn.error.code !== "operation_not_enabled") throw new Error("disabled adapter should fail closed");
  const fakeAdapter = new phase1b.SupabaseConsumerAuthAdapter({ authClient: fakeClient, transportEnabled: true });
  const current = await fakeAdapter.getCurrentSession();
  if (!current.ok || current.value?.user.userId !== fakeUser.id) throw new Error("fake getSession mapping failed");
  const observed = [];
  const unsubscribe = fakeAdapter.observeAuthState((state) => observed.push(state.status));
  unsubscribe();
  if (!unsubscribed || observed[0] !== "signedIn") throw new Error("auth event unsubscribe failed");

  const lifecycleEvents = [];
  const lifecycle = new phase1b.ConsumerAuthRefreshLifecycle(
    { startAutoRefresh: () => lifecycleEvents.push("start"), stopAutoRefresh: () => lifecycleEvents.push("stop") },
    { addEventListener: (_event, listener) => { listener("active"); listener("background"); return { remove: () => lifecycleEvents.push("remove") }; } }
  );
  lifecycle.initialize();
  lifecycle.initialize();
  lifecycle.dispose();
  if (lifecycleEvents.join(",") !== "start,stop,remove") throw new Error("AppState lifecycle mapping failed");

  const factory = new phase1b.SupabaseConsumerClientFactory({
    env: { url: "https://example.invalid", publishableKey: "publishable-placeholder" },
    flags: { authSource: "mock", profileSource: "mock", supabaseAuthEnabled: false, supabaseWritesEnabled: false, issues: [] },
    storage: new phase1b.MemoryConsumerAuthStorage(),
    sdkLoader: () => ({ auth: fakeClient })
  });
  try {
    factory.getOrCreateClient();
    throw new Error("mock mode should not create Supabase client");
  } catch (error) {
    if (!(error instanceof phase1b.ConsumerAuthOperationNotEnabledError)) throw error;
  }

  const sdkLoaderSource = fs.readFileSync(path.join(sourceRoot, "supabaseSdkLoader.ts"), "utf8");
  if (!/export function createOfficialSupabaseConsumerSdkLoader/.test(sdkLoaderSource)) throw new Error("official SDK lazy loader export missing");
}

try {
  await fakeClientTests();
  pass("fake Supabase client mapping tests");
} catch (error) {
  fail("fake Supabase client mapping tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
  globalThis.WebSocket = previousWebSocket;
}

if (networkCalls === 0) pass("no fetch/network request made by Phase 1B guard");
else fail("no fetch/network request made by Phase 1B guard", "fetch was called during Phase 1B tests.", { networkCalls });
if (websocketCalls === 0) pass("no WebSocket/realtime connection made by Phase 1B guard");
else fail("no WebSocket/realtime connection made by Phase 1B guard", "WebSocket was constructed during Phase 1B tests.", { websocketCalls });

const requireFromMobile = createRequire(mobilePackagePath);
try {
  requireFromMobile.resolve("@supabase/supabase-js/package.json");
  requireFromMobile.resolve("react-native-url-polyfill/package.json");
  pass("mobile dependency tree resolves installed Auth dependencies");
} catch (error) {
  fail("mobile dependency tree resolves installed Auth dependencies", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 1B",
  reason: issues.length ? "Phase 1B guard failed" : "Supabase Auth transport preparation complete",
  dependencyInventory,
  approvedSdkImportFiles: [...approvedSdkImportFiles],
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  checks,
  issues,
  liveNetworkRequestUsed: false,
  writeRequestUsed: false,
  credentialsPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
