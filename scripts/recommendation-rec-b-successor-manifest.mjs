import crypto from "node:crypto";

export const RECB_BASELINE = "3fc58df2c8c897aa48ac1e1739eeed48cec7e2a1";
export const RECB_COMMIT_SUBJECT = "Activate dual-lane Taste recommendations";
export const RECB_MIGRATIONS = Object.freeze([]);
export const RECB_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-b",
  "test:recommendation-rec-b-smoke",
  "test:recommendation-rec-b-mutations"
]);

export const RECB_PATHS = Object.freeze([
  "apps/mobile/app/recommendation.tsx",
  "apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRecommendationTasteReader.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/factories.ts",
  "apps/mobile/features/consumer-meals/index.ts",
  "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts",
  "apps/mobile/features/consumer-meals/recommendationCompositionPolicy.ts",
  "apps/mobile/features/consumer-meals/recommendationReasons.ts",
  "apps/mobile/features/consumer-meals/recommendationTasteRanking.ts",
  "apps/mobile/features/consumer-meals/tasteRankingPolicy.ts",
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts",
  "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeComposition.ts",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts",
  "apps/mobile/features/next-meal-prototype/mockNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/types.ts",
  "docs/recommendation/rec-b-dual-lane-taste-ranking.md",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/consumer-recommendation-feedback-phase-2y-e-ui-contract-smoke.mjs",
  "scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-smoke.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-recommendation-geo-1c-smoke.mjs",
  "scripts/geo-shared-authority-geo-1a-guard.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-a-mutations.mjs",
  "scripts/recommendation-rec-a-smoke.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-b-mutations.mjs",
  "scripts/recommendation-rec-b-p0-guard.mjs",
  "scripts/recommendation-rec-b-p1-guard.mjs",
  "scripts/recommendation-rec-b-smoke.mjs",
  "scripts/recommendation-rec-b-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyRecbLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECB_BASELINE && input.originHead === RECB_BASELINE
    && input.behind === 0 && input.ahead === 0 && input.stagedPaths.length === 0
    && !input.deleted && same(worktree, RECB_PATHS);
  const frozenShape = input.parent === RECB_BASELINE && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0 && !input.deleted && same(delta, RECB_PATHS);
  const frozenLocal = frozenShape && input.originHead === RECB_BASELINE
    && input.behind === 0 && input.ahead === 1;
  const frozenPushed = frozenShape && input.originHead === input.head
    && input.behind === 0 && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local" : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? worktree : delta });
}

export function createRecbManifest(readFile) {
  const entries = RECB_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
