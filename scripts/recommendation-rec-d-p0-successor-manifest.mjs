import crypto from "node:crypto";

export const RECDP0_BASELINE = "591bbb701bedbc7222dbea2bba224dfddbfc2371";
export const RECDP0_COMMIT_SUBJECT = "Establish candidate ingredient avoidance data authority";
export const RECDP0_MIGRATION =
  "supabase/migrations/20260901010000_candidate_ingredient_avoidance_data_authority.sql";

export const RECDP0_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-d-p0",
  "test:recommendation-rec-d-p0-smoke",
  "test:recommendation-rec-d-p0-mutations",
  "test:recommendation-rec-d-p0-postgres"
]);

export const RECDP0_PATHS = Object.freeze([
  "docs/recommendation/rec-d-p0-candidate-ingredient-avoidance-data-authority.md",
  "package.json",
  "packages/shared/src/domain/candidate-ingredient-avoidance/candidateIngredientAvoidanceAuthority.ts",
  "packages/shared/src/domain/candidate-ingredient-avoidance/index.ts",
  "packages/shared/src/domain/index.ts",
  // Additive successor-awareness only. Each of these eight predecessor guards carries a lifecycle
  // seam recognising REC-D-P0's exact lifecycle, exact path set, and single additive migration,
  // because they otherwise report work that is not their own while this round is in flight.
  // Nothing frozen is weakened: on their own commits the REC-D-P0 set is absent and every
  // assertion evaluates exactly as before. The pre-existing stale-origin failures of
  // recommendation-rec-a, recommendation-rec-b, recommendation-rec-b-p0 and
  // recommendation-rec-c-p0 reproduce at the clean baseline and are deliberately left failing:
  // separate historical tooling debt, not this round's to repair.
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-b-p0-guard.mjs",
  "scripts/recommendation-rec-b-p1-guard.mjs",
  "scripts/recommendation-rec-c-guard.mjs",
  "scripts/recommendation-rec-c-p0-guard.mjs",
  "scripts/recommendation-rec-c-p1-guard.mjs",
  "scripts/recommendation-rec-d-p0-guard.mjs",
  "scripts/recommendation-rec-d-p0-mutations.mjs",
  "scripts/recommendation-rec-d-p0-postgres-apply.mjs",
  "scripts/recommendation-rec-d-p0-smoke.mjs",
  "scripts/recommendation-rec-d-p0-successor-manifest.mjs",
  RECDP0_MIGRATION
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyRecdp0Lifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECDP0_BASELINE
    && input.originHead === RECDP0_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECDP0_PATHS);
  const frozenShape = input.parent === RECDP0_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECDP0_PATHS);
  const frozenLocal = frozenShape
    && input.originHead === RECDP0_BASELINE
    && input.behind === 0
    && input.ahead === 1;
  const frozenPushed = frozenShape
    && input.originHead === input.head
    && input.behind === 0
    && input.ahead === 0;
  const phase = candidate ? "candidate"
    : frozenLocal ? "frozen_local"
    : frozenPushed ? "frozen_pushed"
    : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? worktree : delta });
}

export function createRecdp0Manifest(readFile) {
  const entries = RECDP0_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
