// Validation-only exact SR-2G-C-R1 successor inventory. No prefix, glob or directory allowance.
import crypto from "node:crypto";

export const SR2GCR1_BASELINE = "e09e705f4ebaab7456f9fc87955f4e2a33956906";

export const SR2GCR1_MIGRATION = "supabase/migrations/20260817050000_meal_buddy_candidate_pool_authority_membership_hygiene.sql";
export const SR2GCR1_TARGET_ROLE = "meal_buddy_candidate_pool_authority";
export const SR2GCR1_POOL_FUNCTION = "social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz)";

export const SR2GCR1_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  SR2GCR1_MIGRATION,
  "scripts/social-candidate-sr2g-c-r1-development-acceptance.mjs",
  "scripts/social-candidate-sr2g-c-r1-guard.mjs",
  "scripts/social-candidate-sr2g-c-r1-mutations.mjs",
  "scripts/social-candidate-sr2g-c-r1-smoke.mjs",
  "scripts/social-candidate-sr2g-c-r1-successor-manifest.mjs",
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

// The exact post-repair membership posture for the pool role: one supabase_admin row only.
export const SR2GCR1_EXPECTED_MEMBERSHIP = Object.freeze({
  rows: 1, grantor: "supabase_admin", adminOption: true, inheritOption: false, setOption: false
});

// The frozen posture of every OTHER Social authority, measured at the SR-2G-C-R1 preflight. None of
// these may move: meal_buddy_card_write_authority is SR-2G-B-R1's already-repaired shape.
export const SR2GCR1_FROZEN_MEMBERSHIPS = Object.freeze({
  meal_buddy_card_write_authority: { rows: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false },
  social_authority: { rows: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false },
  social_pair_read_authority: { rows: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false },
  social_profile_projection_authority: { rows: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false },
  social_runtime_executor: { rows: 1, grantor: "supabase_admin", admin: true, inherit: false, set: false }
});

// Frozen SR-2G-C runtime, pinned by body digest at the pre-repair preflight. A hygiene repair must
// move none of it.
export const SR2GCR1_FROZEN_BODY_MD5 = Object.freeze({
  canonical_meal_buddy_candidate_cards: "015a3fab13fe8b978b651928042d4020",
  authorized_candidates: "a906fb3694f694d9c3d4fdda1bbac4dd"
});

// The pool role's exact intended capability set.
export const SR2GCR1_POOL_CAPABILITIES = Object.freeze({
  owner: "meal_buddy_candidate_pool_authority",
  securityDefiner: true,
  volatility: "s",
  searchPath: "search_path=pg_catalog, public, pg_temp",
  tablePrivileges: Object.freeze(["SELECT"]),
  schemaUsage: Object.freeze(["public", "social_internal"]),
  schemaCreate: Object.freeze([]),
  executeGrantees: Object.freeze(["meal_buddy_candidate_pool_authority", "social_runtime_executor"]),
  rlsPolicy: "meal_buddy_cards_candidate_pool_read"
});

// Every predecessor migration whose bytes this round must not touch.
export const SR2GCR1_FROZEN_MIGRATIONS = Object.freeze([
  "supabase/migrations/20260817010000_meal_buddy_card_authority.sql",
  "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql",
  "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql",
  "supabase/migrations/20260817040000_meal_buddy_card_write_authority_membership_hygiene.sql"
]);

// Anything that would make this more than a membership repair.
export const SR2GCR1_FORBIDDEN_MARKERS = Object.freeze([
  "create table", "alter table", "create function", "create or replace function", "drop function",
  // ALTER FUNCTION is how ownership moves, and ownership is the privilege boundary this round protects.
  "alter function",
  "create policy", "drop policy", "alter policy", "create role", "drop role", "alter role",
  "grant execute", "grant select", "grant insert", "grant update", "grant delete", "grant usage",
  "candidateCardRef", "sourceCardRef", "rankSocialCandidates", "applySocialExposure",
  "meal-buddy-candidate-list", "dining_date", "meal_period", "row_number", "authorized_candidates"
]);

export function createSr2gcr1CanonicalManifest(readRawBytes) {
  if (typeof readRawBytes !== "function") throw new TypeError("readRawBytes must be a function");
  const entries = SR2GCR1_SUCCESSOR_PATHS.map((path) => Object.freeze({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    paths: SR2GCR1_SUCCESSOR_PATHS, entries: Object.freeze(entries), text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}

function exactPathSet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function classifySr2gcr1Lifecycle(state) {
  const worktreePaths = [...state.worktreePaths].sort();
  const stagedPaths = [...state.stagedPaths].sort();
  const headDeltaEntries = [...state.headDeltaEntries];
  const headDeltaPaths = headDeltaEntries.map(({ path }) => path).sort();

  const candidate =
    state.head === SR2GCR1_BASELINE && state.originHead === SR2GCR1_BASELINE &&
    state.ahead === 0 && state.behind === 0 &&
    exactPathSet(worktreePaths, SR2GCR1_SUCCESSOR_PATHS) && stagedPaths.length === 0;

  const frozenShape =
    state.head !== SR2GCR1_BASELINE && state.headParent === SR2GCR1_BASELINE &&
    worktreePaths.length === 0 && stagedPaths.length === 0 &&
    exactPathSet(headDeltaPaths, SR2GCR1_SUCCESSOR_PATHS) &&
    !headDeltaEntries.some(({ status }) => status === "D");

  const frozenUnpushed = frozenShape && state.originHead === SR2GCR1_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";

  return Object.freeze({
    valid: phase !== "invalid", phase, candidate, frozenShape, frozenUnpushed, frozenPushed,
    lifecycleManifest: Object.freeze(candidate ? worktreePaths : headDeltaPaths)
  });
}
