// Validation-only exact SR-2G-E1 successor inventory. No prefix, glob or directory allowance.
//
// THIS ROUND SITS ON A TWO-COMMIT LOCAL STACK. The pushed authority is the frozen SR-2G-D freeze;
// on top of it sits one already-proven Development TOOLING commit, and on top of that the SR-2G-E1
// freeze. Every frozen predecessor guard asks the same question — "is everything since the pushed
// authority exactly an enumerated successor set?" — so the answer it is given must enumerate BOTH
// commits. That is why SR2GE1_SUCCESSOR_PATHS is the union: the tooling paths are absorbed into the
// successor framing rather than silenced, renamed or exempted.
import crypto from "node:crypto";

// The pushed authority every predecessor guard is rooted at.
export const SR2GE1_BASELINE = "0fcb7d9ea35ec28ea5f45eb14a05cf227a845d68";
export const SR2GE1_BASELINE_SUBJECT = "Establish SR-2G-D Meal Buddy candidate API";

// The local, already-frozen Development tooling predecessor. SR-2G-E1 must not amend, squash or
// re-author it; it is accepted as-is and absorbed.
export const SR2GE1_TOOLING_COMMIT = "c68bdd5f50840733ae5af653b4278413b5f80fe7";
export const SR2GE1_TOOLING_SUBJECT = "Add reusable Development Meal Buddy demo fixtures";
export const SR2GE1_TOOLING_PATHS = Object.freeze([
  "scripts/development/meal-buddy-demo-cleanup.mjs",
  "scripts/development/meal-buddy-demo-report.mjs",
  "scripts/development/meal-buddy-demo-seed.mjs"
]);

export const SR2GE1_SHARED_ROOT = "packages/shared/src/domain/meal-buddy-candidate";
export const SR2GE1_FEATURE_ROOT = "apps/mobile/features/meal-buddy-candidates";
export const SR2GE1_POLICY_VERSION = "meal-buddy-candidate-api-v1";
export const SR2GE1_CARD_LIST_FUNCTION = "meal-buddy-card-list";
export const SR2GE1_CANDIDATE_LIST_FUNCTION = "meal-buddy-candidate-list";
export const SR2GE1_PERSON_REF_PREFIX = "scr1.";
export const SR2GE1_CARD_REF_PREFIX = "mbc1.";
export const SR2GE1_COMPACT_VISIBLE = 3;
export const SR2GE1_PREMIUM_EXPOSURE = 10;
export const SR2GE1_FREE_EXPOSURE = 3;
export const SR2GE1_TIME_ZONE = "Asia/Taipei";
export const SR2GE1_CATALOG_LABEL_TABLE = "social_interest_catalog_label";

// The frozen SR-2E feature this round mirrors but must never modify.
export const SR2GE1_FROZEN_MOBILE_PATHS = Object.freeze([
  "apps/mobile/features/social-candidates/adapters/supabaseSocialCandidateRepository.ts",
  "apps/mobile/features/social-candidates/socialCandidateService.ts",
  "apps/mobile/features/social-candidates/types.ts",
  "packages/shared/src/domain/social-candidate/types.ts",
  "packages/shared/src/domain/social-candidate/validate.ts"
]);

// Mock and demo modules the real feature must never import.
export const SR2GE1_FORBIDDEN_MOCK_IMPORTS = Object.freeze([
  "mealBuddyCardMock", "mealBuddyFlowMock", "mealBuddySocialStore", "mealBuddyRanking",
  "mealBuddyCardStore", "mockSocialCandidateRepository", "socialDiscovery", "demoData"
]);

// Concepts that belong to SR-2G-E2 or later and must not appear in this data layer.
export const SR2GE1_FORBIDDEN_SCOPE_MARKERS = Object.freeze([
  "invite", "acceptMatch", "matchRequest", "chatThread", "seenHistory", "geolocation",
  "fullProfile", "profileDetail", "menuContext", "interestScore", "interestRank",
  "nextCursor", "pageToken", "refill"
]);

