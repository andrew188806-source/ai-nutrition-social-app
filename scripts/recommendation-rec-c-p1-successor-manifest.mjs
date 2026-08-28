import crypto from "node:crypto";

export const RECCP1_BASELINE = "d7bf2a45b38a6bbc6ed12188c6b2cd042271a69c";
export const RECCP1_COMMIT_SUBJECT = "Establish governed user allergy settings";
export const RECCP1_MIGRATION =
  "supabase/migrations/20260831010000_user_allergy_setting_authority.sql";

export const RECCP1_NPM_KEYS = Object.freeze([
  "test:recommendation-rec-c-p1",
  "test:recommendation-rec-c-p1-smoke",
  "test:recommendation-rec-c-p1-mutations",
  "test:recommendation-rec-c-p1-postgres"
]);

export const RECCP1_PATHS = Object.freeze([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/allergy-settings.tsx",
  "apps/mobile/app/me.tsx",
  "apps/mobile/features/consumer-allergy-settings/controller.ts",
  "apps/mobile/features/consumer-allergy-settings/index.ts",
  "apps/mobile/features/consumer-allergy-settings/repository.ts",
  "apps/mobile/features/consumer-allergy-settings/runtimeBinding.ts",
  "apps/mobile/features/consumer-allergy-settings/supabaseContracts.ts",
  "apps/mobile/features/consumer-allergy-settings/types.ts",
  "apps/mobile/features/consumer-allergy-settings/useConsumerAllergySettings.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-taste-profile/adapters/supabaseConsumerTasteFoundationRepository.ts",
  "apps/mobile/features/consumer-taste-profile/supabaseTasteFoundationContracts.ts",
  "docs/recommendation/rec-c-p1-user-allergy-setting-authority.md",
  "lib/i18n/zh-TW.ts",
  "package.json",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-b-p0-guard.mjs",
  "scripts/recommendation-rec-b-p1-guard.mjs",
  "scripts/recommendation-rec-c-p1-guard.mjs",
  "scripts/recommendation-rec-c-p1-mutations.mjs",
  "scripts/recommendation-rec-c-p1-postgres-apply.mjs",
  "scripts/recommendation-rec-c-p1-smoke.mjs",
  "scripts/recommendation-rec-c-p1-successor-manifest.mjs",
  "scripts/recommendation-rec-c-p0-guard.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-foundation-ts2d-mutations.mjs",
  "scripts/taste-foundation-ts2d-smoke.mjs",
  RECCP1_MIGRATION
].sort());

const same = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

export function classifyReccp1Lifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RECCP1_BASELINE
    && input.originHead === RECCP1_BASELINE
    && input.behind === 0
    && input.ahead === 0
    && input.stagedPaths.length === 0
    && !input.deleted
    && same(worktree, RECCP1_PATHS);
  const frozenShape = input.parent === RECCP1_BASELINE
    && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0
    && !input.deleted
    && same(delta, RECCP1_PATHS);
  const frozenLocal = frozenShape && input.originHead === RECCP1_BASELINE
    && input.behind === 0 && input.ahead === 1;
  const frozenPushed = frozenShape && input.originHead === input.head
    && input.behind === 0 && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local" : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? worktree : delta });
}

export function createReccp1Manifest(readFile) {
  const entries = RECCP1_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return Object.freeze({ entries: Object.freeze(entries), aggregateSha256 });
}
