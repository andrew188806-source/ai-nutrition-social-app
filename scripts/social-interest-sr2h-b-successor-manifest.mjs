import crypto from "node:crypto";
import {
  classifySr2iaLifecycle,
  SR2IA_MIGRATION
} from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";

export const SR2HB_BASELINE = "f54f04dbe229470fda08dc6356fb67216f9f0202";
export const SR2HB_BASELINE_SUBJECT = "Add SR-2H-A candidate public profile authority";
export const SR2HB_MIGRATION = "supabase/migrations/20260822010000_social_interest_settings_atomic_replace.sql";
export const SR2HB_MIGRATION_SHA256 = "cd71997f1c707fc60500d95d18dbf0ff66c23f57a664e1f777ebbc50ec64e312";

// Exact wildcard-free local candidate inventory. Validation-only predecessor-guard repairs remain
// explicit entries; no directory, migration family or generic successor is whitelisted.
export const SR2HB_SUCCESSOR_PATHS = Object.freeze([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/me.tsx",
  "apps/mobile/app/social-interest-settings.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/social-interest-settings/controller.ts",
  "apps/mobile/features/social-interest-settings/index.ts",
  "apps/mobile/features/social-interest-settings/repository.ts",
  "apps/mobile/features/social-interest-settings/runtimeBinding.ts",
  "apps/mobile/features/social-interest-settings/supabaseContracts.ts",
  "apps/mobile/features/social-interest-settings/types.ts",
  "apps/mobile/features/social-interest-settings/useSocialInterestSettings.ts",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-candidate-sr2h-a-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2h-b-concurrency.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-interest-sr2h-b-mutations.mjs",
  "scripts/social-interest-sr2h-b-smoke.mjs",
  "scripts/social-interest-sr2h-b-successor-manifest.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  SR2HB_MIGRATION
].sort());

const exact = (left, right) => {
  const a = [...left].sort(); const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export function classifySr2hbLifecycle(state) {
  const candidate = state.head === SR2HB_BASELINE && state.originHead === SR2HB_BASELINE
    && state.ahead === 0 && state.behind === 0 && state.stagedPaths.length === 0
    && exact(state.worktreePaths, SR2HB_SUCCESSOR_PATHS);
  const frozenShape = state.head !== SR2HB_BASELINE && state.headParent === SR2HB_BASELINE
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.headDeltaPaths, SR2HB_SUCCESSOR_PATHS) && !state.headDeleted;
  const frozenUnpushed = frozenShape && state.originHead === SR2HB_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const successor = classifySr2iaLifecycle({
    ...state, parent: state.headParent, deltaPaths: state.headDeltaPaths, deleted: state.headDeleted
  });
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed"
    : successor.valid ? `successor_${successor.phase}` : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: successor.valid ? successor.manifest : candidate ? state.worktreePaths : state.headDeltaPaths });
}

export function validateSr2hbMigrationAuthority({
  lifecycle,
  changedMigrationPaths,
  predecessorMigrationExists,
  predecessorMigrationSha256
}) {
  if (!lifecycle.valid) return false;
  const successor = lifecycle.phase.startsWith("successor_");
  const relationshipMobileSuccessor = lifecycle.phase.startsWith("successor_successor_");
  const lifecycleMigrations = lifecycle.manifest.filter((file) => file.startsWith("supabase/migrations/"));
  const expectedLifecycleMigrations = relationshipMobileSuccessor ? [] : successor ? [SR2IA_MIGRATION] : [SR2HB_MIGRATION];
  const expectedChangedMigrations = successor && lifecycle.phase !== "successor_candidate"
    ? [SR2HB_MIGRATION, SR2IA_MIGRATION]
    : [SR2HB_MIGRATION];
  return predecessorMigrationExists
    && predecessorMigrationSha256 === SR2HB_MIGRATION_SHA256
    && exact(lifecycleMigrations, expectedLifecycleMigrations)
    && exact(changedMigrationPaths, expectedChangedMigrations);
}

export function createSr2hbCanonicalManifest(readRawBytes) {
  const entries = SR2HB_SUCCESSOR_PATHS.map((path) => ({
    path,
    sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    entries,
    text,
    aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")
  });
}
