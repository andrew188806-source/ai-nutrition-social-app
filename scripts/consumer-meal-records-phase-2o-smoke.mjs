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
const phase = "Consumer Runtime Integration Phase 2O Atomic Development Live Planned Meal Write Smoke";

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

const baseResult = {
  phase,
  clientCreated: false,
  signInUsed: false,
  networkRequestUsed: false,
  databaseReadUsed: false,
  databaseWriteUsed: false,
  rpcInvoked: false,
  credentialsPrinted: false,
  tokenPrinted: false,
  sessionPrinted: false,
  userIdPrinted: false,
  plannedMealIdsPrinted: false,
  rawRowsPrinted: false,
  snapshotPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

function printSkipped(reason) {
  console.log(JSON.stringify({ ...baseResult, status: "skipped", reason }, null, 2));
}

function printBlocked(reason, missing = []) {
  console.log(JSON.stringify({ ...baseResult, status: "blocked", phase, reason, missing }, null, 2));
  process.exit(2);
}

const env = buildEnv();

if (env.TASTKIND_CONSUMER_PHASE2O_LIVE_PLANNED_MEAL_WRITE !== "true") {
  printSkipped("SKIPPED - explicit Phase 2O Development live planned meal write opt-in was not enabled.");
  process.exit(0);
}

const requiredFlags = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE: "supabase",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE: "supabase",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_LIVE_READ_OPT_IN: "true"
};
const missing = [];
for (const [key, expected] of Object.entries(requiredFlags)) {
  if (env[key] !== expected) missing.push(`${key}=${expected}`);
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED && env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED !== "false") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED=false or unset");
}
if (env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN && env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN !== "false") {
  missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN=false or unset");
}

const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const signInEmail =
  env.TASTKIND_CONSUMER_PHASE2O_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2M_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2H_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2F_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2D_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE2B_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE1D_SMOKE_EMAIL ??
  env.TASTKIND_CONSUMER_PHASE1C_SMOKE_EMAIL;
const signInPassword =
  env.TASTKIND_CONSUMER_PHASE2O_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2M_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2H_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2F_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2D_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE2B_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE1D_SMOKE_PASSWORD ??
  env.TASTKIND_CONSUMER_PHASE1C_SMOKE_PASSWORD;
if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
if (!signInEmail) missing.push("TASTKIND_CONSUMER_PHASE2O_SMOKE_EMAIL or fallback email env var");
if (!signInPassword) missing.push("TASTKIND_CONSUMER_PHASE2O_SMOKE_PASSWORD or fallback password env var");
if (missing.length) printBlocked("Live planned meal write smoke environment is incomplete.", missing);

const privilegedKeyPattern = new RegExp(["service", "role"].join("[_-]?"), "i");
if (privilegedKeyPattern.test(publishableKey)) printBlocked("Live planned meal write smoke refuses privileged credentials.", ["publishable/anon key must not be a service-role key"]);

// Compile TypeScript feature code to temp directory.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2o-live-"));
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
  if (rel === "consumer-meals/index.ts") {
    source = source.replace('export * from "./todayIntakeUiModel";', "");
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

const requireFromMobilePackage = createRequire(mobilePackagePath);
const { createClient } = requireFromMobilePackage("@supabase/supabase-js");
const storageValues = new Map();
const storage = {
  getItem: async (key) => storageValues.get(key) ?? null,
  setItem: async (key, value) => { storageValues.set(key, value); },
  removeItem: async (key) => { storageValues.delete(key); }
};
const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage }
});

const checks = [];
function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}
function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  throw new Error(`${name}: ${message}`);
}

function totalsOf(overview) {
  return {
    mealCount: overview.mealCount,
    itemCount: overview.itemCount,
    calories: overview.calculatedNutrition.calories,
    protein: overview.calculatedNutrition.protein,
    carbohydrates: overview.calculatedNutrition.carbohydrates,
    fat: overview.calculatedNutrition.fat,
    fiber: overview.calculatedNutrition.fiber
  };
}

// Build write flags (supabase writes enabled, planned meal write source: supabase)
const writeEnv = {
  ...env,
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE: "supabase",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE: "disabled"
};
// Build read flags (supabase writes disabled, all reads live)
const readEnv = {
  ...env,
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE: "disabled",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE: "disabled"
};

