// Validation-only exact SR-2G-E2 successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GE2_BASELINE = "7b70a5e8f9bdb1156aca5a05b7202aa54dfcf2fc";
export const SR2GE2_BASELINE_SUBJECT = "Establish SR-2G-E1 Mobile Meal Buddy data layer";

export const SR2GE2_FEATURE_ROOT = "apps/mobile/features/meal-buddy-candidates";
export const SR2GE2_SCREEN = "apps/mobile/app/meal-buddies.tsx";
export const SR2GE2_POLICY_VERSION = "meal-buddy-candidate-api-v1";
export const SR2GE2_CARD_REF_PREFIX = "mbc1.";
export const SR2GE2_PERSON_REF_PREFIX = "scr1.";
export const SR2GE2_COMPACT_VISIBLE = 3;
export const SR2GE2_FREE_EXPOSURE = 3;
export const SR2GE2_PREMIUM_EXPOSURE = 10;
export const SR2GE2_TIME_ZONE = "Asia/Taipei";

// The exact mock candidate authority that must be unreachable from authenticated real mode.
export const SR2GE2_MOCK_CANDIDATE_AUTHORITY = Object.freeze([
  "getMealBuddyCandidates",
  "rankMealBuddyRecommendations",
  "drawMatchedMealBuddyCandidates"
]);

// Fields a real-mode source identity must NEVER be derived from. The demo card carries no meal
// period at all, which is why matching on any of these would silently pick somebody else's occasion.
export const SR2GE2_FORBIDDEN_SOURCE_DERIVATIONS = Object.freeze([
  "diningDate", "cardType", "restaurantId", "preferredTime", "mealTime"
]);

// Concepts belonging to later phases.
export const SR2GE2_FORBIDDEN_SCOPE_MARKERS = Object.freeze([
  "fullProfile", "profileDetail", "personalProfile", "acceptMatch", "matchRequest",
  "chatThread", "seenHistory", "geolocation", "menuContext", "dishContext",
  "interestScore", "interestRank", "nextCursor", "pageToken", "refill"
]);

// Frozen SR-2G-E1 data-layer files this round must not rewrite.
export const SR2GE2_FROZEN_E1_PATHS = Object.freeze([
  `${SR2GE2_FEATURE_ROOT}/adapters/supabaseMealBuddyCandidateRepository.ts`,
  `${SR2GE2_FEATURE_ROOT}/adapters/supabaseMealBuddySourceCardRepository.ts`,
  `${SR2GE2_FEATURE_ROOT}/adapters/supabaseMealBuddyErrors.ts`,
  `${SR2GE2_FEATURE_ROOT}/adapters/disabledMealBuddyRepositories.ts`,
  `${SR2GE2_FEATURE_ROOT}/interestCatalog.ts`,
  `${SR2GE2_FEATURE_ROOT}/mealBuddyCandidateService.ts`,
  `${SR2GE2_FEATURE_ROOT}/ports.ts`,
  `${SR2GE2_FEATURE_ROOT}/supabaseMealBuddyCandidateContracts.ts`,
  `${SR2GE2_FEATURE_ROOT}/taipeiDiningDate.ts`,
  `${SR2GE2_FEATURE_ROOT}/types.ts`,
  "packages/shared/src/domain/meal-buddy-candidate/types.ts",
  "packages/shared/src/domain/meal-buddy-candidate/validate.ts",
  "packages/shared/src/domain/meal-buddy-candidate/index.ts",
  "apps/mobile/features/demo-time/demoTimeStore.ts"
]);

export const SR2GE2_SCREEN_FILES = Object.freeze([
  `${SR2GE2_FEATURE_ROOT}/MealBuddyCandidateCard.tsx`,
  `${SR2GE2_FEATURE_ROOT}/MealBuddyRealCandidateSection.tsx`,
  `${SR2GE2_FEATURE_ROOT}/MealBuddyRealSourceCardPicker.tsx`,
  `${SR2GE2_FEATURE_ROOT}/useMealBuddyRealCandidates.ts`
]);

export const SR2GE2_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  SR2GE2_SCREEN,
  ...SR2GE2_SCREEN_FILES,
  // Additive only: the optional catalog-client slot. The E1 barrel is NOT here — it is the frozen
  // render-free data layer, so the screen imports the E2 modules directly instead of widening it.
  `${SR2GE2_FEATURE_ROOT}/factories.ts`,
  "scripts/social-candidate-sr2g-e2-development-mobile-smoke.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-e2-mutations.mjs",
  "scripts/social-candidate-sr2g-e2-smoke.mjs",
  "scripts/social-candidate-sr2g-e2-successor-manifest.mjs",
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
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
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

export function createSr2ge2CanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GE2_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GE2_SUCCESSOR_PATHS, entries: Object.freeze(entries), text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr2ge2Lifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GE2_BASELINE && state.originHead === SR2GE2_BASELINE &&
    state.ahead === 0 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GE2_SUCCESSOR_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GE2_BASELINE && state.headParent === SR2GE2_BASELINE &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GE2_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GE2_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid", phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
