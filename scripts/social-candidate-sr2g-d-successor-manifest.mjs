// Validation-only exact SR-2G-D successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GD_BASELINE = "cfd38635cd33a40737c508e4473385f47347b103";
export const SR2GD_BASELINE_SUBJECT = "Add SR-2C-R1 public Social interest settings authority";

export const SR2GD_MIGRATION = "supabase/migrations/20260819010000_meal_buddy_candidate_card_restaurant_projection.sql";
export const SR2GD_API_ROOT = "supabase/functions/_shared/meal-buddy-candidate-api";
export const SR2GD_FUNCTION = "meal-buddy-candidate-list";
export const SR2GD_FUNCTION_ROOT = `supabase/functions/${SR2GD_FUNCTION}`;

export const SR2GD_POLICY_VERSION = "meal-buddy-candidate-api-v1";
export const SR2GD_REQUEST_KEY = "sourceCardRef";
export const SR2GD_PERSON_REF_PREFIX = "scr1.";
export const SR2GD_CARD_REF_PREFIX = "mbc1.";

// Frozen predecessor primitives this round composes and must never redefine.
export const SR2GD_POOL_FUNCTION = "social_internal.canonical_meal_buddy_candidate_cards";
export const SR2GD_BRIDGE_FUNCTION = "social_internal.meal_buddy_candidate_cards_with_restaurant";
export const SR2GD_INTEREST_FUNCTION = "social_internal.project_public_social_interests";
export const SR2GD_PROFILE_FUNCTION = "social_internal.project_exposed_social_profiles";
export const SR2GD_POOL_ROLE = "meal_buddy_candidate_pool_authority";
export const SR2GD_EXECUTOR_ROLE = "social_runtime_executor";

// The frozen SR-2B exposure caps and the frozen SR-2C-R1 compact-card limit. SR-2G-D restates them
// so a mutation that changes one fails here; it never owns them.
export const SR2GD_FREE_EXPOSURE = 3;
export const SR2GD_PREMIUM_EXPOSURE = 10;
export const SR2GD_COMPACT_VISIBLE = 3;

// The exact narrow restaurant privilege the bridge is allowed to hold.
export const SR2GD_RESTAURANT_COLUMNS = Object.freeze(["id", "name"]);
export const SR2GD_RESTAURANT_POLICY = "restaurants_meal_buddy_candidate_pool_read";

// Business-control keys that must never be expressible by a caller.
export const SR2GD_FORBIDDEN_REQUEST_KEYS = Object.freeze([
  "actorUserId", "sourceCardId", "ownerUserId", "candidateUserId", "candidateRef",
  "candidateCardRef", "limit", "page", "cursor", "tier", "entitlement", "isPremium",
  "clock", "authorityInstant", "diningDate", "mealPeriod", "restaurantId", "area",
  "interests", "interestFilters", "tasteWeights", "rankingWeights"
]);

// Anything that would leak internal identity, ranking state or billing facts into a response.
export const SR2GD_FORBIDDEN_RESPONSE_MARKERS = Object.freeze([
  "candidateUserId", "ownerUserId", "userId", "cardId", "profileId", "profile_id",
  "rankingState", "exposureIndex", "exposureOrdinal", "score", "similarity", "tasteScore",
  "entitlement", "entitlementClass", "isPremium", "planCode", "verified", "truncated"
]);

// Concepts that belong to later rounds and must not appear anywhere in this candidate.
export const SR2GD_FORBIDDEN_SCOPE_MARKERS = Object.freeze([
  "invite", "accept_match", "matchRequest", "chatThread", "seenHistory", "geolocation",
  "interestScore", "interestRank", "restaurantScore", "cardScore", "confidenceScore",
  "premiumBoost", "areaBoost", "refill", "nextCursor", "pageToken"
]);

// Frozen predecessor authority whose bytes this round must not touch.
export const SR2GD_FROZEN_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260811040000_social_public_profile_projection.sql",
  "supabase/migrations/20260817010000_meal_buddy_card_authority.sql",
  "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql",
  "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql",
  "supabase/migrations/20260817040000_meal_buddy_card_write_authority_membership_hygiene.sql",
  "supabase/migrations/20260817050000_meal_buddy_candidate_pool_authority_membership_hygiene.sql",
  "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql",
  "supabase/migrations/20260818020000_social_interest_catalog_v1_data.sql",
  "supabase/migrations/20260818030000_social_public_interest_projection.sql"
]);

