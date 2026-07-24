#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseline = "ddcc83721b21faa3ea01c233b35ae118c1bf7f20";
const protectedPath =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const productionPaths = [
  "apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts",
  "apps/mobile/app/analysis.tsx",
  "lib/i18n/zh-TW.ts"
];
const scriptPaths = [
  "scripts/meal-identification-mi-d-b-guard.mjs",
  "scripts/meal-identification-mi-d-b-contract-smoke.mjs"
];
const allowed = new Set([...productionPaths, ...scriptPaths, "package.json", protectedPath]);
const frozenPaths = [
  "docs/meal-identification-mi-d-a-ui-integration-plan.md",
  "scripts/meal-identification-mi-d-a-guard.mjs",
  "apps/mobile/features/meal-identification",
  "apps/mobile/features/meal-identification-finalization",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "scripts/meal-identification-mi-c-a-guard.mjs",
  "scripts/meal-identification-mi-c-a-contract-smoke.mjs",
  "scripts/meal-identification-mi-c-b-guard.mjs",
  "scripts/meal-identification-mi-c-b-contract-smoke.mjs",
  "scripts/meal-identification-mi-c-d-guard.mjs",
  "scripts/meal-identification-mi-c-d-contract-smoke.mjs",
  "supabase/migrations"
];
const checks = [];

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
function check(name, condition) {
  const pass = Boolean(condition);
  checks.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const adapter = read(productionPaths[0]);
const screen = read(productionPaths[1]);
const i18n = read(productionPaths[2]);
const packageJson = JSON.parse(read("package.json"));
const changed = new Set([
  ...git("diff", "--name-only").split("\n").filter(Boolean),
  ...git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean)
]);
const productionDiff = git("diff", "--", ...productionPaths);

check("branch remains main", git("branch", "--show-current") === "main");
check("HEAD remains MI-D-A frozen authority", git("rev-parse", "HEAD") === baseline);
check("staged diff is empty", git("diff", "--cached", "--name-only") === "");
check("candidate contains only MI-D-B manifest paths", [...changed].every((item) => allowed.has(item)));
check("protected migration is the only unrelated untracked path",
  [...changed].filter((item) => !allowed.has(item) || item === protectedPath).every((item) => item === protectedPath));
check("MI-D-A and all MI-C frozen paths remain byte-identical",
  frozenPaths.every((item) => git("diff", "--quiet", baseline, "--", item) === ""));
check("no migration is added or modified",
  [...changed].filter((item) => item.startsWith("supabase/migrations/")).every((item) => item === protectedPath));
check("analysis screen calls canonical MI-C-D public runtime",
  screen.includes("consumerRuntime.finalizeMealIdentification(adapted.value)"));
check("analysis retry calls canonical pending finalization retry",
  screen.includes("consumerRuntime.retryPendingMealIdentificationFinalization()"));
check("legacy primary final write and retry calls are absent",
  !/consumerRuntime\.(?:createMealRecord|retryPendingMealRecord)\s*\(/.test(screen));
check("UI contains no direct Supabase RPC or table write",
  !/supabase|\.rpc\s*\(|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/i.test(
    git("diff", "--", productionPaths[0], productionPaths[1])
  ));
check("UI and adapter send no ownership field", !/\buser_id\b|\bp_user_id\b/.test(adapter + screen));
check("adapter delegates exclusively to frozen finalization builder",
  adapter.includes("buildMealIdentificationFinalization") &&
  adapter.includes("MEAL_IDENTIFICATION_FINALIZATION_VERSION") &&
  !/finalize_current_user_meal_identification_v1|p_finalization|clientRequestId/.test(adapter));
check("confirmed Catalog candidate is passed verbatim without repair",
  /candidate: input\.selectedCandidate/.test(adapter) &&
  !/repair|guess|fallbackIdentity|defaultIdentity/i.test(adapter));
check("unresolved candidate is passed through frozen union",
  /kind: "personal_unresolved_selection"[\s\S]*candidate: input\.selectedCandidate/.test(adapter));
check("available analysis uses no fabricated model or confidence",
  /status: "available"[\s\S]*model: null[\s\S]*confidence: null/.test(adapter));
check("unavailable analysis claims no evidence",
  /status: "unavailable"[\s\S]*detectedItemNames: \[\][\s\S]*model: null[\s\S]*photoReferences: \[\][\s\S]*estimatedNutrition: null[\s\S]*confidence: null[\s\S]*analyzedAt: null/.test(adapter));
check("corrections preserve object insertion order and leave ordinal to frozen builder",
  /Object\.keys\(input\.correctedRows\)[\s\S]*\.filter[\s\S]*\.map/.test(adapter) &&
  !/ordinal\s*:/.test(adapter));
check("double submit has synchronous invocation guard",
  /finalizationInvocationRef\.current[\s\S]*status === "submitting"/.test(screen));
check("same UI intent keeps a stable observed timestamp",
  /const \[analysisObservedAt\] = useState\(\(\) => new Date\(\)\.toISOString\(\)\)/.test(screen) &&
  /observedAt: analysisObservedAt/.test(screen));
check("primary completed action is disabled while finalizing",
  /onPress=\{finalizing \? undefined : onOpenMealLog\}/.test(screen) &&
  /function renderSuccessActions\(\) \{[\s\S]*status === "submitting"[\s\S]*return null;/.test(screen));
check("same-intent uncertain retry uses frozen runtime retry",
  /status === "uncertain"[\s\S]*retryPendingMealIdentificationFinalization/.test(screen));
check("idempotency conflict blocks unchanged payload from minting a new intent",
  /conflictFingerprintRef\.current === fingerprint[\s\S]*finalization_idempotency_conflict/.test(screen));
check("success requires all stable IDs before navigation",
  ["mealRecordId", "mealRecordItemId", "mealAnalysisId", "mealIdentificationFinalizationId", "mealCorrectionIds"]
    .every((token) => screen.includes(`!result.${token}`)) &&
  /router\.push\("\/today-intake"\)/.test(screen));
check("typed UI mapping is safe and exhaustive by category",
  ["authentication", "invalid", "catalog", "invariant", "conflict", "authorization", "generic"]
    .every((token) => adapter.includes(`\"${token}\"`) && i18n.includes(`${token}: {`)));
check("UI copy contains no raw SQL database stack credential or schema leakage",
  !/SQLSTATE|SELECT |INSERT |UPDATE |DELETE |stack trace|credential|schema/i.test(
    i18n.slice(i18n.indexOf("mealIdentificationFinalization:"), i18n.indexOf("mealPhotoTitle:"))
  ));
check("production diff contains no GPS alias Food Memory or candidate-search scope",
  !/expo-location|geolocation|\bgps\b|food.?memory|alias|candidate.?search/i.test(productionDiff));
check("MI-D-B guard package wiring is exact",
  packageJson.scripts["test:meal-identification-mi-d-b"] === "node scripts/meal-identification-mi-d-b-guard.mjs");
check("MI-D-B smoke package wiring is exact",
  packageJson.scripts["test:meal-identification-mi-d-b-smoke"] === "node scripts/meal-identification-mi-d-b-contract-smoke.mjs");
check("guard is read-only and creates no artifact",
  !/writeFile|mkdir|mkdtemp|rmSync|unlink|rename|copyFile/.test(
    read(scriptPaths[0]).slice(
      0,
      read(scriptPaths[0]).indexOf('check("guard is read-only')
    )
  ));

const passed = checks.filter(Boolean).length;
console.log(`RESULT ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
