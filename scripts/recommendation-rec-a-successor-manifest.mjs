import crypto from "node:crypto";

export const RECA_BASELINE = "5a0533028bc3e28481404234cc57dcdf2e58f830";
export const RECA_COMMIT_SUBJECT = "Activate gap-aware next-meal nutrition ranking";

export const RECA_PRODUCT_PATHS = Object.freeze([
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/recommendation.tsx",
  "apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/factories.ts",
  "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts",
  "apps/mobile/features/consumer-meals/nutritionRankingPolicy.ts",
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeComposition.ts",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts",
  "apps/mobile/features/next-meal-prototype/mockNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/types.ts",
  "apps/mobile/services/mobile-menu-item-service.ts"
]);

export const RECA_PREDECESSOR_VALIDATION_PATHS = Object.freeze([
  "scripts/consumer-meal-records-phase-2q-guard.mjs",
  "scripts/consumer-meal-records-phase-2q-smoke.mjs",
  "scripts/consumer-meal-records-phase-2r-guard.mjs",
  "scripts/consumer-meal-records-phase-2r-smoke.mjs",
  "scripts/consumer-public-restaurant-menu-phase-2u-smoke.mjs",
  "scripts/consumer-ux-u1-guard.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-recommendation-geo-1c-mutations.mjs",
  "scripts/geo-recommendation-geo-1c-smoke.mjs",
  "scripts/geo-shared-authority-geo-1a-guard.mjs"
]);

export const RECA_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-a",
  "test:recommendation-rec-a-smoke",
  "test:recommendation-rec-a-mutations"
]);

export const RECA_PATHS = Object.freeze([
  ...RECA_PRODUCT_PATHS,
  ...RECA_PREDECESSOR_VALIDATION_PATHS,
  "package.json",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-a-mutations.mjs",
  "scripts/recommendation-rec-a-smoke.mjs",
  "scripts/recommendation-rec-a-successor-manifest.mjs"
].sort());

const same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

export function classifyRecaLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  if (input.head === RECA_BASELINE && input.originHead === RECA_BASELINE
    && input.behind === 0 && input.ahead === 0 && input.stagedPaths.length === 0
    && !input.deleted && same(worktree, RECA_PATHS)) {
    return { valid: true, phase: "candidate", manifest: worktree };
  }
  if (input.parent === RECA_BASELINE && input.originHead === RECA_BASELINE
    && input.behind === 0 && input.ahead === 1 && input.worktreePaths.length === 0
    && input.stagedPaths.length === 0 && same(delta, RECA_PATHS)) {
    return { valid: true, phase: "frozen_local", manifest: delta };
  }
  return { valid: false, phase: "invalid", manifest: input.head === RECA_BASELINE ? worktree : delta };
}

export function createRecaManifest(readFile) {
  const entries = RECA_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return { entries, aggregateSha256 };
}
