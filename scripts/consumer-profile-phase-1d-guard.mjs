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
const approvedProfileReadFiles = new Set(["apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts"]);
const approvedReactNativeBoundaryFiles = new Set([
  "apps/mobile/features/consumer-auth/asyncStorageConsumerAuthStorage.ts",
  "apps/mobile/features/consumer-auth/reactNativeAppStateSource.ts"
]);
const allowedProfileTables = new Set(["user_profiles"]);
const prohibitedTableNames = [
  "consumer_profiles",
  "consumer_private_profiles",
  "meal_records",
  "meal_record_items",
  "planned_meals",
  "daily_summaries",
  "ratings",
  "favorites",
  "recommendation_feedback",
  "meal_sharing_sessions",
  "restaurants",
  "menu_items",
  "invitations",
  "matches",
  "chat_threads",
  "chat_messages"
];
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
  "consumerProfileService.ts",
  "supabaseProfileContracts.ts",
  "supabaseProfileMappers.ts",
  path.join("adapters", "supabaseConsumerProfileRepository.ts")
];

for (const file of requiredFiles) {
  const full = path.join(sourceRoot, file);
  if (fs.existsSync(full)) pass(`Phase 1D file exists: ${file}`);
  else fail(`Phase 1D file exists: ${file}`, "Missing Consumer Phase 1D profile read file.");
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
  [/\bfetch\s*\(/, "Consumer Phase 1D source must not add direct fetch calls."],
  [/\bXMLHttpRequest\b/, "Consumer Phase 1D source must not add direct XMLHttpRequest calls."],
  [/WebSocket\s*\(/, "Consumer Phase 1D must not add explicit realtime sockets."],
  [/service[_-]?role/i, "Privileged service credentials must not appear in Mobile Consumer source."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in Mobile Consumer source."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in Mobile Consumer source."],
  [/\.(insert|upsert|update|rpc)\s*\(/, "Consumer Phase 1D must not add profile writes or RPC calls."],
  [/storage\.from\s*\(/, "Consumer Phase 1D must not add Supabase Storage calls."],
  [/\bgetProfileByUserId\s*\(/, "Consumer Phase 1D must not expose arbitrary user-id profile lookup."]
];

for (const [pattern, message] of forbiddenSourcePatterns) {
  const matches = sourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden source pattern absent: ${pattern}`);
}

const databaseQueryMatches = sourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedDatabaseQueries = databaseQueryMatches.filter((file) => !approvedProfileReadFiles.has(file));
if (unapprovedDatabaseQueries.length) fail("database query calls limited to profile read adapter", "Consumer database queries may only appear in the approved Phase 1D profile read adapter.", { matches: unapprovedDatabaseQueries });
else pass("database query calls limited to profile read adapter", { matches: databaseQueryMatches });

const tableNameMatches = [];
for (const item of sourceText) {
  for (const tableName of prohibitedTableNames) {
    if (item.text.includes(tableName)) tableNameMatches.push({ file: item.rel, tableName });
  }
}
if (tableNameMatches.length) fail("profile read table allowlist", "Consumer Phase 1D source may only read the approved profile table.", { matches: tableNameMatches });
else pass("profile read table allowlist", { allowedTables: [...allowedProfileTables] });

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const uiImports = uiFiles.filter((file) => /consumer-auth|@supabase\/supabase-js|react-native-url-polyfill/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (uiImports.length) fail("UI does not import Consumer Auth/Profile or SDK", "Mobile UI must not be wired to Consumer Auth/Profile in Phase 1D.", { matches: uiImports });
else pass("UI does not import Consumer Auth/Profile or SDK");

const crossSurfaceFiles = [
  ...walk(path.join(root, "apps", "restaurant-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "admin-web"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const crossSurfaceImports = crossSurfaceFiles.filter((file) => /consumer-auth/.test(fs.readFileSync(file, "utf8"))).map(relative);
if (crossSurfaceImports.length) fail("Restaurant/Admin do not import Mobile Consumer Auth/Profile", "Cross-surface Consumer Auth/Profile imports are not allowed.", { matches: crossSurfaceImports });
else pass("Restaurant/Admin do not import Mobile Consumer Auth/Profile");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-profile-phase1d-"));
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
  throw new Error("Phase 1D guard trapped fetch.");
};
globalThis.WebSocket = class {
  constructor() {
    websocketCalls += 1;
    throw new Error("Phase 1D guard trapped WebSocket.");
  }
};

process.env.NODE_PATH = [mobileNodeModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const requireFromTemp = createRequire(path.join(tempRoot, "index.js"));
const phase1d = requireFromTemp("./index.js");

function authPortFor(resultFactory) {
  return {
    source: "supabase-live",
    getCurrentSession: async () => resultFactory(),
    observeAuthState: () => () => {},
    signIn: async () => phase1d.err(new phase1d.ConsumerAuthOperationNotEnabledError()),
    signUp: async () => phase1d.err(new phase1d.ConsumerAuthOperationNotEnabledError()),
    signOut: async () => phase1d.ok(undefined),
    refreshSession: async () => resultFactory(),
    sendPasswordReset: async () => phase1d.err(new phase1d.ConsumerAuthOperationNotEnabledError()),
    restoreSession: async () => resultFactory()
  };
}

function profileClientFor(response, calls) {
  const builder = {
    select: (columns) => {
      calls.push({ op: "select", columns });
      return builder;
    },
    eq: (column, value) => {
      calls.push({ op: "eq", column, value });
      return builder;
    },
    maybeSingle: async () => {
      calls.push({ op: "maybeSingle" });
      return response;
    }
  };
  return {
    from: (table) => {
      calls.push({ op: "from", table });
      return builder;
    }
  };
}

const userId = "00000000-0000-4000-8000-0000000001d0";
const validSession = {
  user: {
    userId,
    provider: "supabase",
    isAnonymous: false,
    emailVerified: true,
    createdAt: "2026-07-12T00:00:00.000Z"
  },
  provider: "supabase",
  issuedAt: "2026-07-12T00:01:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z"
};
const validProfileRow = {
  id: "profile-row-id",
  user_id: userId,
  profile_id: "current-user",
  display_name: "測試使用者",
  nickname: "測試",
  avatar_url: null,
  locale: "zh-TW",
  timezone: "Asia/Taipei",
  energy_unit: "kcal",
  weight_unit: "kg",
  lifecycle_status: "active",
  onboarding_complete: true,
  created_at: "2026-07-12T00:00:00.000Z",
  updated_at: "2026-07-12T00:02:00.000Z"
};

function expectIssue(flags, messagePart) {
  if (!flags.issues.some((issue) => issue.includes(messagePart))) {
    throw new Error(`expected flag issue containing: ${messagePart}`);
  }
}

async function fakeProfileReadTests() {
  const defaults = phase1d.getConsumerRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.profileSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.issues.length) {
    throw new Error("default flags should remain mock/disabled with no issues");
  }

  const liveProfileFlags = phase1d.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
  });
  if (liveProfileFlags.issues.length) throw new Error("valid live profile flags should be accepted");
  expectIssue(phase1d.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live" }), "AUTH_SOURCE=supabase-live");
  expectIssue(phase1d.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live"
  }), "AUTH_ENABLED=true");
  expectIssue(phase1d.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true"
  }), "writes");

  const calls = [];
  const repository = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: validProfileRow, error: null, status: 200 }, calls),
    readEnabled: true
  });
  const profile = await repository.getCurrentProfile();
  if (!profile.ok || profile.value.userId !== userId || profile.value.profileId !== "current-user" || profile.value.displayName !== "測試使用者") {
    throw new Error("current profile read/mapping failed");
  }
  const fromCall = calls.find((call) => call.op === "from");
  const eqCall = calls.find((call) => call.op === "eq");
  const selectCall = calls.find((call) => call.op === "select");
  if (fromCall?.table !== "user_profiles" || eqCall?.column !== "user_id" || eqCall?.value !== userId || !selectCall?.columns.includes("display_name")) {
    throw new Error("profile read did not bind to current session user and allowed table");
  }

  const arbitraryCalls = [];
  const arbitrary = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: validProfileRow, error: null, status: 200 }, arbitraryCalls),
    readEnabled: true
  });
  const arbitraryLookup = await arbitrary.getProfile("other-user");
  if (arbitraryLookup.ok || arbitraryLookup.error.code !== "profile_source_unavailable" || arbitraryCalls.length) {
    throw new Error("arbitrary getProfile(userId) should fail closed without querying");
  }

  const service = new phase1d.ConsumerProfileService({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileRepository: repository
  });
  const serviceProfile = await service.getCurrentProfile();
  if (!serviceProfile.ok || serviceProfile.value.profileId !== "current-user") throw new Error("profile service current-user read failed");

  const missingSessionRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(null)),
    profileClient: profileClientFor({ data: validProfileRow, error: null, status: 200 }, []),
    readEnabled: true
  });
  const missingSession = await missingSessionRepo.getCurrentProfile();
  if (missingSession.ok || missingSession.error.code !== "profile_session_missing") throw new Error("missing session should map to profile_session_missing");

  const expiredRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.err(new phase1d.ConsumerSessionExpiredError())),
    profileClient: profileClientFor({ data: validProfileRow, error: null, status: 200 }, []),
    readEnabled: true
  });
  const expired = await expiredRepo.getCurrentProfile();
  if (expired.ok || expired.error.code !== "profile_session_expired") throw new Error("expired session should map to profile_session_expired");

  const notFoundRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: null, error: null, status: 200 }, []),
    readEnabled: true
  });
  const notFound = await notFoundRepo.getCurrentProfile();
  if (notFound.ok || notFound.error.code !== "profile_not_found") throw new Error("empty profile response should map to profile_not_found");

  const transportRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: null, error: { message: "network unavailable", status: 500 }, status: 500 }, []),
    readEnabled: true
  });
  const transport = await transportRepo.getCurrentProfile();
  if (transport.ok || transport.error.code !== "profile_transport_failed") throw new Error("transport error should map to profile_transport_failed");

  const unauthorizedRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: null, error: { message: "denied", status: 403 }, status: 403 }, []),
    readEnabled: true
  });
  const unauthorized = await unauthorizedRepo.getCurrentProfile();
  if (unauthorized.ok || unauthorized.error.code !== "profile_unauthorized") throw new Error("403 should map to profile_unauthorized");

  const mappingRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: { ...validProfileRow, display_name: "" }, error: null, status: 200 }, []),
    readEnabled: true
  });
  const mapping = await mappingRepo.getCurrentProfile();
  if (mapping.ok || mapping.error.code !== "profile_mapping_failed") throw new Error("bad profile row should map to profile_mapping_failed");

  const wrongOwnerRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: { ...validProfileRow, user_id: "other-user" }, error: null, status: 200 }, []),
    readEnabled: true
  });
  const wrongOwner = await wrongOwnerRepo.getCurrentProfile();
  if (wrongOwner.ok || wrongOwner.error.code !== "profile_mapping_failed") throw new Error("wrong-owner row should fail mapping");

  const disabledRepo = new phase1d.SupabaseConsumerProfileRepository({
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: validProfileRow, error: null, status: 200 }, []),
    readEnabled: false
  });
  const disabled = await disabledRepo.getCurrentProfile();
  if (disabled.ok || disabled.error.code !== "profile_source_unavailable") throw new Error("read disabled should fail closed");

  try {
    phase1d.createConsumerProfileRepository(liveProfileFlags);
    throw new Error("live profile factory should require explicit dependencies");
  } catch (error) {
    if (!(error instanceof phase1d.ConsumerProfileConfigurationInvalidError)) throw error;
  }
  const factoryRepo = phase1d.createConsumerProfileRepository(liveProfileFlags, {
    authPort: authPortFor(() => phase1d.ok(validSession)),
    profileClient: profileClientFor({ data: validProfileRow, error: null, status: 200 }, [])
  });
  if (factoryRepo.source !== "supabase-live") throw new Error("live profile factory did not return live repository");
}

try {
  await fakeProfileReadTests();
  pass("fake live profile read tests");
} catch (error) {
  fail("fake live profile read tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
  globalThis.WebSocket = previousWebSocket;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 1D guard.", { networkCalls });
if (websocketCalls === 0) pass("guard opened no realtime socket");
else fail("guard opened no realtime socket", "WebSocket was constructed during Phase 1D guard.", { websocketCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 1D",
  reason: issues.length ? "Phase 1D guard failed" : "Development live profile read architecture verified with fake transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  approvedSdkImportFiles: [...approvedSdkImportFiles],
  approvedProfileReadFiles: [...approvedProfileReadFiles],
  allowedProfileTables: [...allowedProfileTables],
  checks,
  issues,
  realSupabaseClientCreated: false,
  liveSmokeExecuted: false,
  liveNetworkRequestUsed: false,
  databaseWriteUsed: false,
  credentialsPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