export const SR2GD_FROZEN_MODULES = Object.freeze([
  "supabase/functions/_shared/social-interest/aggregate.ts",
  "supabase/functions/_shared/social-interest/index.ts",
  "supabase/functions/_shared/social-interest/types.ts",
  "supabase/functions/_shared/social-ranking/rankCandidates.ts",
  "supabase/functions/_shared/social-exposure/applySocialExposure.ts",
  "supabase/functions/_shared/social-exposure/policy.ts",
  "supabase/functions/_shared/social-profile/projectPublicProfiles.ts",
  "supabase/functions/_shared/social-profile/readProfileFacts.ts",
  "supabase/functions/_shared/social-candidate-ref/crypto.ts",
  "supabase/functions/_shared/social-candidate-ref/policy.ts",
  "supabase/functions/_shared/meal-buddy-card-ref/crypto.ts",
  "supabase/functions/_shared/meal-buddy-card-ref/policy.ts",
  "supabase/functions/_shared/social-candidate-api/composeCandidateList.ts",
  "supabase/functions/_shared/social-candidate-api/toCandidateDto.ts",
  "supabase/functions/social-candidate-list/handler.ts"
]);

export const SR2GD_API_FILES = Object.freeze([
  `${SR2GD_API_ROOT}/compose.ts`,
  `${SR2GD_API_ROOT}/policy.ts`,
  `${SR2GD_API_ROOT}/readCandidateCards.ts`,
  `${SR2GD_API_ROOT}/request.ts`,
  `${SR2GD_API_ROOT}/toCandidateDto.ts`,
  `${SR2GD_API_ROOT}/types.ts`
]);

export const SR2GD_FUNCTION_FILES = Object.freeze([
  `${SR2GD_FUNCTION_ROOT}/config.ts`,
  `${SR2GD_FUNCTION_ROOT}/errors.ts`,
  `${SR2GD_FUNCTION_ROOT}/handler.ts`,
  `${SR2GD_FUNCTION_ROOT}/index.ts`
]);

export const SR2GD_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "supabase/config.toml",
  SR2GD_MIGRATION,
  ...SR2GD_API_FILES,
  ...SR2GD_FUNCTION_FILES,
  "scripts/social-candidate-sr2g-d-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-d-mutations.mjs",
  "scripts/social-candidate-sr2g-d-smoke.mjs",
  "scripts/social-candidate-sr2g-d-successor-manifest.mjs",
  // Validation-only successor awareness.
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

// The exact membership posture every Social authority must still hold after the bridge migration:
// one supabase_admin row, admin option only. A postgres-granted row surviving the migration would be
// durable borrowed privilege.
export const SR2GD_EXPECTED_MEMBERSHIP = Object.freeze({
  rows: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false
});
export const SR2GD_MEMBERSHIP_ROLES = Object.freeze([
  "meal_buddy_candidate_pool_authority",
  "meal_buddy_card_write_authority",
  "social_authority",
  "social_pair_read_authority",
  "social_profile_projection_authority",
  "social_runtime_executor"
]);

// Frozen SR-2G-C / SR-2C-R1 runtime bodies. The bridge composes them and must move none of them.
export const SR2GD_FROZEN_BODY_MD5 = Object.freeze({
  canonical_meal_buddy_candidate_cards: "015a3fab13fe8b978b651928042d4020",
  authorized_candidates: "a906fb3694f694d9c3d4fdda1bbac4dd"
});

export function createSr2gdCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GD_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GD_SUCCESSOR_PATHS, entries: Object.freeze(entries), text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr2gdLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GD_BASELINE && state.originHead === SR2GD_BASELINE &&
    state.ahead === 0 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GD_SUCCESSOR_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GD_BASELINE && state.headParent === SR2GD_BASELINE &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GD_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GD_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid", phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
