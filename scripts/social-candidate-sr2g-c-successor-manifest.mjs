// Validation-only exact SR-2G-C successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GC_BASELINE = "4bc87a3f2204a808339e0ba78d5e84f49c679863";

export const SR2GC_MIGRATION = "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql";
export const SR2GC_POOL_FUNCTION = "social_internal.canonical_meal_buddy_candidate_cards";
export const SR2GC_POOL_ROLE = "meal_buddy_candidate_pool_authority";

export const SR2GC_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  SR2GC_MIGRATION,
  "scripts/social-candidate-sr2g-c-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-c-guard.mjs",
  "scripts/social-candidate-sr2g-c-mutations.mjs",
  "scripts/social-candidate-sr2g-c-smoke.mjs",
  "scripts/social-candidate-sr2g-c-successor-manifest.mjs",
  // Validation-only successor awareness. Every predecessor guard delegates lifecycle classification
  // to the newest round, and several pin the migration set, so each must name SR-2G-C's exact
  // manifest. No predecessor assertion is weakened.
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2e-guard.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
  "scripts/social-candidate-sr2g-a-guard.mjs",
  "scripts/social-candidate-sr2g-b-guard.mjs",
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

// The frozen baseline posture of the postgres -> social_authority membership. Any residual
// postgres-granted row, any inherit_option, or any set_option is a failure.
export const SR2GC_MEMBERSHIP_BASELINE = Object.freeze({
  rows: 1,
  grantor: "supabase_admin",
  adminOption: true,
  inheritOption: false,
  setOption: false
});

// Fields that are hard eligibility, and fields that must never become hard eligibility.
export const SR2GC_HARD_FIELDS = Object.freeze(["dining_date", "meal_period", "restaurant_id"]);
export const SR2GC_NON_HARD_FIELDS = Object.freeze([
  "area", "preferred_time", "intention_type", "food_category", "menu_item_id", "nutrition_goal"
]);

// Later-round authority that must not appear in this phase.
export const SR2GC_FORBIDDEN_MARKERS = Object.freeze([
  "rankSocialCandidates",
  "applySocialExposure",
  "projectPublicSocialProfiles",
  "project_exposed_social_profiles",
  "candidateCardRef",
  "meal-buddy-candidate-list",
  "SOCIAL_EXPOSURE_FREE_CAP",
  "SOCIAL_EXPOSURE_PREMIUM_CAP"
]);

export function createSr2gcCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GC_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GC_SUCCESSOR_PATHS,
    entries: Object.freeze(entries),
    text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr2gcLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GC_BASELINE && state.originHead === SR2GC_BASELINE &&
    state.ahead === 0 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GC_SUCCESSOR_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GC_BASELINE && state.headParent === SR2GC_BASELINE &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GC_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GC_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid",
    phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
