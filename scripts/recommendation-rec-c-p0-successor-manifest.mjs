import crypto from "node:crypto";

export const RECCP0_BASELINE = "335baa96a5bb6e9dfdc7f5ccd82be2f10cbab08a";
export const RECCP0_COMMIT_SUBJECT = "Establish candidate allergen data authority";
export const RECCP0_MIGRATION =
  "supabase/migrations/20260830010000_candidate_allergen_data_authority.sql";

export const RECCP0_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-c-p0",
  "test:recommendation-rec-c-p0-smoke",
  "test:recommendation-rec-c-p0-mutations",
  "test:recommendation-rec-c-p0-postgres"
]);

export const RECCP0_PATHS = Object.freeze([
  "docs/recommendation/rec-c-p0-candidate-allergen-data-authority.md",
  "package.json",
  "packages/shared/src/domain/candidate-allergen/candidateAllergenAuthority.ts",
  "packages/shared/src/domain/candidate-allergen/index.ts",
  "packages/shared/src/domain/index.ts",
  // Additive successor-awareness only. Each of these eight predecessor guards carries a lifecycle
  // seam recognising REC-C-P0's exact path set, because they fail solely on work that is not their
  // own while this round is in flight — proven against a clean baseline worktree. Nothing frozen is
  // weakened: on their own commits the REC-C-P0 set is simply absent, so every assertion evaluates
  // exactly as it did before. The four GEO guards were widened the same way by REC-A, REC-B-P0,
  // REC-B-P1 and REC-B before this round; their gates read `recbLifecycle.valid`, which closed when
  // REC-B was pushed, so REC-C-P0 is simply the next successor to be named.
  //
  // The pre-existing origin/main failures of recommendation-rec-a and recommendation-rec-b-p0
  // reproduce at the clean baseline and are deliberately left failing: separate historical tooling
  // debt, not this round's to repair.
  "scripts/geo-coordinate-source-geo-1c-p0-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-shared-authority-geo-1a-guard.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-b-p0-guard.mjs",
  "scripts/recommendation-rec-b-p1-guard.mjs",
  "scripts/recommendation-rec-c-p0-guard.mjs",
  "scripts/recommendation-rec-c-p0-mutations.mjs",
  "scripts/recommendation-rec-c-p0-postgres-apply.mjs",
  "scripts/recommendation-rec-c-p0-smoke.mjs",
  "scripts/recommendation-rec-c-p0-successor-manifest.mjs",
  RECCP0_MIGRATION
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyReccp0Lifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECCP0_BASELINE
    && input.originHead === RECCP0_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECCP0_PATHS);
  const frozenShape = input.parent === RECCP0_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECCP0_PATHS);
  const frozenLocal = frozenShape
    && input.originHead === RECCP0_BASELINE
    && input.behind === 0
    && input.ahead === 1;
  const frozenPushed = frozenShape
    && input.originHead === input.head
    && input.behind === 0
    && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local" : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? worktree : delta });
}

export function createReccp0Manifest(readFile) {
  const entries = RECCP0_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
