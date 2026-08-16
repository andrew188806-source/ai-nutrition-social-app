// Validation-only exact SR-2G-A successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GA_BASELINE = "c016fb780bf15bcb001ddedd89c134bec229a337";

// SR-2G-A is the first round since SR-2C to add a migration, and it is irreversible. Exactly one.
export const SR2GA_MIGRATION = "supabase/migrations/20260817010000_meal_buddy_card_authority.sql";

export const SR2GA_TABLE = "public.meal_buddy_cards";
export const SR2GA_REF_ROOT = "supabase/functions/_shared/meal-buddy-card-ref";

export const SR2GA_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  SR2GA_MIGRATION,
  `${SR2GA_REF_ROOT}/crypto.ts`,
  `${SR2GA_REF_ROOT}/index.ts`,
  `${SR2GA_REF_ROOT}/policy.ts`,
  `${SR2GA_REF_ROOT}/types.ts`,
  "scripts/social-candidate-sr2g-a-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-a-guard.mjs",
  "scripts/social-candidate-sr2g-a-mutations.mjs",
  "scripts/social-candidate-sr2g-a-smoke.mjs",
  "scripts/social-candidate-sr2g-a-successor-manifest.mjs",
  // Validation-only successor awareness. Every predecessor guard delegates its lifecycle
  // classification to the newest round's classifier, and several pin the migration set, so each
  // must now name SR-2G-A's exact manifest. No predecessor assertion is weakened.
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-sr2d-guard.mjs",
  "scripts/social-candidate-sr2e-guard.mjs",
  "scripts/social-candidate-sr2f-guard.mjs",
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

// The exact column set. A column absent here is a column SR-2G-A refuses to persist.
export const SR2GA_COLUMNS = Object.freeze([
  "area", "cancelled_at", "card_type", "created_at", "dining_date", "expires_at",
  "id", "intention_type", "meal_period", "owner_user_id", "preferred_time", "restaurant_id"
].sort());

export const SR2GA_CARD_TYPES = Object.freeze(["general", "restaurant"]);
export const SR2GA_INTENTION_TYPES = Object.freeze(["chat_first", "eat_together"]);
export const SR2GA_MEAL_PERIODS = Object.freeze(["breakfast", "dinner", "late_night", "lunch"]);

// Columns whose presence would mean SR-2G-A had smuggled a later round's authority into an
// irreversible migration: ranking, entitlement, moderation, discovery history or action state.
export const SR2GA_FORBIDDEN_COLUMN_MARKERS = Object.freeze([
  "rank_score", "score", "match_reason", "taste", "similarity",
  "is_premium", "premium", "plan_code", "entitlement", "billing",
  "is_verified", "verified", "verification",
  "seen", "impression", "view_count", "analytics",
  "invite", "match_id", "matched", "fulfilled", "chat",
  "latitude", "longitude", "geo", "distance",
  "status"
]);

// Secrets a card reference must never be sealed with. Sharing any of these would let a broader
// credential forge card references.
export const SR2GA_FORBIDDEN_KEY_MARKERS = Object.freeze([
  "SOCIAL_CANDIDATE_REF_KEY_V1",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE",
  "service_role",
  "JWT_SECRET",
  "DB_PASSWORD"
]);

// Roles that must never receive any privilege on the card table in this round.
export const SR2GA_FORBIDDEN_GRANTEES = Object.freeze([
  "anon", "public", "service_role", "authenticator", "social_runtime_executor"
]);

export function createSr2gaCanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");

  const entries = SR2GA_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");

  return Object.freeze({
    paths: SR2GA_SUCCESSOR_PATHS,
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

export function classifySr2gaLifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GA_BASELINE &&
    state.originHead === SR2GA_BASELINE &&
    state.ahead === 0 &&
    state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GA_SUCCESSOR_PATHS) &&
    stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GA_BASELINE &&
    state.headParent === SR2GA_BASELINE &&
    worktreePaths.length === 0 &&
    stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GA_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed =
    frozenShape &&
    state.originHead === SR2GA_BASELINE &&
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