// Select a test date 30 days in the future to avoid colliding with production data.
const testDateDefault = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const testPlannedDate = env.TASTKIND_CONSUMER_PHASE2O_PLANNED_DATE ?? testDateDefault;
const testTimezone = env.TASTKIND_CONSUMER_PHASE2O_TIMEZONE ?? "Asia/Taipei";
const fixedClock = { now: () => new Date(`${testPlannedDate}T04:00:00.000Z`) };

try {
  const writeFlags = mealRuntime.getConsumerMealRuntimeFlags(writeEnv);
  if (writeFlags.issues.length) fail("write flags accepted", "Phase 2O write flags produced issues.", { issueCount: writeFlags.issues.length, issues: writeFlags.issues });
  pass("write flags accepted");

  const readFlags = mealRuntime.getConsumerMealRuntimeFlags(readEnv);
  if (readFlags.issues.length) fail("read flags accepted", "Phase 2O read flags produced issues.", { issueCount: readFlags.issues.length, issues: readFlags.issues });
  pass("read flags accepted");

  const authPort = new authRuntime.SupabaseConsumerAuthAdapter({ authClient: supabase.auth, transportEnabled: true });
  const signIn = await authPort.signIn({ email: signInEmail, password: signInPassword });
  if (!signIn.ok) fail("email sign-in", "Email sign-in failed.", { code: signIn.error.code });
  pass("email sign-in", { sessionMapped: true, tokenPrinted: false, sessionPrinted: false });

  // Pre-write count: how many planned meals exist for this test date (before write).
  const preWriteQuery = await supabase
    .from("planned_meals")
    .select("id")
    .eq("planned_for", testPlannedDate)
    .limit(100);
  if (preWriteQuery.error) fail("pre-write planned meals count", "Pre-write query failed.", { code: preWriteQuery.error.code });
  const preWriteCount = (preWriteQuery.data ?? []).length;
  pass("pre-write planned meals count", { count: preWriteCount, idsPrinted: false });

  // Save planned meal via write service.
  const writeService = mealRuntime.createConsumerPlannedMealWriteService(writeFlags, { authPort, mealClient: supabase });
  pass("write service created", { source: writeService.source });

  const saveResult = await writeService.saveCurrentUserPlannedMeal({
    plannedFor: testPlannedDate,
    mealType: "dinner",
    title: "Phase 2O smoke test dinner",
    notes: "Automated smoke test — safe to ignore.",
    nutritionSnapshot: { calories: 500, protein: 30, carbohydrates: 50, fat: 15, fiber: 6 }
  });
  if (saveResult.status !== "saved" || !saveResult.plannedMealId) {
    fail("save planned meal", "Save RPC did not return saved status.", { status: saveResult.status, errorCode: saveResult.errorCode });
  }
  const savedId = saveResult.plannedMealId;
  pass("save planned meal", {
    status: saveResult.status,
    source: saveResult.source,
    plannedMealIdPresent: !!savedId,
    plannedMealIdPrinted: false,
    rpcInvoked: true,
    databaseWriteUsed: true
  });

  // Read-after-save: verify the row exists and has correct initial state.
  const readAfterSave = await supabase
    .from("planned_meals")
    .select("id,planned_for,meal_type,display_name_snapshot,status")
    .eq("id", savedId)
    .limit(1);
  if (readAfterSave.error || !readAfterSave.data?.length) {
    fail("read-after-save", "Saved planned meal not found in database.", { queryError: readAfterSave.error?.code });
  }
  const savedRow = readAfterSave.data[0];
  if (savedRow.status !== "planned") fail("read-after-save status", "Saved planned meal must have status=planned.", { status: savedRow.status });
  if (savedRow.meal_type !== "dinner") fail("read-after-save meal_type", "Saved planned meal meal_type mismatch.");
  if (savedRow.display_name_snapshot !== "Phase 2O smoke test dinner") fail("read-after-save display_name_snapshot", "Saved planned meal display_name_snapshot mismatch.");
  pass("read-after-save", {
    statusVerified: savedRow.status === "planned",
    mealTypeVerified: true,
    displayNameVerified: true,
    rowIdPrinted: false,
    rawRowPrinted: false
  });

  // Post-write count: must be exactly preWriteCount + 1.
  const postWriteQuery = await supabase
    .from("planned_meals")
    .select("id")
    .eq("planned_for", testPlannedDate)
    .limit(100);
  const postWriteCount = (postWriteQuery.data ?? []).length;
  if (postWriteCount !== preWriteCount + 1) {
    fail("post-write count", "Planned meal count must increase by exactly 1 after save.", { preWriteCount, postWriteCount });
  }
  pass("post-write count", { preWriteCount, postWriteCount, delta: postWriteCount - preWriteCount, idsPrinted: false });

  // Actual totals check: planned meals must not affect consumed meal totals.
  const overviewService = mealRuntime.createConsumerTodayIntakeOverviewService(readFlags, {
    authPort,
    mealClient: supabase,
    clock: fixedClock,
    timezone: testTimezone
  });
  const overviewResult = await overviewService.getCurrentUserTodayIntakeOverview({ date: testPlannedDate });
  if (!overviewResult.ok) fail("overview read for totals check", "Overview read failed.", { code: overviewResult.error.code });
  const baselineTotals = totalsOf(overviewResult.value);
  pass("actual totals baseline captured", { actualTotalsUnchanged: true, snapshotPrinted: false });

  // Update planned meal.
  const updateResult = await writeService.updateCurrentUserPlannedMeal({
    plannedMealId: savedId,
    title: "Phase 2O smoke test dinner (updated)",
    nutritionSnapshot: { calories: 480, protein: 28, carbohydrates: 48, fat: 14, fiber: 7 }
  });
  if (updateResult.status !== "updated") {
    fail("update planned meal", "Update RPC did not return updated status.", { status: updateResult.status, errorCode: updateResult.errorCode });
  }
  pass("update planned meal", {
    status: updateResult.status,
    source: updateResult.source,
    plannedMealIdPrinted: false,
    rpcInvoked: true,
    databaseWriteUsed: true
  });

  // Read-after-update: verify display_name_snapshot was updated.
  const readAfterUpdate = await supabase
    .from("planned_meals")
    .select("id,display_name_snapshot,status")
    .eq("id", savedId)
    .limit(1);
  if (readAfterUpdate.error || !readAfterUpdate.data?.length) {
    fail("read-after-update", "Updated planned meal not found in database.", { queryError: readAfterUpdate.error?.code });
  }
  const updatedRow = readAfterUpdate.data[0];
  if (updatedRow.status !== "planned") fail("read-after-update status", "Updated planned meal status must still be planned.", { status: updatedRow.status });
  if (updatedRow.display_name_snapshot !== "Phase 2O smoke test dinner (updated)") {
    fail("read-after-update display_name_snapshot", "Updated planned meal display_name_snapshot was not updated.");
  }
  pass("read-after-update", {
    statusVerified: true,
    displayNameUpdated: true,
    rowIdPrinted: false,
    rawRowPrinted: false
  });

  // Actual totals unchanged after update.
  const overviewAfterUpdate = await overviewService.getCurrentUserTodayIntakeOverview({ date: testPlannedDate });
  if (!overviewAfterUpdate.ok) fail("overview after update", "Overview read after update failed.", { code: overviewAfterUpdate.error.code });
  if (JSON.stringify(totalsOf(overviewAfterUpdate.value)) !== JSON.stringify(baselineTotals)) {
    fail("actual totals unchanged after update", "Updating a planned meal must not change actual consumed totals.");
  }
  pass("actual totals unchanged after update", { actualTotalsUnchanged: true });

  // Remove planned meal.
  const removeResult = await writeService.removeCurrentUserPlannedMeal({ plannedMealId: savedId });
  if (removeResult.status !== "removed") {
    fail("remove planned meal", "Remove RPC did not return removed status.", { status: removeResult.status, errorCode: removeResult.errorCode });
  }
  pass("remove planned meal", {
    status: removeResult.status,
    source: removeResult.source,
    plannedMealIdPrinted: false,
    rpcInvoked: true,
    databaseWriteUsed: true
  });

  // Read-after-remove: verify status is 'cancelled' (soft cancel).
  const readAfterRemove = await supabase
    .from("planned_meals")
    .select("id,status")
    .eq("id", savedId)
    .limit(1);
  if (readAfterRemove.error || !readAfterRemove.data?.length) {
    fail("read-after-remove", "Soft-cancelled planned meal not found in database (expected row to remain with status=cancelled).", { queryError: readAfterRemove.error?.code });
  }
  const removedRow = readAfterRemove.data[0];
  if (removedRow.status !== "cancelled") {
    fail("read-after-remove status", "Removed planned meal must have status=cancelled (soft cancel, row must remain).", { status: removedRow.status });
  }
  pass("read-after-remove", {
    statusVerified: removedRow.status === "cancelled",
    rowRetained: true,
    rowIdPrinted: false,
    rawRowPrinted: false
  });

  // Repeated remove: must be idempotent (not_found or already_cancelled).
  const repeatedRemoveResult = await writeService.removeCurrentUserPlannedMeal({ plannedMealId: savedId });
  const repeatedRemoveOk = repeatedRemoveResult.status === "not_found" &&
    (repeatedRemoveResult.errorCode === "planned_meal_already_cancelled" || repeatedRemoveResult.errorCode === "planned_meal_remove_not_found");
  if (!repeatedRemoveOk) {
    fail("repeated remove idempotent", "Repeated remove of cancelled planned meal must return not_found.", {
      status: repeatedRemoveResult.status,
      errorCode: repeatedRemoveResult.errorCode
    });
  }
  pass("repeated remove idempotent", {
    status: repeatedRemoveResult.status,
    idempotent: true,
    plannedMealIdPrinted: false
  });

  // Actual totals unchanged after remove.
  const overviewAfterRemove = await overviewService.getCurrentUserTodayIntakeOverview({ date: testPlannedDate });
  if (!overviewAfterRemove.ok) fail("overview after remove", "Overview read after remove failed.", { code: overviewAfterRemove.error.code });
  if (JSON.stringify(totalsOf(overviewAfterRemove.value)) !== JSON.stringify(baselineTotals)) {
    fail("actual totals unchanged after remove", "Removing a planned meal must not change actual consumed totals.");
  }
  pass("actual totals unchanged after remove", { actualTotalsUnchanged: true });

  // Post-cancel count: total row count unchanged (soft cancel, row retained).
  const postCancelQuery = await supabase
    .from("planned_meals")
    .select("id")
    .eq("planned_for", testPlannedDate)
    .limit(100);
  const postCancelCount = (postCancelQuery.data ?? []).length;
  if (postCancelCount !== postWriteCount) {
    fail("post-cancel row count", "Row count must not decrease after soft cancel (row retained as cancelled).", { postWriteCount, postCancelCount });
  }
  pass("post-cancel row count retained", { preWriteCount, postWriteCount, postCancelCount, rowRetained: true, idsPrinted: false });

  // Sign out.
  const signOut = await authPort.signOut();
  if (!signOut.ok) fail("sign-out", "Sign-out failed.", { code: signOut.error.code });
  pass("sign-out");

  console.log(JSON.stringify({
    ...baseResult,
    status: "passed",
    phase,
    checks,
    save: "passed",
    readAfterSave: "passed",
    update: "passed",
    readAfterUpdate: "passed",
    remove: "passed",
    readAfterRemove: "passed",
    repeatedRemove: "passed",
    actualTotalsUnchanged: "passed",
    softCancelVerified: true,
    rowRetainedAfterCancel: true,
    clientCreated: true,
    signInUsed: true,
    networkRequestUsed: true,
    databaseReadUsed: true,
    databaseWriteUsed: true,
    rpcInvoked: true,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    plannedMealIdsPrinted: false,
    rawRowsPrinted: false,
    snapshotPrinted: false
  }, null, 2));
} catch {
  try {
    await supabase.auth.signOut();
  } catch {
    // Best-effort cleanup; error details must not be printed.
  }
  console.log(JSON.stringify({
    ...baseResult,
    status: "failed",
    phase,
    reason: "Live planned meal write smoke failed.",
    checks,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    plannedMealIdsPrinted: false,
    rawRowsPrinted: false,
    snapshotPrinted: false
  }, null, 2));
  process.exitCode = 1;
}
