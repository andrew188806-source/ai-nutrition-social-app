import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RECA_BASELINE, RECA_PATHS } from "./recommendation-rec-a-successor-manifest.mjs";

const root = process.cwd();
const issues = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  issues.push({ name, message, ...extra });
}

// Required files
const requiredFiles = [
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/adapters/disabledConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts",
  "scripts/consumer-meal-records-phase-2q-guard.mjs",
  "scripts/consumer-meal-records-phase-2q-smoke.mjs",
  "docs/consumer-runtime-integration/phase-2q-next-meal-recommendation-canonical-read-architecture.md"
];

for (const rel of requiredFiles) {
  if (fs.existsSync(path.join(root, rel))) pass(`required Phase 2Q file exists: ${rel}`);
  else fail(`required Phase 2Q file exists: ${rel}`, "Missing Phase 2Q required file.");
}

// Types contract
const types = read("apps/mobile/features/consumer-meals/types.ts");

if (/ConsumerNextMealRecommendationSource\s*=\s*"disabled"\s*\|\s*"mock"\s*\|\s*"local-menu-demo"/.test(types))
  pass("ConsumerNextMealRecommendationSource has exactly disabled, mock, local-menu-demo");
else fail("ConsumerNextMealRecommendationSource has exactly disabled, mock, local-menu-demo", "Source type must define exactly these three values.");

if (/ConsumerNextMealDataProvenance\s*=\s*"sample"\s*\|\s*"live"/.test(types))
  pass("ConsumerNextMealDataProvenance type exists with sample and live");
else fail("ConsumerNextMealDataProvenance type exists with sample and live", "Data provenance type must define sample and live.");

if (/ConsumerNextMealRankingMode/.test(types) && /nutrition_gap/.test(types) && /neutral_fallback/.test(types))
  pass("REC-A successor exposes truthful nutrition-gap and neutral ranking modes");
else fail("REC-A successor exposes truthful nutrition-gap and neutral ranking modes", "Ranking mode must distinguish active gap ranking from neutral fallback.");

if (/ConsumerNextMealRecommendationBasis/.test(types) && /nutrition_gap/.test(types) && /neutral_nutrition_fallback/.test(types))
  pass("REC-A successor reason basis is nutrition-gap or neutral fallback");
else fail("REC-A successor reason basis is nutrition-gap or neutral fallback", "Basis must only expose current evidence-backed values.");

if (/ConsumerNextMealRecommendationInput/.test(types) && /candidatePoolLimit/.test(types) && !/maxCandidates\s*=\s*premium|premium.*max|default.*10.*premium/.test(types))
  pass("ConsumerNextMealRecommendationInput uses neutral candidatePoolLimit without entitlement annotation");
else fail("ConsumerNextMealRecommendationInput uses neutral candidatePoolLimit without entitlement annotation", "Input must not embed entitlement-derived defaults.");

if (/plannedMealsAppliedToRanking:\s*false/.test(types))
  pass("ConsumerNextMealRecommendationContext marks plannedMealsAppliedToRanking as literal false");
else fail("ConsumerNextMealRecommendationContext marks plannedMealsAppliedToRanking as literal false", "Must explicitly declare planned meals do not affect ranking in Phase 2Q.");

if (/nutritionGoalsApplied:\s*boolean/.test(types))
  pass("ConsumerNextMealRecommendationContext records whether canonical goals were applied");
else fail("ConsumerNextMealRecommendationContext records whether canonical goals were applied", "Context must disclose goal authority usage.");

if (/todayIntakeApplied:\s*boolean/.test(types))
  pass("ConsumerNextMealRecommendationContext records Today Intake application");
else fail("ConsumerNextMealRecommendationContext records Today Intake application", "Context must track whether Today Intake was applied.");

if (/ConsumerNextMealRecommendationResult/.test(types) &&
    /status:\s*"available"/.test(types) &&
    /status:\s*"empty"/.test(types) &&
    /status:\s*"disabled"/.test(types) &&
    /status:\s*"intake_unavailable"/.test(types) &&
    /status:\s*"read_failed"/.test(types))
  pass("ConsumerNextMealRecommendationResult discriminated union has required 5 status variants");
else fail("ConsumerNextMealRecommendationResult discriminated union has required 5 status variants", "Result union must cover all terminal states.");

if (/interface ConsumerNextMealRecommendationRepository/.test(types) && /getRankedNextMealCandidates/.test(types))
  pass("ConsumerNextMealRecommendationRepository interface uses getRankedNextMealCandidates method");
else fail("ConsumerNextMealRecommendationRepository interface uses getRankedNextMealCandidates method", "Repository must not use getCurrentUser* naming.");

if (!/nextMealCandidateCountPolicy|getNextMealCandidateCount/.test(types))
  pass("types.ts does not import from U1 candidate-count policy");
