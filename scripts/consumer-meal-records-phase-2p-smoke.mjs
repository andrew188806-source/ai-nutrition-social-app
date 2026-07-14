import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const mockContract = process.argv.includes("--mock-contract");

const result = {
  status: "skipped",
  phase: "Consumer Runtime Integration Phase 2P Meal Correction Architecture Smoke",
  reason: "SKIPPED - Consumer Runtime Phase 2P default smoke does not enable correction reads.",
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
  rawRowsPrinted: false,
  sqlExecuted: false,
  migrationCreated: false,
  seedExecuted: false,
  fixtureCreated: false,
  productionTouched: false,
  nextPhaseStarted: false
};

if (!mockContract) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2p-"));
const featureRoot = path.join(root, "apps", "mobile", "features");
copyFeatureTs("consumer-auth");
copyFeatureTs("consumer-meals");

const requireFromTemp = createRequire(path.join(tempRoot, "consumer-meals", "consumerMealCorrectionService.js"));
const serviceModule = requireFromTemp("./consumerMealCorrectionService.js");
const disabledRepoModule = requireFromTemp("./adapters/disabledConsumerMealCorrectionRepository.js");
const mockRepoModule = requireFromTemp("./adapters/mockConsumerMealCorrectionRepository.js");
const preparedRepoModule = requireFromTemp("./adapters/supabasePreparedConsumerMealCorrectionRepository.js");

const checks = [];
function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}
function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  throw new Error(`${name}: ${message}`);
}

const correctionOverviewShape = { status: "skipped" };
const discriminatedUnionShape = { status: "skipped" };
const disabledRepositoryReturnsDisabled = { status: "skipped" };
const preparedRepositoryReturnsGrantPending = { status: "skipped" };

try {
  const { MOCK_CORRECTED_MEAL_RECORD_ID, MockConsumerMealCorrectionRepository } = mockRepoModule;

  // Mock repository — known ID returns available with canonical overview
  const mockRepo = new MockConsumerMealCorrectionRepository();
  const availableResult = await mockRepo.getCurrentUserMealCorrectionOverview({ mealRecordId: MOCK_CORRECTED_MEAL_RECORD_ID });
  if (availableResult.status !== "available") fail("mock-contract correction overview for known ID", "Expected status 'available' for known mock meal record.", { availableResult });
  const overview = availableResult.overview;
  if (!overview || typeof overview.mealRecordId !== "string" || !Array.isArray(overview.items) || typeof overview.hasAnyCorrections !== "boolean") {
    fail("mock-contract correction overview shape", "Overview must have mealRecordId (string), items (array), hasAnyCorrections (boolean).", { overview });
  }
  pass("mock-contract correction overview for known meal record ID", { mealRecordId: overview.mealRecordId, itemCount: overview.items.length, hasAnyCorrections: overview.hasAnyCorrections });
  correctionOverviewShape.status = "passed";

  // Discriminated union — verify at least one item has a typed correction detail
  const correctedItem = overview.items.find((item) => item.correction !== null);
  if (!correctedItem) fail("mock-contract correction item with non-null detail", "Expected at least one item with a correction detail.");
  if (!correctedItem.correction || typeof correctedItem.correction.correctionType !== "string") {
    fail("mock-contract correction detail discriminated union shape", "Correction detail must have correctionType discriminant.");
  }
  const validTypes = ["nutrition_override", "ingredient_adjustment", "portion_adjustment", "cooking_adjustment", "name_change", "unknown"];
  if (!validTypes.includes(correctedItem.correction.correctionType)) {
    fail("mock-contract correction detail discriminated union shape", `Unknown correctionType: ${correctedItem.correction.correctionType}`);
  }
  pass("mock-contract correction detail discriminated union shape", { correctionType: correctedItem.correction.correctionType });
  discriminatedUnionShape.status = "passed";

  // Mock repository — unknown ID returns empty
  const emptyResult = await mockRepo.getCurrentUserMealCorrectionOverview({ mealRecordId: "unknown-meal-record-id" });
  if (emptyResult.status !== "empty") fail("mock-contract correction overview for unknown ID", "Expected status 'empty' for unknown meal record.", { emptyResult });
  pass("mock-contract correction overview for unknown meal record ID returns empty");

  // Disabled repository
  const { DisabledConsumerMealCorrectionRepository } = disabledRepoModule;
  const disabledRepo = new DisabledConsumerMealCorrectionRepository();
  const disabledResult = await disabledRepo.getCurrentUserMealCorrectionOverview({ mealRecordId: MOCK_CORRECTED_MEAL_RECORD_ID });
  if (disabledResult.status !== "disabled") fail("disabled correction repository returns disabled", "Disabled repository must return status 'disabled'.", { disabledResult });
  pass("disabled correction repository returns disabled status");
  disabledRepositoryReturnsDisabled.status = "passed";

  // Supabase-prepared repository
  const { SupabasePreparedConsumerMealCorrectionRepository } = preparedRepoModule;
  const preparedRepo = new SupabasePreparedConsumerMealCorrectionRepository();
  const preparedResult = await preparedRepo.getCurrentUserMealCorrectionOverview({ mealRecordId: MOCK_CORRECTED_MEAL_RECORD_ID });
  if (preparedResult.status !== "grant_pending") fail("prepared correction repository returns grant_pending", "Prepared repository must return status 'grant_pending'.", { preparedResult });
  if (preparedResult.errorCode !== "correction_read_grant_pending") fail("prepared correction repository errorCode", "Prepared repository must return errorCode 'correction_read_grant_pending'.", { preparedResult });
  pass("prepared correction repository returns grant_pending with correction_read_grant_pending errorCode");
  preparedRepositoryReturnsGrantPending.status = "passed";

  // Service wrapper — delegates to repository
  const service = new serviceModule.ConsumerMealCorrectionService({ repository: mockRepo });
  const serviceResult = await service.getCurrentUserMealCorrectionOverview({ mealRecordId: MOCK_CORRECTED_MEAL_RECORD_ID });
  if (serviceResult.status !== "available") fail("correction service delegates to repository", "Service must delegate getCurrentUserMealCorrectionOverview to the repository.", { serviceResult });
  pass("correction service delegates to mock repository correctly");

  console.log(
    JSON.stringify(
      {
        ...result,
        status: "passed",
        reason: "Phase 2P mock-contract smoke: correction read architecture verified locally",
        correctionOverviewShape: correctionOverviewShape.status,
        discriminatedUnionShape: discriminatedUnionShape.status,
        disabledRepositoryReturnsDisabled: disabledRepositoryReturnsDisabled.status,
        preparedRepositoryReturnsGrantPending: preparedRepositoryReturnsGrantPending.status,
        checks,
        credentialsPrinted: false,
        tokenPrinted: false,
        correctionGrantPending: true
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(JSON.stringify({ ...result, status: "failed", reason: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exit(1);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function copyFeatureTs(featureName) {
  const src = path.join(featureRoot, featureName);
  const dest = path.join(tempRoot, featureName);
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false
  };
  const tsFiles = collectTsFiles(src);
  const program = ts.createProgram(tsFiles, { ...compilerOptions, outDir: dest, rootDir: src });
  program.emit();
}

function collectTsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsFiles(full));
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(full);
  }
  return files;
}
