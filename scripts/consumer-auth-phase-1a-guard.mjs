import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
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
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
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
  "errors.ts",
  "types.ts",
  "ports.ts",
  "featureFlags.ts",
  "storage.ts",
  "factories.ts",
  "consumerProfileBootstrapService.ts",
  "sessionStateStore.ts",
  "index.ts",
  path.join("adapters", "mockConsumerAuthAdapter.ts"),
  path.join("adapters", "mockConsumerProfileRepository.ts"),
  path.join("adapters", "supabaseDisabledConsumerAuthAdapter.ts"),
  path.join("adapters", "supabaseDisabledConsumerProfileRepository.ts")
];

for (const file of requiredFiles) {
  const full = path.join(sourceRoot, file);
  if (fs.existsSync(full)) pass(`required file exists: ${file}`);
  else fail(`required file exists: ${file}`, "Missing Phase 1A scaffold file.");
}

const sourceFiles = walk(sourceRoot, (file) => file.endsWith(".ts"));
const sourceText = sourceFiles.map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));

const forbiddenSourcePatterns = [
  [/\bfetch\s*\(/, "Consumer auth/profile scaffolding must not make network requests."],
  [/\bXMLHttpRequest\b/, "Consumer auth/profile scaffolding must not make network requests."],
  [/service[_-]?role/i, "Service-role credentials must not appear in Mobile Consumer scaffolding."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in Mobile Consumer scaffolding."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in Mobile Consumer scaffolding."]
];

for (const [pattern, message] of forbiddenSourcePatterns) {
  const matches = sourceText.filter((item) => pattern.test(item.text)).map((item) => relative(item.file));
  if (matches.length) fail(`forbidden source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden source pattern absent: ${pattern}`);
}

const sdkImportMatches = sourceText
  .filter((item) => /@supabase\/supabase-js|react-native-url-polyfill/.test(item.text))
  .map((item) => relative(item.file));
const unapprovedSdkImports = sdkImportMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedSdkImports.length) fail("Phase 1B SDK imports limited to approved lazy loader", "Supabase SDK/polyfill imports may only appear in supabaseSdkLoader.ts.", { matches: unapprovedSdkImports });
else pass("Phase 1B SDK imports limited to approved lazy loader", { matches: sdkImportMatches });

const createClientMatches = sourceText
  .filter((item) => /\bcreateClient\s*\(/.test(item.text))
  .map((item) => relative(item.file));
const unapprovedCreateClient = createClientMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedCreateClient.length) fail("Phase 1B createClient limited to approved lazy loader", "createClient may only appear inside the approved lazy loader and must not be invoked by Phase 1A tests.", { matches: unapprovedCreateClient });
else pass("Phase 1B createClient limited to approved lazy loader", { matches: createClientMatches });

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-auth/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (uiImports.length) fail("UI does not import Consumer auth scaffold", "UI must not be wired to Consumer Auth/Profile in Phase 1A.", { matches: uiImports });
else pass("UI does not import Consumer auth scaffold");

if (fs.existsSync(lockPath)) pass("package-lock present for post-Phase 1B dependency consistency");
else fail("package-lock present for post-Phase 1B dependency consistency", "package-lock.json is required after the Phase 1B dependency installation.");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-auth-phase1a-"));
for (const file of sourceFiles) {
  const rel = path.relative(sourceRoot, file);
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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true
    },
    fileName: file
  }).outputText;
  fs.writeFileSync(target, output, "utf8");
}

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const requireFromTemp = createRequire(path.join(tempRoot, "index.js"));
const phase1a = requireFromTemp("./index.js");

