import crypto from "node:crypto";
import { classifySr2ibLifecycle } from "./meal-buddy-relationship-sr2i-b-successor-manifest.mjs";

export const SR2IA_BASELINE = "67fc7a02ba1dfe625e6864b93592e25975fbcbb2";
export const SR2IA_BASELINE_SUBJECT = "Add SR-2H-B atomic social interest settings authority";
export const SR2IA_MIGRATION = "supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql";
export const SR2IA_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "scripts/meal-buddy-relationship-sr2i-a-concurrency.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-mutations.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-smoke.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-e2-mutations.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-candidate-sr2h-a-mutations.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-interest-sr2h-b-mutations.mjs",
  "scripts/social-interest-sr2h-b-successor-manifest.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "supabase/config.toml",
  "supabase/functions/_shared/meal-buddy-relationship-api/index.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/request.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts",
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts",
  "supabase/functions/_shared/meal-buddy-relationship-ref/crypto.ts",
  "supabase/functions/_shared/meal-buddy-relationship-ref/index.ts",
  "supabase/functions/_shared/meal-buddy-relationship-ref/policy.ts",
  "supabase/functions/meal-buddy-relationship/config.ts",
  "supabase/functions/meal-buddy-relationship/errors.ts",
  "supabase/functions/meal-buddy-relationship/handler.ts",
  "supabase/functions/meal-buddy-relationship/index.ts",
  SR2IA_MIGRATION
].sort());

const exact = (a, b) => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);
export function classifySr2iaLifecycle(state) {
  const candidate = state.head === SR2IA_BASELINE && state.originHead === SR2IA_BASELINE
    && state.ahead === 0 && state.behind === 0 && state.stagedPaths.length === 0
    && exact(state.worktreePaths, SR2IA_SUCCESSOR_PATHS);
  const frozen = state.head !== SR2IA_BASELINE && state.parent === SR2IA_BASELINE
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, SR2IA_SUCCESSOR_PATHS) && !state.deleted;
  const frozenUnpushed = frozen && state.originHead === SR2IA_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozen && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const successor = classifySr2ibLifecycle(state);
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed"
    : successor.valid ? `successor_${successor.phase}` : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: successor.valid ? successor.manifest : candidate ? state.worktreePaths : state.deltaPaths });
}
export function createSr2iaManifest(readBytes) {
  const entries = SR2IA_SUCCESSOR_PATHS.map((path) => ({
    path, sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({ entries, text, aggregateSha256: crypto.createHash("sha256").update(text, "utf8").digest("hex") });
}
