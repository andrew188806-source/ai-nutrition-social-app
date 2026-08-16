// Validation-only exact SR-2D successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2D_BASELINE = "84dd82989616bdff00709c1e995d706f6f77d1b7";

// SR-2D adds no migration at all: SR-1D, SR-2B and SR-2C already froze every privilege the
// composition needs, so the durable database delta for this phase is empty.
export const SR2D_SUCCESSOR_MIGRATION = null;

// SR-2D-R1 deployability bridge. The Supabase Edge bundler resolves specifiers literally, and the
// canonical Taste package uses extension-less directory imports, so any Edge graph reaching it fails
// to bundle. The generated flattened types artifact removes that resolution surface, and exactly one
// authorized type-only import specifier in frozen social-ranking/types.ts points at it.
export const SR2D_BRIDGE_GENERATOR = "scripts/build-social-taste-types-bridge.mjs";
export const SR2D_BRIDGE_ARTIFACT = "supabase/functions/_shared/social-taste-types/sharedTasteAdapterTypes.generated.ts";
export const SR2D_REPOINTED_FROZEN_FILE = "supabase/functions/_shared/social-ranking/types.ts";

export const SR2D_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "supabase/config.toml",
  SR2D_BRIDGE_GENERATOR,
  SR2D_BRIDGE_ARTIFACT,
  SR2D_REPOINTED_FROZEN_FILE,
  "scripts/social-candidate-sr2d-repoint-equivalence.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2d-mutations.mjs",
  "scripts/social-candidate-sr2d-smoke.mjs",
  "scripts/social-candidate-sr2d-successor-manifest.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-ingress-sr1c-guard.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  // SR-1D asserted its own config.toml registration with a lazy [\s\S]*? span that reaches past its
  // own TOML block. Adding a later [functions.*] section with verify_jwt = true let that assertion
  // satisfy itself from the NEXT block, so its "remove gateway JWT verification" mutant survived.
  // Repaired to the block-anchored [^[]*? form every other guard in this repository already uses.
  "scripts/social-taste-sr1d-mutations.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "supabase/functions/_shared/social-candidate-api/composeCandidateList.ts",
  "supabase/functions/_shared/social-candidate-api/index.ts",
  "supabase/functions/_shared/social-candidate-api/policy.ts",
  "supabase/functions/_shared/social-candidate-api/readCandidateTasteSources.ts",
  "supabase/functions/_shared/social-candidate-api/toCandidateDto.ts",
  "supabase/functions/_shared/social-candidate-api/types.ts",
  "supabase/functions/_shared/social-candidate-ref/crypto.ts",
  "supabase/functions/_shared/social-candidate-ref/index.ts",
  "supabase/functions/_shared/social-candidate-ref/policy.ts",
  "supabase/functions/_shared/social-candidate-ref/types.ts",
  "supabase/functions/social-candidate-list/config.ts",
  "supabase/functions/social-candidate-list/errors.ts",
  "supabase/functions/social-candidate-list/handler.ts",
  "supabase/functions/social-candidate-list/index.ts"
].sort());

export function createSr2dCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");

  const entries = SR2D_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");

  return Object.freeze({
    paths: SR2D_SUCCESSOR_PATHS,
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

export function classifySr2dLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2D_BASELINE &&
    state.originHead === SR2D_BASELINE &&
    state.ahead === 0 &&
    state.behind === 0 &&
    exactPathSet(worktreePaths, SR2D_SUCCESSOR_PATHS) &&
    stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2D_BASELINE &&
    state.headParent === SR2D_BASELINE &&
    worktreePaths.length === 0 &&
    stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2D_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed =
    frozenShape &&
    state.originHead === SR2D_BASELINE &&
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
