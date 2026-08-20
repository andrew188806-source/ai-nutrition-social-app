// Validation-only exact SR-2G-F successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GF_BASELINE = "cfa5c2709aae06569f282d17cea0d019b2439030";
export const SR2GF_BASELINE_SUBJECT = "Activate real Meal Buddy candidates in Mobile";

export const SR2GF_MIGRATION = "supabase/migrations/20260820010000_meal_buddy_food_context_authority.sql";
export const SR2GF_CONTEXT_ROOT = "supabase/functions/_shared/meal-buddy-context";
export const SR2GF_CANDIDATE_API_ROOT = "supabase/functions/_shared/meal-buddy-candidate-api";
export const SR2GF_CARD_API_ROOT = "supabase/functions/_shared/meal-buddy-card-api";
export const SR2GF_FEATURE_ROOT = "apps/mobile/features/meal-buddy-candidates";

// The one primitive SR-2G-F adds, and the frozen primitives it must compose rather than reproduce.
export const SR2GF_CONTEXT_PRIMITIVE = "canonical_meal_buddy_context_candidates";
export const SR2GF_FROZEN_POOL_PRIMITIVE = "meal_buddy_candidate_cards_with_restaurant";
export const SR2GF_FROZEN_CANDIDATE_PRIMITIVE = "canonical_meal_buddy_candidate_cards";

// The closed context vocabulary and its fixed bucket sequence.
export const SR2GF_CONTEXT_STATES = Object.freeze(["matched", "neutral", "unsupported"]);
export const SR2GF_CONTEXT_NAMESPACE = "food";

// Frozen bounds SR-2G-F restates but never changes.
export const SR2GF_POLICY_VERSION = "meal-buddy-candidate-api-v1";
export const SR2GF_RANKING_POLICY_VERSION = "social-ranking-v1";
export const SR2GF_FREE_EXPOSURE = 3;
export const SR2GF_PREMIUM_EXPOSURE = 10;
export const SR2GF_CARD_REF_PREFIX = "mbc1.";
export const SR2GF_TIME_ZONE = "Asia/Taipei";

// The three canonical contexts the decisive Development proof uses. They are catalog keys that
// SR-2C-R1 already seeded, never new vocabulary invented by this round.
export const SR2GF_PROOF_CONTEXTS = Object.freeze([
  "food.taiwanese_chinese.hotpot",
  "food.japanese.sushi",
  "food.japanese.ramen"
]);

// Health, restriction and nutrition concepts that must never appear in any SR-2G-F authority.
export const SR2GF_FORBIDDEN_HEALTH_EVIDENCE = Object.freeze([
  "allergen", "allergy", "restriction", "medical", "condition", "diagnosis",
  "health_goal", "healthGoal", "nutrition_goal", "nutritionGoal", "dietary_restriction",
  "meal_analyses", "menu_item_nutrition", "consumer_goals"
]);

// Scoring vocabulary that must never enter the context layer: a float here would immediately invite
// blending with the frozen SR-2A Taste score.
export const SR2GF_FORBIDDEN_SCORE_MARKERS = Object.freeze([
  "contextScore", "matchScore", "jaccard", "weightedScore", "contextWeight",
  "foodScore", "similarityScore", "boost", "matchReasons"
]);

// Concepts belonging to later phases.
export const SR2GF_FORBIDDEN_SCOPE_MARKERS = Object.freeze([
  "fullProfile", "personalProfile", "acceptMatch", "matchRequest", "inviteRequest",
  "chatThread", "seenHistory", "geolocation", "nextCursor", "pageToken", "refill"
]);

// Frozen predecessor migrations. Not one byte of any of these may change in this round.
export const SR2GF_FROZEN_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260817010000_meal_buddy_card_authority.sql",
  "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql",
  "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql",
  "supabase/migrations/20260817040000_meal_buddy_card_write_authority_membership_hygiene.sql",
  "supabase/migrations/20260817050000_meal_buddy_candidate_pool_authority_membership_hygiene.sql",
  "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql",
  "supabase/migrations/20260818020000_social_interest_catalog_v1_data.sql",
  "supabase/migrations/20260818030000_social_public_interest_projection.sql",
  "supabase/migrations/20260819010000_meal_buddy_candidate_card_restaurant_projection.sql",
  "supabase/migrations/20260811010000_social_canonical_candidate_pool.sql",
  "supabase/migrations/20260811030000_social_exposure_entitlement_authenticated_read.sql",
  "supabase/migrations/20260811040000_social_public_profile_projection.sql"
]);

