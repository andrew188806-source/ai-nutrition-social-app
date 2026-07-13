import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import ts from "typescript";

const root = process.cwd();
const authRoot = path.join(root, "apps", "mobile", "features", "consumer-auth");
const mealRoot = path.join(root, "apps", "mobile", "features", "consumer-meals");
const issues = [];
const checks = [];

const approvedSdkImportFiles = new Set(["apps/mobile/features/consumer-auth/supabaseSdkLoader.ts"]);
const approvedMealQueryFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts"
]);
const approvedMealRpcFiles = new Set([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts"
]);
const mealGrantMigrationName = "20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql";
const expectedMigrationFiles = [
  "20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql",
  "20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql",
  "20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql",
  "20260712130400_consumer_schema_phase_1_3_meal_records.sql",
  "20260712130500_consumer_schema_phase_1_3_meal_analysis_and_corrections.sql",
  "20260712130600_consumer_schema_phase_1_3_meal_consumption_and_sharing.sql",
  "20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql",
  "20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql",
  "20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql",
  "20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql",
  "20260712131100_consumer_schema_phase_1_3_consumer_audit_and_legacy_mapping.sql",
  "20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql",
  "20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql",
  "20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql",
  "20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql",
  mealGrantMigrationName,
  "20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql",
  "20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql",
  "20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql"
];

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

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

const sourceFiles = [
  ...walk(authRoot, (file) => file.endsWith(".ts")),
  ...walk(mealRoot, (file) => file.endsWith(".ts"))
];
const sourceText = sourceFiles.map((file) => ({ file, rel: relative(file), text: fs.readFileSync(file, "utf8") }));
const mealSourceText = sourceText.filter((item) => item.rel.includes("apps/mobile/features/consumer-meals/"));

const sdkImportMatches = sourceText.filter((item) => /@supabase\/supabase-js|react-native-url-polyfill/.test(item.text)).map((item) => item.rel);
const unapprovedSdkImports = sdkImportMatches.filter((file) => !approvedSdkImportFiles.has(file));
if (unapprovedSdkImports.length) fail("SDK imports limited to official lazy loader", "Supabase SDK/polyfill imports may only appear in supabaseSdkLoader.ts.", { matches: unapprovedSdkImports });
else pass("SDK imports limited to official lazy loader", { matches: sdkImportMatches });

const indexText = fs.readFileSync(path.join(mealRoot, "index.ts"), "utf8");
const rawExportMatches = ["supabaseMealContracts", "supabaseMealMappers", "SupabaseMealRecordRowLike", "SupabaseMealRecordItemRowLike"].filter((token) => indexText.includes(token));
if (rawExportMatches.length) fail("raw Supabase contracts are not public barrel exports", "Consumer Meals public barrel must not export raw row/query contracts.", { matches: rawExportMatches });
else pass("raw Supabase contracts are not public barrel exports");

