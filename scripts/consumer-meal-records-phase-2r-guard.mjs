import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

// ─── 1. Required files exist ──────────────────────────────────────────────────

const requiredFiles = [
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts",
  "scripts/consumer-meal-records-phase-2r-guard.mjs",
  "scripts/consumer-meal-records-phase-2r-smoke.mjs",
  "docs/consumer-runtime-integration/phase-2r-canonical-provider-integration-and-u1-cutover.md"
];

for (const rel of requiredFiles) {
  if (fs.existsSync(path.join(root, rel))) pass(`required Phase 2R file exists: ${rel}`);
  else fail(`required Phase 2R file exists: ${rel}`, "Missing Phase 2R required file.");
}

// ─── 2. Mapper dependency direction ──────────────────────────────────────────

const mapper = read("apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts");

if (!/adapters\//.test(mapper) && !/Repository/.test(mapper))
  pass("mapper does not import from repository adapters");
else fail("mapper does not import from repository adapters", "Mapper must only depend on canonical types, not repositories.");

if (!/factories/.test(mapper))
  pass("mapper does not import from factories");
else fail("mapper does not import from factories", "Mapper must not call factory functions.");

if (!/@supabase\//.test(mapper))
  pass("mapper does not import @supabase");
else fail("mapper does not import @supabase", "Mapper must be Supabase-free.");

if (/from "\.\.\/consumer-meals\/types"/.test(mapper))
  pass("mapper imports only consumer-meals types (not factories/adapters)");
else fail("mapper imports only consumer-meals types (not factories/adapters)", "Mapper must import canonical types.");

// ─── 3. Provider dependency direction ────────────────────────────────────────

const provider = read("apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts");

if (!/@supabase\//.test(provider))
  pass("canonical provider does not import @supabase");
else fail("canonical provider does not import @supabase", "Provider must be Supabase-free.");

if (!/adapters\//.test(provider))
  pass("canonical provider does not import repository adapters directly");
else fail("canonical provider does not import repository adapters directly", "Provider must use factory, not direct repo imports.");

if (!/from "\.\.\/consumer-meals\/types"/.test(provider))
  pass("canonical provider does not import consumer-meals types directly (uses factories only)");
else fail("canonical provider does not import consumer-meals types directly (uses factories only)", "Provider should only import from factories, not types.");

if (/createConsumerNextMealRecommendationService/.test(provider))
  pass("canonical provider calls createConsumerNextMealRecommendationService via factories");
else fail("canonical provider calls createConsumerNextMealRecommendationService via factories", "Provider must wire canonical service through the factory.");

// ─── 4. No reverse import (consumer-meals must not import next-meal-prototype) ─

const consumerMealsFiles = collectFiles(path.join(root, "apps/mobile/features/consumer-meals"), ".ts");
let reverseImportFound = false;
for (const f of consumerMealsFiles) {
  const content = fs.readFileSync(f, "utf8");
  if (/next-meal-prototype/.test(content)) {
    reverseImportFound = true;
    fail("consumer-meals does not import from next-meal-prototype", `Reverse import found in ${path.relative(root, f)}.`);
    break;
  }
}
if (!reverseImportFound) pass("consumer-meals does not import from next-meal-prototype");

// ─── 5. Recommendation screen isolation ──────────────────────────────────────

const screen = read("apps/mobile/app/recommendation.tsx");

if (!/from.*features\/consumer-meals/.test(screen))
  pass("recommendation.tsx does not import consumer-meals directly");
else fail("recommendation.tsx does not import consumer-meals directly", "Screen must only import from next-meal-prototype public API.");

if (!/adapters\//.test(screen))
  pass("recommendation.tsx does not import repository adapters");
else fail("recommendation.tsx does not import repository adapters", "Screen must not directly reference repositories.");

if (!/@supabase\//.test(screen))
  pass("recommendation.tsx does not import @supabase");
else fail("recommendation.tsx does not import @supabase", "Screen must be Supabase-free.");

if (!/parseConsumerMealRuntimeFlags|getConsumerMealRuntimeFlags|featureFlags/.test(screen))
  pass("recommendation.tsx does not parse Runtime env flags");
else fail("recommendation.tsx does not parse Runtime env flags", "Screen must not read Runtime env directly.");

if (!/getCurrentUserTodayIntakeOverview|TodayIntakeOverview/.test(screen))
  pass("recommendation.tsx does not directly obtain Today Intake context");
else fail("recommendation.tsx does not directly obtain Today Intake context", "Intake orchestration belongs in the canonical service.");

if (/canonicalProvider/.test(screen) && !/u1MockProvider/.test(screen))
  pass("recommendation.tsx wires canonicalProvider and has removed u1MockProvider");
else if (/canonicalProvider/.test(screen))
  fail("recommendation.tsx wires canonicalProvider and has removed u1MockProvider", "u1MockProvider must not be wired after Phase 2R cutover.");
else
  fail("recommendation.tsx wires canonicalProvider and has removed u1MockProvider", "canonicalProvider must be wired in recommendation.tsx.");

// ─── 6. Write prohibition ─────────────────────────────────────────────────────

const providerAndMapper = provider + mapper;

if (!/plannedMeal.*[Ww]rite|writePlanned|savePlanned|insertPlanned/.test(providerAndMapper))
  pass("no planned-meal write in provider or mapper");
else fail("no planned-meal write in provider or mapper", "Phase 2R must not write planned meals.");

if (!/mealBuddy.*[Cc]reate|createBuddy|insertBuddy|buddyCard.*[Ww]rite/.test(providerAndMapper))
  pass("no meal-buddy card creation in provider or mapper");
else fail("no meal-buddy card creation in provider or mapper", "Phase 2R must not create buddy cards.");

if (!/quota.*[Mm]utate|mutate.*quota|deductQuota|useQuota/.test(providerAndMapper))
  pass("no quota mutation in provider or mapper");
else fail("no quota mutation in provider or mapper", "Phase 2R must not mutate quota.");

if (!/pendingMatch.*[Cc]reate|createMatch|insertMatch/.test(providerAndMapper))
  pass("no pending-match creation in provider or mapper");
else fail("no pending-match creation in provider or mapper", "Phase 2R must not create pending matches.");

// ─── 7. Entitlement boundary ──────────────────────────────────────────────────

const policy = read("apps/mobile/features/next-meal-prototype/nextMealCandidateCountPolicy.ts");

if (/free.*3|3.*free/i.test(policy) && /premium.*10|10.*premium/i.test(policy))
  pass("Free 3 / Premium 10 defined in nextMealCandidateCountPolicy.ts");
else fail("Free 3 / Premium 10 defined in nextMealCandidateCountPolicy.ts", "Policy counts must live in nextMealCandidateCountPolicy.");

if (!/free.*3|3.*free/i.test(provider) && !/premium.*10|10.*premium/i.test(provider))
  pass("canonical provider does not redeclare Free 3 / Premium 10 literals");
else fail("canonical provider does not redeclare Free 3 / Premium 10 literals", "Candidate counts must only be declared in nextMealCandidateCountPolicy.");

if (!/getNextMealCandidateCount\("premium"\)/.test(provider))
  pass("canonical provider does not call getNextMealCandidateCount(\"premium\") to size canonical pool");
else fail("canonical provider does not call getNextMealCandidateCount(\"premium\") to size canonical pool", "Pool limit must not be derived from Premium entitlement semantics.");

if (!/entitlement.*getCurrentUserNextMealRecommendation|getCurrentUserNextMealRecommendation.*entitlement/.test(provider))
  pass("canonical provider does not pass entitlement to canonical service");
else fail("canonical provider does not pass entitlement to canonical service", "Entitlement must not enter the canonical service layer.");

// ─── 8. Status mapping integrity ──────────────────────────────────────────────

if (/return \{ status: "disabled"/.test(mapper))
  pass("mapper maps canonical disabled → U1 disabled");
else fail("mapper maps canonical disabled → U1 disabled", "disabled must not become success or empty.");

if (/retryable.*false/.test(mapper))
  pass("mapper produces retryable: false for intake_unavailable");
else fail("mapper produces retryable: false for intake_unavailable", "intake_unavailable must map to non-retryable error.");

if (/retryable.*true/.test(mapper))
  pass("mapper produces retryable: true for read_failed");
else fail("mapper produces retryable: true for read_failed", "read_failed must map to retryable error.");

if (/isSampleData.*true/.test(mapper))
  pass("mapper sets isSampleData: true for canonical sample sources");
else fail("mapper sets isSampleData: true for canonical sample sources", "All Phase 2R canonical sources are sample data.");

// ─── 9. preferredPrototypeId handling ────────────────────────────────────────

if (/preferredCandidateId|preferredPrototypeId/.test(mapper))
  pass("mapper has explicit preferredPrototypeId/preferredCandidateId handling");
else fail("mapper has explicit preferredPrototypeId/preferredCandidateId handling", "Mapper must handle preferred candidate promotion.");

if (/candidateId === preferredCandidateId|preferredCandidateId.*candidateId|findIndex/.test(mapper))
  pass("mapper promotes preferred candidate by candidateId match");
else fail("mapper promotes preferred candidate by candidateId match", "Promotion must use candidateId comparison.");

// ─── 10. Sample badge and context note ───────────────────────────────────────

const i18n = read("lib/i18n/zh-TW.ts");

if (/canonicalSampleBadge.*示範餐點資料|示範餐點資料.*canonicalSampleBadge/.test(i18n))
  pass("canonicalSampleBadge key exists with honest sample label");
else fail("canonicalSampleBadge key exists with honest sample label", "Missing canonical sample badge i18n key.");

if (/canonicalContextNote.*完整偏好個人化|完整偏好個人化.*canonicalContextNote/.test(i18n))
  pass("canonicalContextNote key exists with personalization limitation text");
else fail("canonicalContextNote key exists with personalization limitation text", "Missing canonical context note i18n key.");

// Check only the nextMealPrototype section for forbidden claims — other i18n sections may legitimately have goal-related copy
const nextMealI18nMatch = i18n.match(/nextMealPrototype\s*:\s*\{([\s\S]*?)\},?\s*\n\s*(?:recommendation|social|\})/);
const nextMealI18nSection = nextMealI18nMatch ? nextMealI18nMatch[1] : i18n;
if (!/AI已根據你的完整飲食習慣|正式個人化推薦|已依你的每日營養目標|已完整考量預定餐點|已配合飲食限制/.test(nextMealI18nSection))
  pass("nextMealPrototype i18n section does not contain forbidden personalization claims");
else fail("nextMealPrototype i18n section does not contain forbidden personalization claims", "Must not claim full AI personalization in next-meal copy.");

const content = read("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");

if (/canonicalSampleBadge/.test(content))
  pass("NextMealPrototypeContent renders canonicalSampleBadge for non-u1_mock sources");
else fail("NextMealPrototypeContent renders canonicalSampleBadge for non-u1_mock sources", "Badge must be source-aware.");

if (/canonicalContextNote/.test(content))
  pass("NextMealPrototypeContent renders canonicalContextNote for canonical sources");
else fail("NextMealPrototypeContent renders canonicalContextNote for canonical sources", "Context note must be rendered for canonical sources.");

// ─── 11. U1 types widened ─────────────────────────────────────────────────────

const u1Types = read("apps/mobile/features/next-meal-prototype/types.ts");

if (/U1NextMealPresentationSource/.test(u1Types))
  pass("U1NextMealPresentationSource type is defined");
else fail("U1NextMealPresentationSource type is defined", "Presentation source type must be widened from literal.");

if (/canonical_mock/.test(u1Types) && /local_menu_demo/.test(u1Types))
  pass("U1NextMealPresentationSource includes canonical_mock and local_menu_demo");
else fail("U1NextMealPresentationSource includes canonical_mock and local_menu_demo", "Source union must cover canonical sources.");

if (!/source:\s*"u1_mock";/.test(u1Types))
  pass("U1 ViewModel source is no longer a literal \"u1_mock\" constraint");
else fail("U1 ViewModel source is no longer a literal \"u1_mock\" constraint", "Must widen source type away from literal.");

if (!/isSampleData:\s*true;/.test(u1Types))
  pass("U1 ViewModel isSampleData is no longer a literal true constraint");
else fail("U1 ViewModel isSampleData is no longer a literal true constraint", "Must widen isSampleData to boolean.");

// ─── 12. Phase 2Q files unchanged ────────────────────────────────────────────

const phase2qFiles = [
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/consumer-meals/featureFlags.ts",
  "apps/mobile/features/consumer-meals/factories.ts",
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/adapters/disabledConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts",
  "scripts/consumer-meal-records-phase-2q-guard.mjs",
  "scripts/consumer-meal-records-phase-2q-smoke.mjs"
];

for (const rel of phase2qFiles) {
  const diff = execFileSync("git", ["diff", "--name-only", "--", rel], { cwd: root, encoding: "utf8" }).trim();
  if (!diff) pass(`Phase 2Q file unchanged: ${rel}`);
  else fail(`Phase 2Q file unchanged: ${rel}`, "Phase 2Q canonical contract must not be modified.");
}

// ─── 13. Protected screen files unchanged ─────────────────────────────────────

const protectedScreens = [
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/index.tsx",
  "apps/mobile/app/meal-buddies.tsx"
];

for (const rel of protectedScreens) {
  const diff = execFileSync("git", ["diff", "--name-only", "--", rel], { cwd: root, encoding: "utf8" }).trim();
  if (!diff) pass(`protected screen file unchanged: ${rel}`);
  else fail(`protected screen file unchanged: ${rel}`, "This screen must not be modified in Phase 2R.");
}

// ─── 14. Migration count ──────────────────────────────────────────────────────

const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((n) => n.endsWith(".sql")).sort();
if (migrations.length === 21) pass("migration count remains at 21", { count: migrations.length });
else fail("migration count remains at 21", "Phase 2R must not add migrations.", { count: migrations.length });

// ─── 15. Phase 2S not started ─────────────────────────────────────────────────

const phase2sFiles = collectFiles(root, ".mjs")
  .concat(collectFiles(root, ".ts"))
  .filter((f) => /phase.?2s/i.test(path.basename(f)) || /phase2s/i.test(path.basename(f)));

if (!phase2sFiles.length) pass("Phase 2S not started (no phase-2s files found)");
else fail("Phase 2S not started (no phase-2s files found)", "Phase 2S must not begin before Phase 2R is committed.", { files: phase2sFiles.map((f) => path.relative(root, f)) });

// ─── 16. No source-tree generated JS ─────────────────────────────────────────

const untrackedJs = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", "*.js"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((f) => f && !f.startsWith("node_modules/") && !f.startsWith(".expo/"))
  .filter(Boolean);

if (!untrackedJs.length) pass("no untracked .js files in source tree");
else fail("no untracked .js files in source tree", "Generated JS must not exist in source tree.", { files: untrackedJs });

// ─── 17. No .tsbuildinfo modifications ────────────────────────────────────────

const tsbuildinfoDiff = execFileSync("git", ["diff", "--name-only", "--", "*.tsbuildinfo"], { cwd: root, encoding: "utf8" }).trim();
if (!tsbuildinfoDiff) pass("no .tsbuildinfo modifications");
else fail("no .tsbuildinfo modifications", "Smoke must not modify .tsbuildinfo files.", { files: tsbuildinfoDiff.split(/\r?\n/) });

// ─── Package.json scripts ──────────────────────────────────────────────────────

const pkg = read("package.json");
if (/test:consumer-phase2r/.test(pkg) && /test:consumer-phase2r-smoke/.test(pkg) && /test:consumer-phase2r-mock-smoke/.test(pkg))
  pass("package.json contains all three Phase 2R scripts");
else fail("package.json contains all three Phase 2R scripts", "Missing Phase 2R npm scripts.");

// ─── Documentation ────────────────────────────────────────────────────────────

const docPath = "docs/consumer-runtime-integration/phase-2r-canonical-provider-integration-and-u1-cutover.md";
if (fs.existsSync(path.join(root, docPath))) {
  pass(`required Phase 2R documentation exists: ${docPath}`);
  const doc = read(docPath);
  if (/sample|示範|demo/i.test(doc))
    pass("documentation explicitly describes data as sample/demo");
  else fail("documentation explicitly describes data as sample/demo", "Doc must be clear about demo data nature.");
  if (/mock.*5|5.*mock|5個.*mock|mock.*5個/i.test(doc) || /mock.*candidate.*5|5.*candidate.*mock/i.test(doc))
    pass("documentation records mock pool shortfall limitation");
  else fail("documentation records mock pool shortfall limitation", "Doc must honestly record that mock has 5 seeds < Premium 10.");
  if (/Phase 2S/i.test(doc))
    fail("documentation does not reference Phase 2S", "Doc must not reference next-phase implementation details.");
  else pass("documentation does not reference Phase 2S");
} else {
  fail(`required Phase 2R documentation exists: ${docPath}`, "Missing Phase 2R documentation file.");
}

// ─── Result ───────────────────────────────────────────────────────────────────

const result = {
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Runtime Integration Phase 2R Canonical Next Meal Provider Integration and U1 Cutover",
  totalChecks: checks.length,
  passedChecks: checks.filter((c) => c.pass).length,
  failedChecks: checks.filter((c) => !c.pass).length,
  checks,
  issues,
  migrationCount: migrations.length,
  phase2SStarted: false,
  databaseWriteUsed: false,
  productionTouched: false
};

console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);

function collectFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".expo" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, ext));
    if (entry.isFile() && entry.name.endsWith(ext)) files.push(full);
  }
  return files;
}