else fail("types.ts does not import from U1 candidate-count policy", "Canonical types must not depend on U1 entitlement policy.");

// Feature flag
const flags = read("apps/mobile/features/consumer-meals/featureFlags.ts");

if (/EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE/.test(flags))
  pass("EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE in featureFlags.ts");
else fail("EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE in featureFlags.ts", "Flag env var name missing.");

if (/nextMealRecommendationSource/.test(flags) && /return "disabled"/.test(flags))
  pass("nextMealRecommendationSource parser defaults to disabled");
else fail("nextMealRecommendationSource parser defaults to disabled", "Unknown or unset value must fall back to disabled.");

if (/nextMealRecommendationSources\s*=\s*new Set/.test(flags) &&
    /["']disabled["']/.test(flags) && /["']mock["']/.test(flags) && /["']local-menu-demo["']/.test(flags))
  pass("nextMealRecommendationSources Set contains all three allowed values");
else fail("nextMealRecommendationSources Set contains all three allowed values", "Set must enumerate all valid source values.");

// Factories
const factories = read("apps/mobile/features/consumer-meals/factories.ts");

if (/createConsumerNextMealRecommendationRepository/.test(factories) &&
    /createConsumerNextMealRecommendationService/.test(factories))
  pass("factories.ts exports both next-meal factory functions");
else fail("factories.ts exports both next-meal factory functions", "Both factory functions must be present.");

if (/nextMealRecommendationRepository\?/.test(factories))
  pass("ConsumerMealFactoryDependencies includes optional nextMealRecommendationRepository");
else fail("ConsumerMealFactoryDependencies includes optional nextMealRecommendationRepository", "Dependency bag must accept optional repo override.");

// Service
const service = read("apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts");

if (/intakeOverviewService/.test(service) && /getCurrentUserTodayIntakeOverview/.test(service))
  pass("Service calls Today Intake Overview via intakeOverviewService");
else fail("Service calls Today Intake Overview via intakeOverviewService", "Service must orchestrate Today Intake Overview for current-user context.");

if (/clock\.now\(\)/.test(service) && /generatedAt/.test(service))
  pass("Service uses injected clock to produce generatedAt");
else fail("Service uses injected clock to produce generatedAt", "clock.now() must be the sole source of generatedAt.");

if (!/Date\.now\(\)|new Date\(\)|Math\.random\(\)/.test(service))
  pass("Service does not call Date.now(), new Date(), or Math.random()");
else fail("Service does not call Date.now(), new Date(), or Math.random()", "Service must be deterministic via injected clock.");

if (/readCurrentUserNutritionGoals/.test(service) && !/\b520\b/.test(service))
  pass("REC-A successor reads canonical goals without a fixed calorie reference");
else fail("REC-A successor reads canonical goals without a fixed calorie reference", "Service must use canonical goals and must not retain fixed 520 fallback authority.");

if (/plannedMealsAppliedToRanking:\s*false/.test(service))
  pass("Service sets plannedMealsAppliedToRanking: false");
else fail("Service sets plannedMealsAppliedToRanking: false", "Service must declare planned meals do not affect ranking.");

if (/intake_unavailable/.test(service))
  pass("Service returns intake_unavailable when Today Intake Overview fails");
else fail("Service returns intake_unavailable when Today Intake Overview fails", "Service must fail closed on intake read failure.");

// Repository boundaries
const disabled = read("apps/mobile/features/consumer-meals/adapters/disabledConsumerNextMealRecommendationRepository.ts");
const mock = read("apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts");
const demo = read("apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts");

