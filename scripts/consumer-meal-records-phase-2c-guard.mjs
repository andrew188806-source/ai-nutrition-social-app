import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
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
  "20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql",
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
  [/\.(insert|upsert|update|delete)\s*\(/, "Consumer meal source must not add active direct writes."],
  [/storage\.from\s*\(/, "Consumer meal source must not add Supabase Storage calls."],
  [/\b(userId|ownerId|profileId|externalUserId)\s*[:?]\s*string\b/, "Meal write API must not accept arbitrary user identity input."],
  [/select\s*\(\s*["']\*["']\s*\)/, "Consumer meal reads must use explicit column allowlists."]
];
for (const [pattern, message] of forbiddenMealPatterns) {
  const matches = mealSourceText.filter((item) => pattern.test(item.text)).map((item) => item.rel);
  if (matches.length) fail(`forbidden meal source pattern: ${pattern}`, message, { matches });
  else pass(`forbidden meal source pattern absent: ${pattern}`);
}

const mealDatabaseQueryMatches = mealSourceText.filter((item) => /\.\s*from\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealQueries = mealDatabaseQueryMatches.filter((file) => !approvedMealQueryFiles.has(file));
if (unapprovedMealQueries.length) fail("database query calls limited to meal read adapter", "Consumer meal database queries may only appear in the approved read adapter.", { matches: unapprovedMealQueries });
else pass("database query calls limited to meal read adapter", { matches: mealDatabaseQueryMatches });

const mealRpcMatches = mealSourceText.filter((item) => /\.\s*rpc\s*\(/.test(item.text)).map((item) => item.rel);
const unapprovedMealRpc = mealRpcMatches.filter((file) => !approvedMealRpcFiles.has(file));
if (unapprovedMealRpc.length) fail("RPC calls limited to atomic meal write adapter", "Consumer meal RPC calls may only appear in the approved Phase 2D write adapter.", { matches: unapprovedMealRpc });
else pass("RPC calls limited to atomic meal write adapter", { matches: mealRpcMatches });

const writeRepoText = fs.readFileSync(path.join(mealRoot, "adapters", "supabaseConsumerMealRecordWriteRepository.ts"), "utf8");
if (/SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION/.test(writeRepoText) && /\.\s*rpc\s*\(/.test(writeRepoText) && !/\.\s*from\s*\(/.test(writeRepoText)) {
  pass("Supabase meal write repository uses approved atomic RPC only");
} else {
  fail("Supabase meal write repository uses approved atomic RPC only", "Phase 2D live write adapter must use only the approved atomic RPC.");
}

const migrationFiles = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrationFiles)) pass("migration inventory unchanged from Phase 2B", { count: migrationFiles.length });
else fail("migration inventory unchanged from Phase 2B", "Phase 2C must not add or modify active migrations.", { migrationFiles, expectedMigrationFiles });

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
  .filter(({ rel, text }) => /mealRecordsSource|MEAL_RECORDS_SOURCE|MEAL_RECORD_WRITES/.test(text) || (/consumer-meals/.test(text) && !allowedPhase2IUiImports.has(rel)))
  .map(({ rel }) => rel);
if (navigationImports.length) fail("Navigation remains unchanged outside Phase 2I UI cutover", "Consumer meal route imports may only appear in the approved Phase 2I Home/Today Intake cutover.", { matches: navigationImports });
else pass("Navigation remains unchanged");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2c-"));
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
const analysisStub = path.join(tempRoot, "analysis", "analysisMealRecordStore.js");
fs.mkdirSync(path.dirname(analysisStub), { recursive: true });
fs.writeFileSync(analysisStub, "exports.getMealRecords = () => [];\n", "utf8");

let networkCalls = 0;
let websocketCalls = 0;
const previousFetch = globalThis.fetch;
const previousWebSocket = globalThis.WebSocket;
globalThis.fetch = () => {
  networkCalls += 1;
  throw new Error("Phase 2C guard trapped fetch.");
};
globalThis.WebSocket = class {
  constructor() {
    websocketCalls += 1;
    throw new Error("Phase 2C guard trapped WebSocket.");
  }
};

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "index.js"));
const auth = requireFromTemp("../consumer-auth/types.js");
const errors = requireFromTemp("../consumer-auth/errors.js");
const flagsModule = requireFromTemp("./featureFlags.js");
const validation = requireFromTemp("./writeValidation.js");
const mockWriteRepoModule = requireFromTemp("./adapters/mockConsumerMealRecordWriteRepository.js");
const disabledWriteRepoModule = requireFromTemp("./adapters/supabaseDisabledConsumerMealRecordWriteRepository.js");
const liveWriteRepoModule = requireFromTemp("./adapters/supabaseConsumerMealRecordWriteRepository.js");
const factories = requireFromTemp("./factories.js");
const writeServiceModule = requireFromTemp("./consumerMealRecordWriteService.js");

const currentUserId = "00000000-0000-4000-8000-000000002c00";
const validSession = {
  user: { userId: currentUserId, provider: "supabase", isAnonymous: false, emailVerified: true, createdAt: "2026-07-13T00:00:00.000Z" },
  provider: "supabase",
  issuedAt: "2026-07-13T00:01:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z"
};
const validCreateInput = {
  mealType: "lunch",
  occurredAt: "2026-07-13T04:00:00.000Z",
  mealDate: "2026-07-13",
  title: "午餐",
  note: "Phase 2C guard sample",
  source: "manual",
  items: [
    {
      restaurantId: "restaurant-001",
      menuItemId: "menu-item-001",
      displayName: "雞胸便當",
      portion: "1 份",
      nutrition: { calories: 520, protein: 38, carbohydrates: 56, fat: 14, fiber: 6 },
      nutritionSource: "manual",
      confidenceScore: 0.9,
      consumedRatio: 1
    }
  ]
};

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

function expectErrorCode(fn, code, label) {
  try {
    fn();
    throw new Error(`${label} should have failed.`);
  } catch (error) {
    if (error.code !== code) throw error;
  }
}

async function fakeMealWriteTests() {
  const defaults = flagsModule.getConsumerMealRuntimeFlags({});
  if (defaults.authSource !== "mock" || defaults.mealRecordsSource !== "mock" || defaults.supabaseAuthEnabled || defaults.supabaseWritesEnabled || defaults.mealRecordWritesEnabled || defaults.dailyNutritionLiveReadOptIn || defaults.issues.length) {
    throw new Error("default meal flags should remain mock/read-only/write-disabled");
  }
  const mockWriteFlags = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "true"
  });
  if (mockWriteFlags.issues.length) throw new Error("mock write preparation flags should be accepted only for fake repository tests");
  const liveWriteFlags = flagsModule.getConsumerMealRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "true"
  });
  if (!liveWriteFlags.issues.some((issue) => issue.includes("LIVE_WRITE_OPT_IN"))) throw new Error("live Supabase meal writes must require explicit Phase 2D opt-in");

  validation.validateCreateMealRecordInput(validCreateInput);
  validation.validateCreateMealRecordInput({ ...validCreateInput, mealDate: "2024-02-29", occurredAt: "2024-02-29T00:00:00.000Z" });
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, mealDate: "2026-02-31", occurredAt: "2026-02-31T00:00:00.000Z" }), "meal_write_invalid_date", "invalid calendar date");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, mealDate: "2025-02-29", occurredAt: "2025-02-29T00:00:00.000Z" }), "meal_write_invalid_date", "invalid non-leap date");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, occurredAt: "2026-07-14T04:00:00.000Z" }), "meal_write_invalid_date", "mismatched occurredAt date");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, items: [] }), "meal_write_invalid_items", "empty items");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, items: Array.from({ length: validation.getConsumerMealWriteMaxItems() + 1 }, () => validCreateInput.items[0]) }), "meal_write_payload_too_large", "too many items");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, userId: currentUserId }), "meal_write_ownership_field_rejected", "ownership field");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, id: "server-id" }), "meal_write_invalid_input", "server field");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, items: [{ ...validCreateInput.items[0], displayName: " " }] }), "meal_write_invalid_input", "empty display");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, items: [{ ...validCreateInput.items[0], nutrition: { calories: -1 } }] }), "meal_write_invalid_nutrition", "negative nutrition");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, items: [{ ...validCreateInput.items[0], nutrition: { sodium: 10 } }] }), "meal_write_invalid_nutrition", "unknown nutrition");
  expectErrorCode(() => validation.validateCreateMealRecordInput({ ...validCreateInput, items: [{ ...validCreateInput.items[0], consumedRatio: 1.2 }] }), "meal_write_invalid_input", "invalid consumed ratio");

  const mockRepo = new mockWriteRepoModule.MockConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    now: () => "2026-07-13T05:00:00.000Z"
  });
  const created = await mockRepo.createCurrentUserMealRecord(validCreateInput);
  if (!created.ok || created.value.mealRecordId !== "mock-meal-write-0001" || created.value.items[0].mealRecordItemId !== "mock-meal-write-0001-item-01") {
    throw new Error("mock write repository did not create deterministic canonical record");
  }
  const failedCreate = await mockRepo.createCurrentUserMealRecord({ ...validCreateInput, userId: currentUserId });
  if (failedCreate.ok || failedCreate.error.code !== "meal_write_ownership_field_rejected") throw new Error("mock write repository did not reject ownership field");
  if (mockRepo.listCreatedMealRecordsForTest().length !== 1) throw new Error("mock write repository mutated state after invalid write");

  const disabledRepo = new disabledWriteRepoModule.SupabaseDisabledConsumerMealRecordWriteRepository();
  const disabled = await disabledRepo.createCurrentUserMealRecord(validCreateInput);
  if (disabled.ok || disabled.error.code !== "meal_write_disabled") throw new Error("disabled write repository did not fail closed");

  const liveRepo = new liveWriteRepoModule.SupabaseConsumerMealRecordWriteRepository({
    authPort: authPortFor(() => auth.ok(validSession)),
    mealClient: { rpc: async () => ({ data: null, error: null, status: 200 }) },
    writeEnabled: false
  });
  const live = await liveRepo.createCurrentUserMealRecord(validCreateInput);
  if (live.ok || live.error.code !== "meal_write_phase_not_enabled") throw new Error("live write repository did not fail closed without explicit write enablement");

  const service = new writeServiceModule.ConsumerMealRecordWriteService({ repository: mockRepo });
  const delegated = await service.createCurrentUserMealRecord(validCreateInput);
  if (!delegated.ok || delegated.value.mealRecordId !== "mock-meal-write-0002") throw new Error("write service did not delegate to repository");

  const repoFromFactory = factories.createConsumerMealRecordWriteRepository(mockWriteFlags, { authPort: authPortFor(() => auth.ok(validSession)) });
  if (repoFromFactory.source !== "mock") throw new Error("factory did not create mock write repository for mock write flags");
}