const forbiddenMealPatterns = [
  [/\bfetch\s*\(/, "Consumer meal source must not add direct fetch calls."],
  [/\bXMLHttpRequest\b/, "Consumer meal source must not add direct XMLHttpRequest calls."],
  [/WebSocket\s*\(/, "Consumer meal source must not add explicit realtime sockets."],
  [/service[_-]?role/i, "Privileged service credentials must not appear in Mobile Consumer source."],
  [new RegExp("SUPABASE_" + "SERVICE", "i"), "Privileged Supabase env vars must not appear in Mobile Consumer source."],
  [new RegExp("SECRET_" + "KEY", "i"), "Secret env vars must not appear in Mobile Consumer source."],
  [/\.(insert|upsert|update|delete)\s*\(/, "Consumer meal source must not add direct writes."],
  [/storage\.from\s*\(/, "Consumer meal source must not add Supabase Storage calls."],
  [/\b(userId|ownerId|profileId|externalUserId)\s*[:?]\s*string\b/, "Meal read API must not accept arbitrary user identity input."],
  [/select\s*\(\s*["']\*["']\s*\)/, "Consumer meal reads must use explicit column allowlists."]
];
for (const [pattern, message] of forbiddenMealPatterns) {
  const matches = mealSourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden meal source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden meal source pattern absent: ${pattern}`);
}

const mealDatabaseQueryMatches = mealSourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealQueries = mealDatabaseQueryMatches.filter((file) => !approvedMealQueryFiles.has(file));
if (unapprovedMealQueries.length) fail("database query calls limited to meal read adapter", "Consumer meal database queries may only appear in the approved adapter.", { matches: unapprovedMealQueries });
else pass("database query calls limited to meal read adapter", { matches: mealDatabaseQueryMatches });

const mealRpcMatches = mealSourceText.filter((item) => /\.\s*rpc\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealRpc = mealRpcMatches.filter((file) => !approvedMealRpcFiles.has(file));
if (unapprovedMealRpc.length) fail("RPC calls limited to atomic meal write adapter", "Consumer meal RPC calls may only appear in the approved Phase 2D write adapter.", { matches: unapprovedMealRpc });
else pass("RPC calls limited to atomic meal write adapter", { matches: mealRpcMatches });

const repositoryText = fs.readFileSync(path.join(mealRoot, "adapters", "supabaseConsumerMealRecordsRepository.ts"), "utf8");
if (/\.order\("occurred_at",\s*\{\s*ascending:\s*false\s*\}\)\s*[\s\S]*\.order\("id",\s*\{\s*ascending:\s*false\s*\}\)/.test(repositoryText)) {
  pass("Supabase meal query uses stable secondary ordering");
} else {
  fail("Supabase meal query uses stable secondary ordering", "Meal read query must order by occurred_at DESC, then id DESC.");
}

const mockRepositoryText = fs.readFileSync(path.join(mealRoot, "adapters", "mockConsumerMealRecordsRepository.ts"), "utf8");
if (/occurredAt\.localeCompare\(a\.occurredAt\)\s*\|\|\s*b\.mealRecordId\.localeCompare\(a\.mealRecordId\)/.test(mockRepositoryText)) {
  pass("Mock meal repository uses same ordering semantics");
} else {
  fail("Mock meal repository uses same ordering semantics", "Mock meal records must sort by occurredAt DESC, then mealRecordId DESC.");
}
if (!/as\s+never/.test(mockRepositoryText)) pass("mock catch path does not use as never");
else fail("mock catch path does not use as never", "Mock catch path should use typed error narrowing instead of unchecked casts.");

const uiFiles = [
  ...walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx")),
  ...walk(path.join(root, "apps", "mobile", "components"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
];
const allowedPhase2IUiImports = new Set(["apps/mobile/app/index.tsx", "apps/mobile/app/today-intake.tsx"]);
const uiImports = uiFiles
  .map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ text }) => /consumer-meals|@supabase\/supabase-js|react-native-url-polyfill/.test(text));
const disallowedUiImports = uiImports
  .filter(({ rel, text }) => !allowedPhase2IUiImports.has(rel) || /@supabase\/supabase-js|react-native-url-polyfill|consumerMealRecordsService|consumerDailyNutritionSummaryService|dailyNutritionSummaryCalculator|supabaseConsumerMeal|MockConsumerMeal/.test(text))
  .map(({ rel }) => rel);
if (disallowedUiImports.length) fail("UI imports limited to Phase 2I shared overview hook", "Mobile UI may only import the Phase 2I shared overview hook from Home/Today Intake.", { matches: disallowedUiImports });
else pass("UI imports limited to Phase 2I shared overview hook", { matches: uiImports.map(({ rel }) => rel) });
const navigationImports = walk(path.join(root, "apps", "mobile", "app"), (file) => file.endsWith(".ts") || file.endsWith(".tsx"))
  .map((file) => ({ rel: relative(file), text: fs.readFileSync(file, "utf8") }))
  .filter(({ rel, text }) => /mealRecordsSource|MEAL_RECORDS_SOURCE/.test(text) || (/consumer-meals/.test(text) && !allowedPhase2IUiImports.has(rel)))
  .map(({ rel }) => rel);
if (navigationImports.length) fail("Navigation remains unchanged outside Phase 2I UI cutover", "Consumer meal route imports may only appear in the approved Phase 2I Home/Today Intake cutover.", { matches: navigationImports });
else pass("Navigation remains unchanged");

const migrationFiles = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory is explicitly allowlisted", { count: migrationFiles.length });
else fail("migration inventory is explicitly allowlisted", "Phase 2B may only add the approved forward-only meal read grant migration.", { migrationFiles, expectedMigrationFiles });

const migrationPath = path.join(root, "supabase", "migrations", mealGrantMigrationName);
if (fs.existsSync(migrationPath)) {
  const clean = stripComments(fs.readFileSync(migrationPath, "utf8")).trim().toLowerCase().replace(/\s+/g, " ");
  const expected = [
    "grant select on table public.meal_records to authenticated;",
    "grant select on table public.meal_record_items to authenticated;",
    "revoke all on table public.meal_records from anon;",
    "revoke all on table public.meal_record_items from anon;"
  ].join(" ");
  if (clean === expected) pass("meal read grant migration is minimal and forward-only");
  else fail("meal read grant migration is minimal and forward-only", "Meal grant migration may only grant authenticated SELECT and revoke anon privileges for meal read tables.");
} else {
  fail("meal read grant migration is minimal and forward-only", "Missing meal read grant migration.");
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2b-"));
for (const file of sourceFiles) {
  const rel = path.relative(path.join(root, "apps", "mobile", "features"), file).replaceAll(path.sep, "/");
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

let networkCalls = 0;
let websocketCalls = 0;
const previousFetch = globalThis.fetch;
const previousWebSocket = globalThis.WebSocket;
globalThis.fetch = () => {
  networkCalls += 1;
  throw new Error("Phase 2B guard trapped fetch.");
};
globalThis.WebSocket = class {
  constructor() {
    websocketCalls += 1;
    throw new Error("Phase 2B guard trapped WebSocket.");
  }
};

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const errors = requireFromTemp("../consumer-auth/errors.js");
const flagsModule = requireFromTemp("./featureFlags.js");
const rangeModule = requireFromTemp("./readRange.js");
const mapper = requireFromTemp("./supabaseMealMappers.js");
const liveRepoModule = requireFromTemp("./adapters/supabaseConsumerMealRecordsRepository.js");

const currentUserId = "00000000-0000-4000-8000-000000002b00";
const validSession = {
  user: { userId: currentUserId, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "2026-07-13T00:00:00.000Z" },
  provider: "supabase",
  issuedAt: "2026-07-13T00:01:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z"
};
const validMealRows = [
  {
    id: "meal-b",
    user_id: currentUserId,
    meal_type: "lunch",
    occurred_at: "2026-07-13T04:00:00.000Z",
    meal_date: "2026-07-13",
    timezone: "Asia/Taipei",
    title: "Lunch B",
    note: null,
    source: "manual",
    created_at: "2026-07-13T04:00:00.000Z",
    updated_at: "2026-07-13T04:10:00.000Z",
    meal_record_items: []
  },
  {
    id: "meal-a",
    user_id: currentUserId,
    meal_type: "lunch",
    occurred_at: "2026-07-13T04:00:00.000Z",
    meal_date: "2026-07-13",
    timezone: "Asia/Taipei",
    title: "Lunch A",
    note: null,
    source: "manual",
    created_at: "2026-07-13T04:00:00.000Z",
    updated_at: "2026-07-13T04:10:00.000Z",
    meal_record_items: []
  }
];

function authPortFor(resultFactory) {
  return {
    source: "supabase-live",
    getCurrentSession: async () => resultFactory(),
    observeAuthState: () => () => undefined,
    signIn: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    signUp: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    signOut: async () => auth.ok(undefined),
    refreshSession: async () => resultFactory(),
    sendPasswordReset: async () => auth.err(new errors.ConsumerAuthOperationNotEnabledError()),
    restoreSession: async () => resultFactory()
  };
}

function mealClientFor(response, calls) {
  const builder = {
    select: (columns) => { calls.push({ op: "select", columns }); return builder; },
    eq: (column, value) => { calls.push({ op: "eq", column, value }); return builder; },
    is: (column, value) => { calls.push({ op: "is", column, value }); return builder; },
    gte: (column, value) => { calls.push({ op: "gte", column, value }); return builder; },
    lte: (column, value) => { calls.push({ op: "lte", column, value }); return builder; },
    order: (column, options) => { calls.push({ op: "order", column, options }); return builder; },
    limit: async (count) => { calls.push({ op: "limit", count }); return response; }
  };
  return { from: (table) => { calls.push({ op: "from", table }); return builder; } };
}

async function fakeMealReadTests() {
  const defaults = flagsModule.getConsumerMealRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.mealRecordsSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.dailyNutritionLiveReadOptIn || defaults.issues.length) {
    throw new Error("default meal flags should remain mock/disabled");
  }
  const liveFlags = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
  });
  if (liveFlags.issues.length) throw new Error("valid live meal flags should be accepted");

  for (const badDate of ["2026-02-31", "2026-04-31", "2025-02-29", "0000-01-01"]) {
    try {
      rangeModule.resolveMealReadRange({ startDate: badDate, endDate: "2026-07-13" });
      throw new Error(`invalid calendar date should fail: ${badDate}`);
    } catch (error) {
      if (error.code !== "meal_read_invalid_range") throw error;
    }
  }
  for (const goodDate of ["2024-02-29", "2026-02-28"]) {
    rangeModule.resolveMealReadRange({ startDate: goodDate, endDate: goodDate });
  }

  const calls = [];
  const repository = new liveRepoModule.SupabaseConsumerMealRecordsRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: mealClientFor({ data: validMealRows, error: null, status: 200 }, calls),
    readEnabled: true
  });
  const result = await repository.listCurrentUserMealRecords({ startDate: "2026-07-01", endDate: "2026-07-13", limit: 5 });
  if (!result.ok || result.value.length !== 2) throw new Error("live meal repository read failed");
  const orderCalls = calls.filter((call) => call.op === "order");
  if (orderCalls.length !== 2 || orderCalls[0].column !== "occurred_at" || orderCalls[0].options.ascending !== false || orderCalls[1].column !== "id" || orderCalls[1].options.ascending !== false) {
    throw new Error("live meal query did not use stable ordering");
  }
  const selectCall = calls.find((call) => call.op === "select");
  const eqCall = calls.find((call) => call.op === "eq");
  const isCall = calls.find((call) => call.op === "is");
  if (!selectCall || selectCall.columns.includes("*") || eqCall?.column !== "user_id" || eqCall?.value !== currentUserId || isCall?.column !== "deleted_at") {
    throw new Error("live meal query did not use bounded current-user allowlist");
  }
  mapper.mapSupabaseMealRecordRowToConsumerMealRecord({ ...validMealRows[0], user_id: currentUserId }, currentUserId);
}

try {
  await fakeMealReadTests();
  pass("fake meal read contract tests");
} catch (error) {
  fail("fake meal read contract tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
  globalThis.WebSocket = previousWebSocket;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 2B guard.", { networkCalls });
if (websocketCalls === 0) pass("guard opened no realtime socket");
else fail("guard opened no realtime socket", "WebSocket was constructed during Phase 2B guard.", { websocketCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2B",
  reason: issues.length ? "Phase 2B guard failed" : "Development live meal read preparation and hardening verified with fake transport",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  approvedSdkImportFiles: [...approvedSdkImportFiles],
  approvedMealQueryFiles: [...approvedMealQueryFiles],
  checks,
  issues,
  databaseWriteUsed: false,
  rpcUsed: false,
  credentialsPrinted: false,
  rawRowsPrinted: false,
  sqlExecuted: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  phase2cStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
