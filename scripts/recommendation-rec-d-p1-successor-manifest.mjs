import crypto from "node:crypto";

export const RECDP1_BASELINE = "8f38b1783b10a2a1a575b0fc5f3f356ea4ceefe8";
export const RECDP1_COMMIT_SUBJECT = "Establish governed user ingredient avoidance settings";
export const RECDP1_MIGRATION =
  "supabase/migrations/20260902010000_user_ingredient_avoidance_setting_authority.sql";

export const RECDP1_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-d-p1",
  "test:recommendation-rec-d-p1-smoke",
  "test:recommendation-rec-d-p1-mutations",
  "test:recommendation-rec-d-p1-postgres"
]);

export const RECDP1_PATHS = Object.freeze([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/ingredient-avoidance-settings.tsx",
  "apps/mobile/app/me.tsx",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/controller.ts",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/index.ts",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/repository.ts",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/runtimeBinding.ts",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/supabaseContracts.ts",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/types.ts",
  "apps/mobile/features/consumer-ingredient-avoidance-settings/useConsumerIngredientAvoidanceSettings.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "docs/recommendation/rec-d-p1-user-ingredient-avoidance-setting-authority.md",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-c-guard.mjs",
  "scripts/recommendation-rec-c-p0-guard.mjs",
  "scripts/recommendation-rec-c-p1-guard.mjs",
  "scripts/recommendation-rec-d-p0-guard.mjs",
  "scripts/recommendation-rec-d-p1-guard.mjs",
  "scripts/recommendation-rec-d-p1-mutations.mjs",
  "scripts/recommendation-rec-d-p1-postgres-apply.mjs",
  "scripts/recommendation-rec-d-p1-smoke.mjs",
  "scripts/recommendation-rec-d-p1-successor-manifest.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  RECDP1_MIGRATION
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyRecdp1Lifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECDP1_BASELINE
    && input.originHead === RECDP1_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECDP1_PATHS);
  const frozenShape = input.parent === RECDP1_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECDP1_PATHS);
  const frozenLocal = frozenShape
    && input.originHead === RECDP1_BASELINE
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

export function createRecdp1Manifest(readFile) {
  const entries = RECDP1_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
