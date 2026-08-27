import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import child from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const mockContract = process.argv.includes("--mock-contract");

const result = {
  status: "skipped",
  phase: "Consumer Runtime Integration Phase 2Q Canonical Next Meal Recommendation Read Architecture Smoke",
  reason: "SKIPPED - Consumer Runtime Phase 2Q default smoke does not enable recommendation source.",
  clientCreated: false,
  signInUsed: false,
  networkRequestUsed: false,
  databaseReadUsed: false,
  databaseWriteUsed: false,
  rpcInvoked: false,
  supabaseUsed: false,
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
  plannedMealWriteUsed: false,
  mealBuddyMutationUsed: false,
  u1CutoverPerformed: false,
  nextPhaseStarted: false
};

if (!mockContract) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// Phase 2Q's fixed-reference mock contract is intentionally superseded by REC-A.
// Keep the historical harness unchanged for older checkouts; on the successor,
// exercise the dedicated canonical-goals + Today Intake contract instead.
if (fs.existsSync(path.join(root, "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts"))) {
  const successor = child.spawnSync(process.execPath, ["scripts/recommendation-rec-a-smoke.mjs"], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  if (successor.stdout) process.stdout.write(successor.stdout);
  if (successor.stderr) process.stderr.write(successor.stderr);
  process.exit(successor.status ?? 1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-meal-phase2q-"));
const featureRoot = path.join(root, "apps", "mobile", "features");

// Compile consumer-auth and consumer-meals together using featureRoot as rootDir.
// Using featureRoot as rootDir keeps all cross-feature imports within the same root,
// so TypeScript emits everything to tempRoot/features/ instead of emitting cross-boundary
// imports in-place next to their source files.
{
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false
  };
  const featuresFiles = [
    ...collectTsFiles(path.join(featureRoot, "consumer-auth")),
    ...collectTsFiles(path.join(featureRoot, "consumer-meals"))
  ];
  if (featuresFiles.length > 0) {
    const program = ts.createProgram(featuresFiles, {
      ...compilerOptions,
      outDir: path.join(tempRoot, "features"),
      rootDir: featureRoot
    });
    const outBase = path.normalize(tempRoot).toLowerCase();
    program.emit(undefined, (fileName, data, writeBOM) => {
      if (path.normalize(fileName).toLowerCase().startsWith(outBase)) {
        ts.sys.writeFile(fileName, data, writeBOM);
      }
      // TypeScript emits out-of-rootDir files to their absolute source paths — silently discard
    });
  }
}

// Stub service layer — the real chain requires @haocu/shared which has no CommonJS build.
// The smoke only verifies that localMenuDemoRepo returns available/empty; interface shape is sufficient.
const stubsDir = path.join(tempRoot, "services");
fs.mkdirSync(stubsDir, { recursive: true });
fs.writeFileSync(path.join(stubsDir, "mobile-menu-item-service.js"),
  '"use strict";\n' +
  'Object.defineProperty(exports, "__esModule", { value: true });\n' +
  'exports.mobileMenuItemService = {\n' +
  '  getRecommendedMenuItemsForNextMeal(limit) {\n' +
  '    const items = [\n' +
  '      { menuItemId: "smoke-demo-1", restaurantId: "smoke-r1", branchId: "smoke-b1",\n' +
  '        dishName: "好廚煲仔飯", restaurantName: "好廚示範館", calories: 510, protein: 25,\n' +
  '        distance: "中正區", emoji: "🍲" },\n' +
  '      { menuItemId: "smoke-demo-2", restaurantId: "smoke-r1", branchId: "smoke-b1",\n' +
  '        dishName: "健康便當", restaurantName: "好廚示範館", calories: 490, protein: 22,\n' +
  '        distance: "中正區", emoji: "🥗" }\n' +
  '    ];\n' +
  '    return items.slice(0, limit);\n' +
  '  }\n' +
  '};\n'
);
fs.writeFileSync(path.join(stubsDir, "mobile-restaurant-service.js"),
  '"use strict";\n' +
  'Object.defineProperty(exports, "__esModule", { value: true });\n' +
  'exports.mobileRestaurantService = {\n' +
  '  findRestaurantById(id) {\n' +
  '    return id === "smoke-r1" ? { id: "smoke-r1", location: "台北市", tags: ["健康", "便當"] } : null;\n' +
  '  }\n' +
  '};\n'
);

const requireFromTemp = createRequire(path.join(tempRoot, "features", "consumer-meals", "consumerNextMealRecommendationService.js"));

const checks = [];
function pass(name, extra = {}) { checks.push({ name, pass: true, ...extra }); }
function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  throw new Error(`${name}: ${message}`);
}

const disabledRepoResult = { status: "skipped" };
const mockRepoResult = { status: "skipped" };
const localDemoRepoResult = { status: "skipped" };
const serviceOrchestrationResult = { status: "skipped" };
const clockOwnershipResult = { status: "skipped" };
const intakeOverviewResult = { status: "skipped" };

try {
  const serviceModule = requireFromTemp("./consumerNextMealRecommendationService.js");
  const disabledModule = requireFromTemp("./adapters/disabledConsumerNextMealRecommendationRepository.js");
  const mockModule = requireFromTemp("./adapters/mockConsumerNextMealRecommendationRepository.js");
  const demoModule = requireFromTemp("./adapters/localMenuDemoConsumerNextMealRecommendationRepository.js");

  const { ConsumerNextMealRecommendationService } = serviceModule;
  const { DisabledConsumerNextMealRecommendationRepository } = disabledModule;
  const { MockConsumerNextMealRecommendationRepository } = mockModule;
  const { LocalMenuDemoConsumerNextMealRecommendationRepository } = demoModule;

  // 1. Disabled repository returns disabled
  const disabledRepo = new DisabledConsumerNextMealRecommendationRepository();
  const disabledRepoRaw = await disabledRepo.getRankedNextMealCandidates({ referenceCaloriesPerMeal: 520 });
  if (disabledRepoRaw.status !== "disabled") fail("disabled repository returns disabled status", `Expected disabled, got ${disabledRepoRaw.status}`);
  pass("disabled repository returns disabled status");
  disabledRepoResult.status = "passed";

  // 2. Mock repository returns available with deterministic candidates
  const mockRepo = new MockConsumerNextMealRecommendationRepository();
  const mockRepoRaw = await mockRepo.getRankedNextMealCandidates({ referenceCaloriesPerMeal: 520 });
  if (mockRepoRaw.status !== "available") fail("mock repository returns available status", `Expected available, got ${mockRepoRaw.status}`);
  if (!Array.isArray(mockRepoRaw.candidates) || mockRepoRaw.candidates.length === 0) fail("mock repository returns non-empty candidate array", "candidates must be non-empty");
  if (mockRepoRaw.candidates[0].rankOrdinal !== 0) fail("mock first candidate has rankOrdinal 0", "First candidate must have rankOrdinal 0");
  if (mockRepoRaw.candidates[0].reason.reasonBasis !== "calorie_proximity") fail("mock candidate reason basis is calorie_proximity", "Must use evidence-backed basis only");
  pass("mock repository returns available with deterministic ranked candidates");
  mockRepoResult.status = "passed";

  // 3. Mock repository is deterministic — same result on second call
  const mockRepoRaw2 = await mockRepo.getRankedNextMealCandidates({ referenceCaloriesPerMeal: 520 });
  if (JSON.stringify(mockRepoRaw.candidates.map(c => c.candidateId)) !== JSON.stringify(mockRepoRaw2.candidates.map(c => c.candidateId)))
    fail("mock repository is deterministic across calls", "Candidate order must not change between calls");
  pass("mock repository is deterministic across calls");

  // 4. Local-menu-demo repository returns available or empty (depends on static data loading)
  const demoRepo = new LocalMenuDemoConsumerNextMealRecommendationRepository();
  const demoRepoRaw = await demoRepo.getRankedNextMealCandidates({ referenceCaloriesPerMeal: 520 });
  if (demoRepoRaw.status !== "available" && demoRepoRaw.status !== "empty")
    fail("local-menu-demo repository returns available or empty", `Got unexpected status: ${demoRepoRaw.status}`);
  if (demoRepo.source !== "local-menu-demo") fail("local-menu-demo repository source field is local-menu-demo", `Got: ${demoRepo.source}`);
  if (demoRepo.dataProvenance !== "sample") fail("local-menu-demo repository dataProvenance is sample", `Got: ${demoRepo.dataProvenance}`);
  pass("local-menu-demo repository returns available or empty and is correctly labeled as sample data", { status: demoRepoRaw.status });
  localDemoRepoResult.status = "passed";

  // 5. Service orchestration — injected clock provides generatedAt; intake overview is called
  const fixedNow = new Date("2026-07-14T10:00:00.000Z");
  const mockClock = { now: () => fixedNow };
  const expectedGeneratedAt = fixedNow.toISOString();

  // Build a minimal mock intake overview service
  const mockIntakeService = {
    async getCurrentUserTodayIntakeOverview() {
      return {
        ok: true,
        value: {
          date: "2026-07-14",
          timezone: "Asia/Taipei",
          meals: [],
          calculatedNutrition: { calories: 320, protein: 15, carbohydrates: 45, fat: 8, fiber: 3, mealCount: 1, itemCount: 2 },
          storedNutrition: null,
          storedSummaryStatus: "unavailable",
          mealCount: 1,
          itemCount: 2,
          actualConsumedStatus: "available",
          plannedMeals: [{ date: "2026-07-14", title: "晚餐計畫" }],
          plannedMealsStatus: "available",
          provenance: {},
          warnings: [],
          status: "complete",
          generatedAt: expectedGeneratedAt
        }
      };
    }
  };

  const service = new ConsumerNextMealRecommendationService({
    repository: mockRepo,
    intakeOverviewService: mockIntakeService,
    clock: mockClock,
    timezone: "Asia/Taipei"
  });

  const serviceRaw = await service.getCurrentUserNextMealRecommendation({ date: "2026-07-14" });

  if (serviceRaw.status !== "available") fail("service returns available with mock repository", `Got: ${serviceRaw.status}`);
  const rec = serviceRaw.recommendation;
  if (rec.context.generatedAt !== expectedGeneratedAt) fail("service generatedAt matches injected clock", `Expected ${expectedGeneratedAt}, got ${rec.context.generatedAt}`);
  pass("service generatedAt comes from injected clock");
  clockOwnershipResult.status = "passed";

  if (rec.context.intakeOverviewUsed !== true) fail("service records intakeOverviewUsed: true when intake service returns data", `Got: ${rec.context.intakeOverviewUsed}`);
  pass("service records intakeOverviewUsed: true");
  intakeOverviewResult.status = "passed";

  if (rec.context.referenceIsActualTarget !== false) fail("service context referenceIsActualTarget is false", `Got: ${rec.context.referenceIsActualTarget}`);
  if (rec.context.plannedMealsAppliedToRanking !== false) fail("service context plannedMealsAppliedToRanking is false", `Got: ${rec.context.plannedMealsAppliedToRanking}`);
  pass("service context correctly marks reference as fallback and planned meals as not applied to ranking");

  if (rec.context.alreadyConsumedCalories !== 320) fail("service extracts alreadyConsumedCalories from intake overview", `Expected 320, got ${rec.context.alreadyConsumedCalories}`);
  if (rec.context.plannedMealCount !== 1) fail("service extracts plannedMealCount from intake overview", `Expected 1, got ${rec.context.plannedMealCount}`);
  pass("service correctly reads nutrition context and planned meals from Today Intake Overview");
  serviceOrchestrationResult.status = "passed";

  if (rec.dataProvenance !== "sample") fail("service recommendation dataProvenance is sample", `Got: ${rec.dataProvenance}`);
  pass("service recommendation dataProvenance is sample");

  if (rec.context.personalizationLevel !== "intake_context") fail("service personalizationLevel is intake_context when intake has data", `Got: ${rec.context.personalizationLevel}`);
  pass("service personalizationLevel is intake_context when Today Intake Overview has consumed meals");

  // 6. Service fails closed when intake overview fails
  const failingIntakeService = {
    async getCurrentUserTodayIntakeOverview() {
      return { ok: false, error: { code: "meal_session_missing" } };
    }
  };
  const serviceWithFailingIntake = new ConsumerNextMealRecommendationService({
    repository: mockRepo,
    intakeOverviewService: failingIntakeService,
    clock: mockClock
  });
  const failedResult = await serviceWithFailingIntake.getCurrentUserNextMealRecommendation({});
  if (failedResult.status !== "intake_unavailable") fail("service returns intake_unavailable when intake overview fails", `Got: ${failedResult.status}`);
  pass("service returns intake_unavailable when Today Intake Overview fails (fail-closed)");

  // 7. Disabled source from service returns disabled without calling intake
  let intakeCalled = false;
  const trackingIntake = { async getCurrentUserTodayIntakeOverview() { intakeCalled = true; return { ok: false, error: { code: "unreachable" } }; } };
  const disabledSourceService = new ConsumerNextMealRecommendationService({
    repository: new DisabledConsumerNextMealRecommendationRepository(),
    intakeOverviewService: trackingIntake,
    clock: mockClock
  });
  const disabledSourceResult = await disabledSourceService.getCurrentUserNextMealRecommendation({});
  if (disabledSourceResult.status !== "disabled") fail("disabled source service returns disabled", `Got: ${disabledSourceResult.status}`);
  if (intakeCalled) fail("disabled source does not call intake overview", "Intake should not be called when source is disabled");
  pass("disabled source returns disabled immediately without calling Today Intake Overview");

  console.log(JSON.stringify({
    ...result,
    status: "passed",
    reason: "Phase 2Q mock-contract smoke: canonical next-meal recommendation architecture verified locally",
    disabledRepositoryReturnsDisabled: disabledRepoResult.status,
    mockRepositoryReturnsAvailable: mockRepoResult.status,
    localMenuDemoRepositoryReturnsAvailableOrEmpty: localDemoRepoResult.status,
    serviceOrchestration: serviceOrchestrationResult.status,
    clockOwnership: clockOwnershipResult.status,
    intakeOverviewReuse: intakeOverviewResult.status,
    checks
  }, null, 2));

} catch (error) {
  console.error(JSON.stringify({
    ...result,
    status: "failed",
    reason: error instanceof Error ? error.message : String(error),
    disabledRepositoryReturnsDisabled: disabledRepoResult.status,
    mockRepositoryReturnsAvailable: mockRepoResult.status,
    localMenuDemoRepositoryReturnsAvailableOrEmpty: localDemoRepoResult.status,
    serviceOrchestration: serviceOrchestrationResult.status,
    clockOwnership: clockOwnershipResult.status,
    intakeOverviewReuse: intakeOverviewResult.status,
    checks
  }, null, 2));
  process.exit(1);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function compileTs(srcPathOrDir, dest, rootDir) {
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: false,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false
  };
  const tsFiles = collectTsFiles(fs.existsSync(srcPathOrDir) && fs.statSync(srcPathOrDir).isDirectory() ? srcPathOrDir : path.dirname(srcPathOrDir));
  if (!tsFiles.length) return;
  const program = ts.createProgram(tsFiles, { ...compilerOptions, outDir: dest, rootDir });
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