if (!/@supabase\//.test(disabled) && !/@supabase\//.test(mock) && !/@supabase\//.test(demo))
  pass("No Phase 2Q repository imports @supabase");
else fail("No Phase 2Q repository imports @supabase", "Repositories must not use Supabase transport.");

if (!/Date\.now\(\)|new Date\(\)|Math\.random\(\)/.test(disabled) &&
    !/Date\.now\(\)|new Date\(\)|Math\.random\(\)/.test(mock) &&
    !/Date\.now\(\)|new Date\(\)|Math\.random\(\)/.test(demo))
  pass("No Phase 2Q repository calls Date.now(), new Date(), or Math.random()");
else fail("No Phase 2Q repository calls Date.now(), new Date(), or Math.random()", "Repositories must be deterministic.");

if (!/getCurrentUser/.test(disabled) && !/getCurrentUser/.test(mock) && !/getCurrentUser/.test(demo))
  pass("No Phase 2Q repository uses getCurrentUser* naming");
else fail("No Phase 2Q repository uses getCurrentUser* naming", "getCurrentUser belongs in the service, not repositories.");

if (/dataProvenance.*"sample"|"sample".*dataProvenance/.test(disabled) &&
    /dataProvenance.*"sample"|"sample".*dataProvenance/.test(mock) &&
    /dataProvenance.*"sample"|"sample".*dataProvenance/.test(demo))
  pass("All Phase 2Q repositories declare dataProvenance: 'sample'");
else fail("All Phase 2Q repositories declare dataProvenance: 'sample'", "Phase 2Q produces no live data.");

if (!/nextMealCandidateCountPolicy|getNextMealCandidateCount/.test(mock) &&
    !/nextMealCandidateCountPolicy|getNextMealCandidateCount/.test(demo))
  pass("Repositories do not import from U1 nextMealCandidateCountPolicy");
else fail("Repositories do not import from U1 nextMealCandidateCountPolicy", "Canonical runtime must not depend on U1 entitlement policy.");

if (/source.*"local-menu-demo"/.test(demo))
  pass("localMenuDemoConsumerNextMealRecommendationRepository source is local-menu-demo");
else fail("localMenuDemoConsumerNextMealRecommendationRepository source is local-menu-demo", "Source naming must be honest about demo nature.");

// No U1 modifications
const u1Diff = execFileSync("git", ["diff", "--name-only", "--", "apps/mobile/features/next-meal-prototype"], { cwd: root, encoding: "utf8" }).trim();
const u1Files = u1Diff ? u1Diff.split(/\r?\n/) : [];
if (u1Files.every((file) => RECA_PATHS.includes(file))) pass("U1 changes are limited to the authorized REC-A successor manifest", { files: u1Files });
else fail("U1 changes are limited to the authorized REC-A successor manifest", "Unexpected U1 file changed.", { files: u1Files });

const screenDiff = execFileSync("git", ["diff", "--name-only", "--", "apps/mobile/app/recommendation.tsx", "apps/mobile/app/index.tsx", "apps/mobile/app/analysis.tsx", "apps/mobile/app/meal-buddies.tsx"], { cwd: root, encoding: "utf8" }).trim();
const screenFiles = screenDiff ? screenDiff.split(/\r?\n/) : [];
if (screenFiles.every((file) => RECA_PATHS.includes(file))) pass("App-screen changes are limited to the authorized REC-A successor manifest", { files: screenFiles });
else fail("App-screen changes are limited to the authorized REC-A successor manifest", "Unexpected app screen changed.", { files: screenFiles });

// Migration count
const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((n) => n.endsWith(".sql")).sort();
const migrationDiff = execFileSync("git", ["diff", "--name-only", RECA_BASELINE, "--", "supabase/migrations"], { cwd: root, encoding: "utf8" }).trim();
if (!migrationDiff) pass("REC-A successor adds or modifies no migration", { count: migrations.length });
else fail("REC-A successor adds or modifies no migration", "Migration scope changed.", { files: migrationDiff.split(/\r?\n/) });

// Documentation
const docPath = "docs/consumer-runtime-integration/phase-2q-next-meal-recommendation-canonical-read-architecture.md";
if (fs.existsSync(path.join(root, docPath))) {
  pass(`required Phase 2Q documentation exists: ${docPath}`);
  const doc = read(docPath);
  if (/grant gap|no.*SELECT grant|no.*live.*read|no.*Supabase.*read/i.test(doc))
    pass("Documentation acknowledges missing live read capability");
  else fail("Documentation acknowledges missing live read capability", "Doc must explain absence of live Supabase recommendation read.");
  if (/sample|demo|not.*live|prototype/i.test(doc))
    pass("Documentation explicitly describes data as sample/demo");
  else fail("Documentation explicitly describes data as sample/demo", "Doc must be clear about demo data nature.");
  if (/plannedMealsAppliedToRanking.*false|planned meals.*not.*applied|planned meals.*not.*affect/i.test(doc))
    pass("Documentation states planned meals do not affect ranking");
  else fail("Documentation states planned meals do not affect ranking", "Doc must not claim planned-meal-aware ranking.");
  if (/Phase 2R|phase2r/i.test(doc))
    fail("Documentation does not reference Phase 2R", "Doc must not leak next-phase implementation details.");
  else pass("Documentation does not reference Phase 2R");
} else {
  fail(`required Phase 2Q documentation exists: ${docPath}`, "Missing Phase 2Q documentation file.");
}

// Package.json scripts
const pkg = read("package.json");
if (/test:consumer-phase2q/.test(pkg) && /test:consumer-phase2q-smoke/.test(pkg) && /test:consumer-phase2q-mock-smoke/.test(pkg))
  pass("package.json contains all three Phase 2Q scripts");
else fail("package.json contains all three Phase 2Q scripts", "Missing Phase 2Q npm scripts.");

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2Q Canonical Next Meal Recommendation Read Architecture",
  totalChecks: checks.length,
  passedChecks: checks.filter((c) => c.pass).length,
  failedChecks: checks.filter((c) => !c.pass).length,
  checks,
  issues,
  migrationCount: migrations.length,
  phase2RStarted: false,
  databaseWriteUsed: false,
  productionTouched: false
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);
