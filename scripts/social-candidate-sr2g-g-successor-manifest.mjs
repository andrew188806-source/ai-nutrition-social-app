import crypto from "node:crypto";
import {
  classifySr2haLifecycle
} from "./social-candidate-sr2h-a-successor-manifest.mjs";

export const SR2GG_BASELINE = "6dc82815cfd97c2d26f7287e53dd8d4747054917";
export const SR2GG_BASELINE_SUBJECT = "Add Meal Buddy meal-context matching authority";
export const SR2GG_MIGRATION = "supabase/migrations/20260821010000_meal_buddy_recommendation_context_handoff.sql";

// Exact, wildcard-free successor inventory. Validation-only predecessor-guard awareness may be
// added here during the local audit; no directory-wide allowance exists.
export const SR2GG_SUCCESSOR_PATHS = Object.freeze([
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/meal-buddy-card-create/createRecommendationMealBuddyCard.ts",
  "apps/mobile/features/meal-buddy-card-create/index.ts",
  "apps/mobile/features/meal-buddy-card-create/runtimeBinding.ts",
  "apps/mobile/features/meal-buddy-card-create/supabaseContracts.ts",
  "apps/mobile/features/meal-buddy-card-create/types.ts",
  "apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts",
  "apps/mobile/features/next-meal-prototype/types.ts",
  "package.json",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2g-g-mutations.mjs",
  "scripts/social-candidate-sr2g-g-smoke.mjs",
  "scripts/social-candidate-sr2g-g-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-c-guard.mjs",
  "scripts/social-candidate-sr2g-c-r1-guard.mjs",
  "scripts/social-candidate-sr2g-b-r1-guard.mjs",
  "scripts/social-candidate-sr2g-b-guard.mjs",
  "scripts/social-candidate-sr2g-a-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "supabase/functions/_shared/meal-buddy-card-api/compose.ts",
  "supabase/functions/_shared/meal-buddy-card-api/runtime.ts",
  "supabase/functions/_shared/meal-buddy-card-api/types.ts",
  "supabase/functions/_shared/meal-buddy-card-api/validate.ts",
  SR2GG_MIGRATION
].sort());

const exact = (left, right) => {
  const a = [...left].sort(); const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export function classifySr2ggLifecycle(state) {
  const candidate = state.head === SR2GG_BASELINE && state.originHead === SR2GG_BASELINE
    && state.ahead === 0 && state.behind === 0 && state.stagedPaths.length === 0
    && exact(state.worktreePaths, SR2GG_SUCCESSOR_PATHS);
  const frozenShape = state.head !== SR2GG_BASELINE && state.headParent === SR2GG_BASELINE
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.headDeltaPaths, SR2GG_SUCCESSOR_PATHS) && !state.headDeleted;
  const frozenUnpushed = frozenShape && state.originHead === SR2GG_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const successor = classifySr2haLifecycle(state);
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed"
    : successor.valid ? `successor_${successor.phase}` : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: successor.valid ? successor.manifest : candidate ? state.worktreePaths : state.headDeltaPaths
  });
}

export function createSr2ggCanonicalManifest(readRawBytes) {
  const entries = SR2GG_SUCCESSOR_PATHS.map((path) => ({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({ entries, text, aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex") });
}
