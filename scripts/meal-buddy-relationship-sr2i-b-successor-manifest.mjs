import crypto from "node:crypto";

export const SR2IB_BASELINE = "a5a8f71b2c38cf665f6f0a1b4fb2753408dcda82";
export const SR2IB_BASELINE_SUBJECT = "Add SR-2I-A Meal Buddy relationship authority";
export const SR2IB_REJECTED_LOCAL_FREEZE = "15db826345262c1ba89a1a1e3c2bef089bd2d8a0";
export const SR2IB_MIGRATION = "supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql";
export const SR2IB_MIGRATION_SHA256 = "0d9b83c76adf9e59c913badb948b2d61f80560b62b22763f49bbb5a7233eb12c";

// Exact wildcard-free candidate inventory. Validation-only predecessor repairs are listed
// explicitly once proven necessary; no Mobile, scripts or migration directory is whitelisted.
export const SR2IB_SUCCESSOR_PATHS = Object.freeze([
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx",
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipPanel.tsx",
  "apps/mobile/features/meal-buddy-relationships/controller.ts",
  "apps/mobile/features/meal-buddy-relationships/index.ts",
  "apps/mobile/features/meal-buddy-relationships/repository.ts",
  "apps/mobile/features/meal-buddy-relationships/runtimeBinding.ts",
  "apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-relationships/types.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationshipProfile.ts",
  "apps/mobile/features/meal-buddy-relationships/useMealBuddyRelationships.ts",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-smoke.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-successor-manifest.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-contract.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-mutations.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-smoke.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-successor-manifest.mjs",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-candidate-sr2h-a-smoke.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-interest-sr2h-b-successor-manifest.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts"
].sort());

export const SR2IB_REPAIR_PATHS = Object.freeze([
  "apps/mobile/features/meal-buddy-relationships/MealBuddyRelationshipInbox.tsx",
  "apps/mobile/features/meal-buddy-relationships/controller.ts",
  "apps/mobile/features/meal-buddy-relationships/repository.ts",
  "apps/mobile/features/meal-buddy-relationships/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-relationships/types.ts",
  "lib/i18n/zh-TW.ts",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-smoke.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-contract.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-mutations.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-smoke.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-successor-manifest.mjs",
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts"
].sort());

const exact = (left, right) => {
  const a = [...left].sort(); const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export function classifySr2ibLifecycle(state) {
  const candidate = state.head === SR2IB_BASELINE && state.originHead === SR2IB_BASELINE
    && state.ahead === 0 && state.behind === 0 && state.stagedPaths.length === 0
    && exact(state.worktreePaths, SR2IB_SUCCESSOR_PATHS);
  const repairCandidate = state.head === SR2IB_REJECTED_LOCAL_FREEZE
    && state.parent === SR2IB_BASELINE && state.originHead === SR2IB_BASELINE
    && state.ahead === 1 && state.behind === 0 && state.stagedPaths.length === 0
    && exact(state.worktreePaths, SR2IB_REPAIR_PATHS);
  const frozen = state.head !== SR2IB_BASELINE && state.parent === SR2IB_BASELINE
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, SR2IB_SUCCESSOR_PATHS) && !state.deleted;
  const frozenUnpushed = frozen && state.originHead === SR2IB_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozen && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate" : repairCandidate ? "repair_candidate"
    : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: repairCandidate ? SR2IB_SUCCESSOR_PATHS : candidate ? state.worktreePaths : state.deltaPaths
  });
}

export function createSr2ibManifest(readBytes) {
  const entries = SR2IB_SUCCESSOR_PATHS.map((path) => ({
    path, sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({ entries, text, aggregateSha256: crypto.createHash("sha256").update(text, "utf8").digest("hex") });
}
