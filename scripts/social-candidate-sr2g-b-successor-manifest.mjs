// Validation-only exact SR-2G-B successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GB_BASELINE = "4700b89fe1d23a039d431a70cb966bed2cbfae7c";

export const SR2GB_MIGRATION = "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql";
export const SR2GB_API_ROOT = "supabase/functions/_shared/meal-buddy-card-api";
export const SR2GB_FUNCTIONS = Object.freeze(["meal-buddy-card-create", "meal-buddy-card-list", "meal-buddy-card-cancel"]);

const API_FILES = Object.freeze(["compose.ts", "config.ts", "errors.ts", "index.ts", "policy.ts", "request.ts", "runtime.ts", "types.ts", "validate.ts"]);

export const SR2GB_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "supabase/config.toml",
  SR2GB_MIGRATION,
  ...API_FILES.map((file) => `${SR2GB_API_ROOT}/${file}`),
  ...SR2GB_FUNCTIONS.flatMap((name) => [
    `supabase/functions/${name}/handler.ts`,
    `supabase/functions/${name}/index.ts`
  ]),
  "scripts/social-candidate-sr2g-b-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-b-guard.mjs",
  "scripts/social-candidate-sr2g-b-mutations.mjs",
  "scripts/social-candidate-sr2g-b-smoke.mjs",
  "scripts/social-candidate-sr2g-b-successor-manifest.mjs",
  // Validation-only successor awareness. Every predecessor guard delegates lifecycle classification
  // to the newest round, and several pin the migration, config or Edge-function set, so each must
  // now name SR-2G-B's exact manifest. No predecessor assertion is weakened.
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2e-guard.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
  "scripts/social-candidate-sr2g-a-guard.mjs",
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

// The frozen product quota. Any deviation is a mutation this round must kill.
export const SR2GB_FREE_CAPS = Object.freeze({ general: 1, restaurant: 1 });
export const SR2GB_PREMIUM_CAPS = Object.freeze({ general: 3, restaurant: 2 });

// The frozen Asia/Taipei meal-occasion end schedule. late_night crosses midnight.
export const SR2GB_EXPIRY_SCHEDULE = Object.freeze({
  breakfast: "11:00",
  lunch: "15:00",
  dinner: "22:00",
  late_night: "02:00"
});

// Request fields a caller must never be able to supply.
export const SR2GB_FORBIDDEN_REQUEST_FIELDS = Object.freeze([
  "ownerUserId", "actorUserId", "userId", "cardId", "expiresAt", "createdAt", "cancelledAt",
  "status", "tier", "isPremium", "planCode", "entitlement", "quota", "limit", "cap", "rank", "score"
]);

// Values that must never appear in any client response.
export const SR2GB_FORBIDDEN_RESPONSE_MARKERS = Object.freeze([
  "owner_user_id", "ownerUserId", "profile_id", "profileId", "plan_code", "planCode",
  "entitlement", "isPremium", "is_premium", "rankScore", "rank_score", "matchReasons",
  "candidateCardRef", "candidateUserId"
]);

// Later-round authority that must not appear anywhere in this round.
export const SR2GB_FORBIDDEN_CANDIDATE_MARKERS = Object.freeze([
  "candidateCardRef",
  "meal-buddy-candidate-list",
  "canonical_candidate_pool",
  "authorized_candidates",
  "authorized_pair_sources",
  "rankSocialCandidates",
  "applySocialExposure",
  "project_exposed_social_profiles",
  "composeCandidateList"
]);

export function createSr2gbCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GB_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GB_SUCCESSOR_PATHS,
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

export function classifySr2gbLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GB_BASELINE &&
    state.originHead === SR2GB_BASELINE &&
    state.ahead === 0 &&
    state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GB_SUCCESSOR_PATHS) &&
    stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GB_BASELINE &&
    state.headParent === SR2GB_BASELINE &&
    worktreePaths.length === 0 &&
    stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GB_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GB_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;

  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid",
    phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
