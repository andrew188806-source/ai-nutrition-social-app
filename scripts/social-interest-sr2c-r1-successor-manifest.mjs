// Validation-only exact SR-2C-R1 successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2CR1_BASELINE = "5ce718b2eabc23ed908c2b5feeb17cadb244c929";

export const SR2CR1_SCHEMA_MIGRATION = "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql";
export const SR2CR1_DATA_MIGRATION = "supabase/migrations/20260818020000_social_interest_catalog_v1_data.sql";
export const SR2CR1_PROJECTION_MIGRATION = "supabase/migrations/20260818030000_social_public_interest_projection.sql";
export const SR2CR1_MIGRATIONS = Object.freeze([
  SR2CR1_SCHEMA_MIGRATION, SR2CR1_DATA_MIGRATION, SR2CR1_PROJECTION_MIGRATION
]);

export const SR2CR1_MODULE_ROOT = "supabase/functions/_shared/social-interest";
export const SR2CR1_CATALOG_TABLE = "public.social_interest_catalog";
export const SR2CR1_SELECTION_TABLE = "public.social_profile_interest_selection";
export const SR2CR1_WRITE_FUNCTION = "public.replace_authenticated_social_interests";
export const SR2CR1_PROJECTION_FUNCTION = "social_internal.project_public_social_interests";

export const SR2CR1_MAX_GENERAL = 8;
export const SR2CR1_MAX_FOOD = 5;
export const SR2CR1_COMPACT_VISIBLE = 3;

// The frozen V1 taxonomy shape: eight top categories per namespace, none of them selectable.
export const SR2CR1_GENERAL_CATEGORIES = Object.freeze([
  "entertainment", "gaming", "fitness_sports", "travel_outdoors",
  "music", "creative", "learning_culture", "lifestyle_social"
]);
export const SR2CR1_FOOD_CATEGORIES = Object.freeze([
  "taiwanese_chinese", "japanese", "korean", "western",
  "international", "dessert_drinks", "dining_style", "ingredient_style"
]);

// Frozen predecessor authority whose bytes this round must not touch.
export const SR2CR1_FROZEN_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260811040000_social_public_profile_projection.sql",
  "supabase/migrations/20260817010000_meal_buddy_card_authority.sql",
  "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql",
  "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql",
  "supabase/migrations/20260817040000_meal_buddy_card_write_authority_membership_hygiene.sql",
  "supabase/migrations/20260817050000_meal_buddy_candidate_pool_authority_membership_hygiene.sql"
]);

// Anything that would turn presentation data into ranking, eligibility, inference or health data.
export const SR2CR1_FORBIDDEN_MARKERS = Object.freeze([
  "rankSocialCandidates", "applySocialExposure", "rank_score", "similarity", "jaccard", "cosine",
  "cold_start", "taste_profiles", "preferred_cuisine_tags", "meal_records", "favorite_restaurants",
  "dietary_restriction", "allergy", "allergen", "nutrition_goal", "health_notes",
  "interest_snapshot", "interestAtCardCreation", "cardInterestOverride",
  "meal-buddy-candidate-list", "sr2g-d"
]);

export const SR2CR1_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  ...SR2CR1_MIGRATIONS,
  `${SR2CR1_MODULE_ROOT}/aggregate.ts`,
  `${SR2CR1_MODULE_ROOT}/index.ts`,
  `${SR2CR1_MODULE_ROOT}/types.ts`,
  "scripts/social-interest-sr2c-r1-development-acceptance.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2c-r1-mutations.mjs",
  "scripts/social-interest-sr2c-r1-smoke.mjs",
  "scripts/social-interest-sr2c-r1-successor-manifest.mjs",
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
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
].sort());

export function createSr2cr1CanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2CR1_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2CR1_SUCCESSOR_PATHS, entries: Object.freeze(entries), text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr2cr1Lifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2CR1_BASELINE && state.originHead === SR2CR1_BASELINE &&
    state.ahead === 0 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2CR1_SUCCESSOR_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2CR1_BASELINE && state.headParent === SR2CR1_BASELINE &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2CR1_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2CR1_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid", phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
