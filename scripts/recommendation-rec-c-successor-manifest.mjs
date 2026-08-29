import crypto from "node:crypto";

export const RECC_BASELINE = "60008abe387c5a5a792c0bf86676c7b1717d6f71";
export const RECC_COMMIT_SUBJECT = "Activate Allergy-aware recommendation eligibility";
export const RECC_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-c",
  "test:recommendation-rec-c-smoke",
  "test:recommendation-rec-c-mutations"
]);

export const RECC_PATHS = Object.freeze([
  "apps/mobile/features/consumer-meals/adapters/localMenuDemoConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRecommendationAllergyEvidenceReader.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/factories.ts",
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts",
  "docs/recommendation/rec-c-allergy-eligibility-activation.md",
  "package.json",
  "packages/shared/src/domain/candidate-allergen/allergyContentEligibility.ts",
  "packages/shared/src/domain/candidate-allergen/index.ts",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-recommendation-geo-1c-smoke.mjs",
  "scripts/geo-recommendation-geo-1c-successor-manifest.mjs",
  "scripts/recommendation-rec-a-smoke.mjs",
  "scripts/recommendation-rec-c-guard.mjs",
  "scripts/recommendation-rec-c-mutations.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-b-p0-guard.mjs",
  "scripts/recommendation-rec-b-p1-guard.mjs",
  "scripts/recommendation-rec-c-p0-guard.mjs",
  "scripts/recommendation-rec-c-p1-guard.mjs",
  "scripts/recommendation-rec-c-smoke.mjs",
  "scripts/recommendation-rec-c-successor-manifest.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyReccLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECC_BASELINE
    && input.originHead === RECC_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECC_PATHS);
  const frozenShape = input.parent === RECC_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECC_PATHS);
  const frozenLocal = frozenShape
    && input.originHead === RECC_BASELINE
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
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: candidate ? worktree : delta
  });
}

export function createReccManifest(readFile) {
  const entries = RECC_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
