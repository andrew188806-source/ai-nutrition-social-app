// Validation-only exact SR-1D successor inventory. No prefix, glob or directory allowance.
export const SR1D_SUCCESSOR_MIGRATION =
  "supabase/migrations/20260811020000_social_candidate_taste_sources.sql";

export const SR1D_BASELINE = "800490e14521c0fd277cf31a2dfc39f811a60332";

export const SR1D_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-ingress-sr1c-guard.mjs",
  "scripts/social-ingress-sr1c-mutations.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/social-taste-sr1d-mutations.mjs",
  "scripts/social-taste-sr1d-smoke.mjs",
  "scripts/social-taste-sr1d-successor-manifest.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs",
  "supabase/config.toml",
  "supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts",
  "supabase/functions/_shared/social-pair/index.ts",
  "supabase/functions/social-candidate-taste/config.ts",
  "supabase/functions/social-candidate-taste/errors.ts",
  "supabase/functions/social-candidate-taste/handler.ts",
  "supabase/functions/social-candidate-taste/index.ts",
  "supabase/functions/social-candidate-taste/tasteProvider.ts",
  SR1D_SUCCESSOR_MIGRATION
].sort());

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr1dLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const untrackedMigrationPaths = [...state.untrackedMigrationPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR1D_BASELINE &&
    state.originHead === SR1D_BASELINE &&
    state.ahead === 0 &&
    state.behind === 0 &&
    exactPathSet(worktreePaths, SR1D_SUCCESSOR_PATHS) &&
    stagedPaths.length === 0 &&
    exactPathSet(untrackedMigrationPaths, [SR1D_SUCCESSOR_MIGRATION]) &&
    state.migrationTrackedInHead === false;

  const frozenShape =
    state.head !== SR1D_BASELINE &&
    state.headParent === SR1D_BASELINE &&
    worktreePaths.length === 0 &&
    stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR1D_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D") &&
    state.migrationTrackedInHead === true;

  const frozenUnpushed =
    frozenShape &&
    state.originHead === SR1D_BASELINE &&
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