// Frozen ranking and exposure sources. SR-2G-F composes them and must not edit them.
export const SR2GF_FROZEN_AUTHORITY_PATHS = Object.freeze([
  "supabase/functions/_shared/social-ranking/rankCandidates.ts",
  "supabase/functions/_shared/social-ranking/policy.ts",
  "supabase/functions/_shared/social-ranking/types.ts",
  "supabase/functions/_shared/social-exposure/applySocialExposure.ts",
  "supabase/functions/_shared/social-exposure/policy.ts",
  "supabase/functions/_shared/social-exposure/resolveEntitlement.ts",
  "supabase/functions/_shared/social-profile/projectPublicProfiles.ts",
  "supabase/functions/_shared/social-interest/aggregate.ts",
  `${SR2GF_CANDIDATE_API_ROOT}/policy.ts`,
  `${SR2GF_CANDIDATE_API_ROOT}/request.ts`,
  `${SR2GF_CANDIDATE_API_ROOT}/toCandidateDto.ts`
]);

export const SR2GF_CONTEXT_FILES = Object.freeze([
  `${SR2GF_CONTEXT_ROOT}/composeContextRanking.ts`,
  `${SR2GF_CONTEXT_ROOT}/index.ts`,
  `${SR2GF_CONTEXT_ROOT}/policy.ts`,
  `${SR2GF_CONTEXT_ROOT}/types.ts`
]);

export const SR2GF_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  SR2GF_MIGRATION,
  ...SR2GF_CONTEXT_FILES,
  // Composition seams only: each of these gains the context stage or the optional context field.
  `${SR2GF_CANDIDATE_API_ROOT}/compose.ts`,
  `${SR2GF_CANDIDATE_API_ROOT}/readCandidateCards.ts`,
  `${SR2GF_CANDIDATE_API_ROOT}/types.ts`,
  `${SR2GF_CARD_API_ROOT}/compose.ts`,
  `${SR2GF_CARD_API_ROOT}/runtime.ts`,
  `${SR2GF_CARD_API_ROOT}/types.ts`,
  `${SR2GF_CARD_API_ROOT}/validate.ts`,
  "supabase/functions/meal-buddy-card-create/handler.ts",
  // Mobile: the owner's own context is displayed on their own card and nothing else changes.
  `${SR2GF_FEATURE_ROOT}/MealBuddyRealSourceCardPicker.tsx`,
  `${SR2GF_FEATURE_ROOT}/adapters/supabaseMealBuddySourceCardRepository.ts`,
  `${SR2GF_FEATURE_ROOT}/types.ts`,
  // Development fixture tooling, extended to express the context matrix.
  "scripts/development/meal-buddy-demo-seed.mjs",
  "scripts/social-candidate-sr2g-f-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-f-mutations.mjs",
  "scripts/social-candidate-sr2g-f-smoke.mjs",
  "scripts/social-candidate-sr2g-f-successor-manifest.mjs",
  // Validation-only successor awareness. The three non-guard suites are here because they execute
  // the real composition: SR-2G-D's smoke drives the pipeline the context stage now sits inside, and
  // SR-2G-B's suites assert the owned-card DTO shape and the create-body key rule. Their SEMANTICS
  // are unchanged; only the seam names and the expected key sets move.
  "scripts/social-candidate-sr2g-b-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-b-mutations.mjs",
  "scripts/social-candidate-sr2g-b-smoke.mjs",
  "scripts/social-candidate-sr2g-d-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-d-smoke.mjs",
  "scripts/social-candidate-sr2g-e1-development-acceptance.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2e-guard.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
  "scripts/social-candidate-sr2g-a-guard.mjs",
  "scripts/social-candidate-sr2g-b-guard.mjs",
  "scripts/social-candidate-sr2g-b-r1-guard.mjs",
  "scripts/social-candidate-sr2g-c-guard.mjs",
  "scripts/social-candidate-sr2g-c-r1-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-ingress-sr1c-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
].sort());

export function createSr2gfCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GF_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GF_SUCCESSOR_PATHS, entries: Object.freeze(entries), text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr2gfLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GF_BASELINE && state.originHead === SR2GF_BASELINE &&
    state.ahead === 0 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GF_SUCCESSOR_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GF_BASELINE && state.headParent === SR2GF_BASELINE &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GF_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GF_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid", phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