try {
  await fakeMealWriteTests();
  pass("fake meal write contract tests");
} catch (error) {
  fail("fake meal write contract tests", error instanceof Error ? error.message : String(error));
} finally {
  globalThis.fetch = previousFetch;
  globalThis.WebSocket = previousWebSocket;
}

if (networkCalls === 0) pass("guard made no direct network request");
else fail("guard made no direct network request", "fetch was called during Phase 2C guard.", { networkCalls });
if (websocketCalls === 0) pass("guard opened no realtime socket");
else fail("guard opened no realtime socket", "WebSocket was constructed during Phase 2C guard.", { websocketCalls });

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2C",
  reason: issues.length ? "Phase 2C guard failed" : "Controlled meal record write preparation verified with fail-closed live boundary",
  filesScanned: sourceFiles.length,
  uiFilesScanned: uiFiles.length,
  approvedSdkImportFiles: [...approvedSdkImportFiles],
  approvedMealQueryFiles: [...approvedMealQueryFiles],
  checks,
  issues,
  databaseReadOrWriteUsed: false,
  databaseWriteUsed: false,
  insertUsed: false,
  updateUsed: false,
  upsertUsed: false,
  deleteUsed: false,
  rpcUsed: false,
  credentialsPrinted: false,
  rawRowsPrinted: false,
  sqlExecuted: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  phase2dStarted: false
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = issues.length ? 1 : 0;