export const SR2GE1_SHARED_FILES = Object.freeze([
  `${SR2GE1_SHARED_ROOT}/index.ts`,
  `${SR2GE1_SHARED_ROOT}/types.ts`,
  `${SR2GE1_SHARED_ROOT}/validate.ts`
]);

export const SR2GE1_FEATURE_FILES = Object.freeze([
  `${SR2GE1_FEATURE_ROOT}/adapters/disabledMealBuddyRepositories.ts`,
  `${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddyCandidateRepository.ts`,
  `${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddyErrors.ts`,
  `${SR2GE1_FEATURE_ROOT}/adapters/supabaseMealBuddySourceCardRepository.ts`,
  `${SR2GE1_FEATURE_ROOT}/factories.ts`,
  `${SR2GE1_FEATURE_ROOT}/featureFlags.ts`,
  `${SR2GE1_FEATURE_ROOT}/index.ts`,
  `${SR2GE1_FEATURE_ROOT}/interestCatalog.ts`,
  `${SR2GE1_FEATURE_ROOT}/mealBuddyCandidateService.ts`,
  `${SR2GE1_FEATURE_ROOT}/ports.ts`,
  `${SR2GE1_FEATURE_ROOT}/runtimeBinding.ts`,
  `${SR2GE1_FEATURE_ROOT}/supabaseMealBuddyCandidateContracts.ts`,
  `${SR2GE1_FEATURE_ROOT}/taipeiDiningDate.ts`,
  `${SR2GE1_FEATURE_ROOT}/types.ts`
]);

// Exactly what the SR-2G-E1 freeze commit itself adds or modifies.
export const SR2GE1_OWN_PATHS = Object.freeze([
  "package.json",
  "packages/shared/src/domain/index.ts",
  ...SR2GE1_SHARED_FILES,
  ...SR2GE1_FEATURE_FILES,
  // The single frozen-predecessor byte this round corrects: the UTC-oriented effective day.
  "apps/mobile/features/demo-time/demoTimeStore.ts",
  "scripts/social-candidate-sr2g-e1-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e1-mutations.mjs",
  "scripts/social-candidate-sr2g-e1-smoke.mjs",
  "scripts/social-candidate-sr2g-e1-successor-manifest.mjs",
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

// The complete delta from the pushed authority: the absorbed tooling commit plus this round. This is
// the constant every frozen predecessor guard compares its "everything since origin" view against.
export const SR2GE1_SUCCESSOR_PATHS = Object.freeze(
  [...new Set([...SR2GE1_TOOLING_PATHS, ...SR2GE1_OWN_PATHS])].sort()
);

export function createSr2ge1CanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GE1_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GE1_SUCCESSOR_PATHS, entries: Object.freeze(entries), text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
const union = (left, right) => [...new Set([...left, ...right])].sort();

// Lifecycle over the two-commit stack. The tooling commit is a FIXED, known predecessor: its paths
// are folded in from the constant above rather than re-derived per guard, so no predecessor guard's
// own lifecycleState() helper has to learn about it.
export function classifySr2ge1Lifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  // Candidate: sitting on the tooling commit with this round's files still in the worktree.
  const candidate =
    state.head === SR2GE1_TOOLING_COMMIT && state.originHead === SR2GE1_BASELINE &&
    state.ahead === 1 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GE1_OWN_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GE1_TOOLING_COMMIT && state.headParent === SR2GE1_TOOLING_COMMIT &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GE1_OWN_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GE1_BASELINE && state.ahead === 2 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid", phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    // Always the COMPLETE delta from the pushed authority, so a predecessor guard comparing against
    // SR2GE1_SUCCESSOR_PATHS sees the tooling commit accounted for rather than unexplained.
    lifecycleManifest: Object.freeze(
      candidate ? union(worktreePaths, SR2GE1_TOOLING_PATHS) : union(headDeltaPaths, SR2GE1_TOOLING_PATHS)
    )
  });
}
