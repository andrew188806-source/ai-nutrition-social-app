// Validation-only exact SR-2F successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2F_BASELINE = "574b1898c7e63af5b2fd57e20492f82da05d0e71";

// SR-2F is an app composition activation round: it adds no migration, no role, no grant, no RLS
// policy and no Edge Function change. The frozen SR-2D backend is consumed exactly as deployed and
// the frozen SR-2E feature is consumed exactly as built.
export const SR2F_SUCCESSOR_MIGRATION = null;

// The single application file this round is permitted to modify. SR-2F's entire runtime delta is
// two type/value imports plus one binding call inside the already-existing `supabase-live` branch.
export const SR2F_COMPOSITION = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";

// The frozen SR-2E seam SR-2F activates. SR-2F must bind through this module and no other.
export const SR2F_RUNTIME_BINDING = "apps/mobile/features/social-candidates/runtimeBinding.ts";

export const SR2F_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  SR2F_COMPOSITION,
  "scripts/social-candidate-sr2f-development-composition-smoke.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
  "scripts/social-candidate-sr2f-mutations.mjs",
  "scripts/social-candidate-sr2f-smoke.mjs",
  "scripts/social-candidate-sr2f-successor-manifest.mjs",
  // Validation-only successor awareness. Every predecessor guard delegates its lifecycle
  // classification to the newest round's classifier, so each must now name SR-2F's exact manifest.
  // No predecessor assertion is weakened; each simply excuses this round's enumerated set.
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2e-guard.mjs",
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

// The exact frozen SR-2E feature surface SR-2F must consume without editing a single byte. If any
// of these changed, "activation" would silently have become "re-implementation".
export const SR2F_FROZEN_FEATURE_PATHS = Object.freeze([
  "apps/mobile/app/social-candidates.tsx",
  "apps/mobile/features/social-candidates/SocialCandidateCard.tsx",
  "apps/mobile/features/social-candidates/adapters/disabledSocialCandidateRepository.ts",
  "apps/mobile/features/social-candidates/adapters/mockSocialCandidateRepository.ts",
  "apps/mobile/features/social-candidates/adapters/supabaseSocialCandidateRepository.ts",
  "apps/mobile/features/social-candidates/factories.ts",
  "apps/mobile/features/social-candidates/featureFlags.ts",
  "apps/mobile/features/social-candidates/index.ts",
  "apps/mobile/features/social-candidates/mascotAdapter.ts",
  "apps/mobile/features/social-candidates/ports.ts",
  SR2F_RUNTIME_BINDING,
  "apps/mobile/features/social-candidates/socialCandidateService.ts",
  "apps/mobile/features/social-candidates/supabaseSocialCandidateContracts.ts",
  "apps/mobile/features/social-candidates/types.ts",
  "packages/shared/src/domain/social-candidate/index.ts",
  "packages/shared/src/domain/social-candidate/types.ts",
  "packages/shared/src/domain/social-candidate/validate.ts"
].sort());

// Construction markers that would mean SR-2F built Social its own transport instead of handing it
// the one canonical live client. Each is a way the "one client, one auth port" invariant dies.
export const SR2F_FORBIDDEN_COMPOSITION_MARKERS = Object.freeze([
  "createClient(",
  "SupabaseSocialCandidateClientFactory",
  "createSocialCandidateClient",
  "createOfficialSupabaseSocialSdkLoader",
  "SocialCandidateAuthAdapter",
  "Authorization",
  "Bearer ",
  "apikey",
  "service_role",
  "SOCIAL_CANDIDATE_REF_KEY_V1"
]);

// Public runtime context keys SR-2F must never introduce. Exposing any of these would leak the
// live transport (or the actor) to every consumer of the runtime context.
export const SR2F_FORBIDDEN_CONTEXT_EXPORTS = Object.freeze([
  "authPort",
  "supabaseClient",
  "candidateClient",
  "socialCandidateRepository",
  "socialCandidateService"
]);

export function createSr2fCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");

  const entries = SR2F_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");

  return Object.freeze({
    paths: SR2F_SUCCESSOR_PATHS,
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

export function classifySr2fLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2F_BASELINE &&
    state.originHead === SR2F_BASELINE &&
    state.ahead === 0 &&
    state.behind === 0 &&
    exactPathSet(worktreePaths, SR2F_SUCCESSOR_PATHS) &&
    stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2F_BASELINE &&
    state.headParent === SR2F_BASELINE &&
    worktreePaths.length === 0 &&
    stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2F_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed =
    frozenShape &&
    state.originHead === SR2F_BASELINE &&
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
