import crypto from "node:crypto";

export const RECBP0_BASELINE = "cda33cd0c68255f4fb68288c5edd158d344e9fdc";
export const RECBP0_COMMIT_SUBJECT = "Establish candidate Taste data authority";
export const RECBP0_MIGRATION =
  "supabase/migrations/20260828010000_candidate_taste_data_authority.sql";

export const RECBP0_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-b-p0",
  "test:recommendation-rec-b-p0-smoke",
  "test:recommendation-rec-b-p0-mutations",
  "test:recommendation-rec-b-p0-postgres"
]);

export const RECBP0_PATHS = Object.freeze([
  "docs/recommendation/rec-b-p0-candidate-taste-data-authority.md",
  "package.json",
  "packages/shared/src/domain/candidate-taste/candidateTasteAuthority.ts",
  "packages/shared/src/domain/candidate-taste/index.ts",
  "packages/shared/src/domain/index.ts",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-a-successor-manifest.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-guard.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-postgres-apply.mjs",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-shared-authority-geo-1a-guard.mjs",
  "scripts/geo-shared-authority-geo-1a-postgres-apply.mjs",
  "scripts/recommendation-rec-b-p0-guard.mjs",
  "scripts/recommendation-rec-b-p0-mutations.mjs",
  "scripts/recommendation-rec-b-p0-postgres-apply.mjs",
  "scripts/recommendation-rec-b-p0-smoke.mjs",
  "scripts/recommendation-rec-b-p0-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-taste-sr1d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  RECBP0_MIGRATION
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyRecbp0Lifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECBP0_BASELINE
    && input.originHead === RECBP0_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECBP0_PATHS);
  const frozenShape = input.parent === RECBP0_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECBP0_PATHS);
  const frozenLocal = frozenShape
    && input.originHead === RECBP0_BASELINE
    && input.behind === 0
    && input.ahead === 1;
  const frozenPushed = frozenShape
    && input.originHead === input.head
    && input.behind === 0
    && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local" : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? worktree : delta });
}

export function createRecbp0Manifest(readFile) {
  const entries = RECBP0_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
