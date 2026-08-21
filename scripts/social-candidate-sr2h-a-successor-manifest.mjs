import crypto from "node:crypto";
import { classifySr2hbLifecycle } from "./social-interest-sr2h-b-successor-manifest.mjs";

export const SR2HA_BASELINE = "62aa86f9461870890c94d7bc521aa46640ab6f55";
export const SR2HA_BASELINE_SUBJECT = "Automate Meal Buddy context from meal recommendations";

export const SR2HA_SUCCESSOR_PATHS = Object.freeze([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx",
  "apps/mobile/features/meal-buddy-candidates/adapters/disabledMealBuddyRepositories.ts",
  "apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateProfileRepository.ts",
  "apps/mobile/features/meal-buddy-candidates/factories.ts",
  "apps/mobile/features/meal-buddy-candidates/interestCatalog.ts",
  "apps/mobile/features/meal-buddy-candidates/ports.ts",
  "apps/mobile/features/meal-buddy-candidates/supabaseMealBuddyCandidateContracts.ts",
  "apps/mobile/features/meal-buddy-candidates/types.ts",
  "apps/mobile/features/meal-buddy-candidates/useMealBuddyCandidateProfile.ts",
  "package.json",
  "packages/shared/src/domain/meal-buddy-candidate/types.ts",
  "packages/shared/src/domain/meal-buddy-candidate/validate.ts",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-candidate-sr2h-a-mutations.mjs",
  "scripts/social-candidate-sr2h-a-smoke.mjs",
  "scripts/social-candidate-sr2h-a-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2g-g-successor-manifest.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-c-guard.mjs",
  "scripts/social-candidate-sr2g-c-r1-guard.mjs",
  "scripts/social-candidate-sr2g-b-r1-guard.mjs",
  "scripts/social-candidate-sr2g-b-guard.mjs",
  "scripts/social-candidate-sr2g-a-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "supabase/config.toml",
  "supabase/functions/_shared/meal-buddy-candidate-profile-api/compose.ts",
  "supabase/functions/_shared/meal-buddy-candidate-profile-api/request.ts",
  "supabase/functions/_shared/meal-buddy-candidate-profile-api/types.ts",
  "supabase/functions/meal-buddy-candidate-profile/config.ts",
  "supabase/functions/meal-buddy-candidate-profile/errors.ts",
  "supabase/functions/meal-buddy-candidate-profile/handler.ts",
  "supabase/functions/meal-buddy-candidate-profile/index.ts"
].sort());

const exact = (left, right) => {
  const a = [...left].sort(); const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export function classifySr2haLifecycle(state) {
  const candidate = state.head === SR2HA_BASELINE && state.originHead === SR2HA_BASELINE
    && state.ahead === 0 && state.behind === 0 && state.stagedPaths.length === 0
    && exact(state.worktreePaths, SR2HA_SUCCESSOR_PATHS);
  const frozenShape = state.head !== SR2HA_BASELINE && state.headParent === SR2HA_BASELINE
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.headDeltaPaths, SR2HA_SUCCESSOR_PATHS) && !state.headDeleted;
  const frozenUnpushed = frozenShape && state.originHead === SR2HA_BASELINE && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozenShape && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const successor = classifySr2hbLifecycle(state);
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : frozenPushed ? "frozen_pushed"
    : successor.valid ? `successor_${successor.phase}` : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: successor.valid ? successor.manifest : candidate ? state.worktreePaths : state.headDeltaPaths
  });
}

export function createSr2haCanonicalManifest(readRawBytes) {
  const entries = SR2HA_SUCCESSOR_PATHS.map((path) => ({
    path, sha256: crypto.createHash("sha256").update(readRawBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({ entries, text, aggregateSha256: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex") });
}
