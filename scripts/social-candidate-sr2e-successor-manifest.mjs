// Validation-only exact SR-2E successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2E_BASELINE = "a6357e94ad4a86764dbf741f4f49fab7808c13eb";

// SR-2E is a Mobile integration round: it adds no migration, no role, no grant, no RLS policy and
// no Edge Function change. The frozen SR-2D backend is consumed exactly as deployed.
export const SR2E_SUCCESSOR_MIGRATION = null;

export const SR2E_MOBILE_FEATURE_ROOT = "apps/mobile/features/social-candidates";
export const SR2E_SCREEN = "apps/mobile/app/social-candidates.tsx";
export const SR2E_SHARED_ROOT = "packages/shared/src/domain/social-candidate";

export const SR2E_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "lib/i18n/zh-TW.ts",
  "packages/shared/src/domain/index.ts",
  `${SR2E_SHARED_ROOT}/index.ts`,
  `${SR2E_SHARED_ROOT}/types.ts`,
  `${SR2E_SHARED_ROOT}/validate.ts`,
  SR2E_SCREEN,
  `${SR2E_MOBILE_FEATURE_ROOT}/SocialCandidateCard.tsx`,
  `${SR2E_MOBILE_FEATURE_ROOT}/adapters/disabledSocialCandidateRepository.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/adapters/mockSocialCandidateRepository.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/adapters/supabaseSocialCandidateRepository.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/factories.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/featureFlags.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/index.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/mascotAdapter.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/ports.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/runtimeBinding.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/socialCandidateService.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/supabaseSocialCandidateContracts.ts`,
  `${SR2E_MOBILE_FEATURE_ROOT}/types.ts`,
  "scripts/social-candidate-sr2e-contract-equivalence.mjs",
  "scripts/social-candidate-sr2e-guard.mjs",
  "scripts/social-candidate-sr2e-mutations.mjs",
  "scripts/social-candidate-sr2e-smoke.mjs",
  "scripts/social-candidate-sr2e-successor-manifest.mjs",
  "scripts/social-candidate-sr2e-development-mobile-smoke.mjs",
  // Validation-only successor awareness. SR-2E is the first round to touch apps/ and packages/, so
  // every predecessor guard that asserted those prefixes were untouched must now name this round's
  // exact manifest. No predecessor assertion is weakened; each simply excuses the enumerated set.
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
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

// The frozen demo authorities the real feature must never import. Keeping the Meal Buddy card,
// its client-side ranking, its mock candidates and its invite/chat action store completely
// disconnected is what stops a raw UUID, a fabricated score or a demo action from re-entering.
export const SR2E_FORBIDDEN_IMPORT_MARKERS = Object.freeze([
  "mealBuddyCardMock",
  "mealBuddyRanking",
  "mealBuddySocialStore",
  "mealBuddyFlowMock",
  "communityProfileDisplayResolver",
  "display-resolvers",
  "meal-buddy-card"
]);

export function createSr2eCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");

  const entries = SR2E_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");

  return Object.freeze({
    paths: SR2E_SUCCESSOR_PATHS,
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

export function classifySr2eLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2E_BASELINE &&
    state.originHead === SR2E_BASELINE &&
    state.ahead === 0 &&
    state.behind === 0 &&
    exactPathSet(worktreePaths, SR2E_SUCCESSOR_PATHS) &&
    stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2E_BASELINE &&
    state.headParent === SR2E_BASELINE &&
    worktreePaths.length === 0 &&
    stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2E_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed =
    frozenShape &&
    state.originHead === SR2E_BASELINE &&
    state.ahead === 1 &&
    state.behind === 0;

  const frozenPushed =
    frozenShape &&
    state.originHead === state.head &&
    state.ahead === 0 &&
    state.behind === 0;

  const phase = candidate
    ? "candidate"
    : frozenUnpushed
      ? "frozen_unpushed"
      : frozenPushed
        ? "frozen_pushed"
        : "invalid";

  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    candidate,
    frozenShape,
    frozenUnpushed,
    frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
