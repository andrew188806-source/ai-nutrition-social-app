import crypto from "node:crypto";

export const RECD_BASELINE = "d5b66b0698dcf3ff4425be2615a1d3ea1607aca9";
export const RECD_COMMIT_SUBJECT = "Activate Ingredient Avoidance recommendation eligibility";
export const RECD_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-d",
  "test:recommendation-rec-d-smoke",
  "test:recommendation-rec-d-mutations"
]);

export const RECD_PATHS = Object.freeze([
  "apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRecommendationIngredientAvoidanceEvidenceReader.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/factories.ts",
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts",
  "docs/recommendation/rec-d-ingredient-avoidance-eligibility-activation.md",
  "package.json",
  "packages/shared/src/domain/candidate-ingredient-avoidance/index.ts",
  "packages/shared/src/domain/candidate-ingredient-avoidance/ingredientAvoidanceContentEligibility.ts",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-recommendation-geo-1c-smoke.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-a-smoke.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-c-guard.mjs",
  "scripts/recommendation-rec-c-p0-guard.mjs",
  "scripts/recommendation-rec-c-p1-guard.mjs",
  "scripts/recommendation-rec-c-smoke.mjs",
  "scripts/recommendation-rec-d-guard.mjs",
  "scripts/recommendation-rec-d-mutations.mjs",
  "scripts/recommendation-rec-d-p0-guard.mjs",
  "scripts/recommendation-rec-d-p1-guard.mjs",
  "scripts/recommendation-rec-d-smoke.mjs",
  "scripts/recommendation-rec-d-successor-manifest.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyRecdLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECD_BASELINE
    && input.originHead === RECD_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECD_PATHS);
  const frozenShape = input.parent === RECD_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECD_PATHS);
  const frozenLocal = frozenShape
    && input.originHead === RECD_BASELINE
    && input.behind === 0
    && input.ahead === 1;
  const frozenPushed = frozenShape
    && input.originHead === input.head
    && input.behind === 0
    && input.ahead === 0;
  const phase = candidate ? "candidate"
    : frozenLocal ? "frozen_local"
    : frozenPushed ? "frozen_pushed"
    : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase,
    manifest: candidate ? worktree : delta });
}

export function createRecdManifest(readFile) {
  const entries = RECD_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