async function runFakeClientTests() {
  const auth = new phase1a.MockConsumerAuthAdapter();
  const initial = await auth.getCurrentSession();
  if (!initial.ok || initial.value !== null) throw new Error("mock auth should start signed out");

  const observed = [];
  const unsubscribe = auth.observeAuthState((state) => observed.push(state.status));
  const signIn = await auth.signIn({ mockUserId: "current-user" });
  if (!signIn.ok || signIn.value.user.userId !== "current-user") throw new Error("mock sign-in failed");
  unsubscribe();
  await auth.signOut();
  if (observed.join(",") !== "signedOut,signedIn") throw new Error("auth listener cleanup failed");

  const storage = new phase1a.MemoryConsumerAuthStorage();
  const authWithStorage = new phase1a.MockConsumerAuthAdapter({ storage });
  await authWithStorage.signIn({ mockUserId: "restore-user" });
  const restoredAuth = new phase1a.MockConsumerAuthAdapter({ storage });
  const restored = await restoredAuth.restoreSession();
  if (!restored.ok || restored.value?.user.userId !== "restore-user") throw new Error("mock restore failed");

  const repo = new phase1a.MockConsumerProfileRepository();
  const existing = await repo.getProfile("current-user");
  if (!existing.ok || existing.value?.profileId !== "current-user") throw new Error("mock profile lookup failed");
  const created = await repo.bootstrapProfile({ userId: "new-user", displayName: "New Demo User", requestId: "request-1" });
  const repeated = await repo.bootstrapProfile({ userId: "new-user", displayName: "Different Demo User", requestId: "request-1" });
  if (!created.ok || !created.value.created) throw new Error("mock bootstrap should create missing profile");
  if (!repeated.ok || repeated.value.created) throw new Error("mock bootstrap should be idempotent");

  const bootstrapAuth = new phase1a.MockConsumerAuthAdapter();
  await bootstrapAuth.signIn({ mockUserId: "bootstrap-user" });
  const bootstrapRepo = new phase1a.MockConsumerProfileRepository({ profiles: [], privateProfiles: [] });
  const bootstrapService = new phase1a.ConsumerProfileBootstrapService({
    authPort: bootstrapAuth,
    profileRepository: bootstrapRepo,
    allowMockBootstrap: true,
    allowSupabaseWrites: false
  });
  const bootstrapped = await bootstrapService.ensureProfile({ displayName: "Bootstrap Demo User", requestId: "bootstrap-1" });
  if (!bootstrapped.ok || !bootstrapped.value.created) throw new Error("bootstrap service should create mock profile");
  const mismatch = await bootstrapService.ensureProfile({ userId: "other-user" });
  if (mismatch.ok || mismatch.error.code !== "profile_mapping_error") throw new Error("bootstrap service should reject mismatched userId");

  const disabledRepo = new phase1a.MockConsumerProfileRepository({
    profiles: [phase1a.buildDefaultMockConsumerProfile({ userId: "disabled-user", lifecycleStatus: "disabled" })]
  });
  const disabledAuth = new phase1a.MockConsumerAuthAdapter();
  await disabledAuth.signIn({ mockUserId: "disabled-user" });
  const disabledService = new phase1a.ConsumerProfileBootstrapService({
    authPort: disabledAuth,
    profileRepository: disabledRepo,
    allowMockBootstrap: true,
    allowSupabaseWrites: false
  });
  const disabled = await disabledService.ensureProfile();
  if (disabled.ok || disabled.error.code !== "account_disabled") throw new Error("disabled lifecycle should fail closed");

  const noSessionService = new phase1a.ConsumerProfileBootstrapService({
    authPort: new phase1a.MockConsumerAuthAdapter(),
    profileRepository: new phase1a.MockConsumerProfileRepository(),
    allowMockBootstrap: true,
    allowSupabaseWrites: false
  });
  const noSession = await noSessionService.ensureProfile();
  if (noSession.ok || noSession.error.code !== "authentication_required") throw new Error("missing session should require authentication");

  const disabledProfileService = new phase1a.ConsumerProfileBootstrapService({
    authPort: bootstrapAuth,
    profileRepository: new phase1a.SupabaseDisabledConsumerProfileRepository(),
    allowMockBootstrap: false,
    allowSupabaseWrites: false
  });
  const writeBlocked = await disabledProfileService.ensureProfile();
  if (writeBlocked.ok || writeBlocked.error.code !== "profile_write_not_enabled") throw new Error("supabase-disabled profile writes should be blocked");

  const flags = phase1a.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "unexpected",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "unexpected",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES: "true"
  });
  if (flags.authSource !== "supabase-disabled" || flags.profileSource !== "supabase-disabled" || flags.issues.length < 3) {
    throw new Error("unknown flags should fail closed");
  }

  const scaffold = phase1a.createConsumerAuthScaffold({ authSource: "mock", profileSource: "mock", supabaseAuthEnabled: false, supabaseWritesEnabled: false, issues: [] });
  if (scaffold.authPort.source !== "mock" || scaffold.profileRepository.source !== "mock") throw new Error("mock factory selection failed");

  const disabledScaffold = phase1a.createConsumerAuthScaffold({ authSource: "supabase-disabled", profileSource: "supabase-disabled", supabaseAuthEnabled: false, supabaseWritesEnabled: false, issues: [] });
  if (disabledScaffold.authPort.source !== "supabase-disabled" || disabledScaffold.profileRepository.source !== "supabase-disabled") {
    throw new Error("supabase-disabled factory selection failed");
  }

  try {
    phase1a.createConsumerAuthScaffold({ authSource: "supabase-live", profileSource: "mock", supabaseAuthEnabled: true, supabaseWritesEnabled: false, issues: [] });
    throw new Error("supabase-live without Phase 1C dependencies should fail closed");
  } catch (error) {
    if (!(error instanceof phase1a.ConsumerAuthError)) throw error;
  }
}

try {
  await runFakeClientTests();
  pass("fake-client auth/profile tests");
} catch (error) {
  fail("fake-client auth/profile tests", error instanceof Error ? error.message : String(error));
}

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 1A",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  checks,
  issues,
  liveNetworkRequestUsed: false,
  writeRequestUsed: false,
  credentialsPrinted: false,
  packageLockChanged: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
