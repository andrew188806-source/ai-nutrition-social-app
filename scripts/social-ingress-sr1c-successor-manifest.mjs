// Validation-only exact SR-1C successor inventory. No prefix, glob or directory allowance.
export const SR1C_SUCCESSOR_MIGRATION =
  "supabase/migrations/20260811010000_social_canonical_candidate_pool.sql";

export const SR1C_SUCCESSOR_PATHS = Object.freeze([
  "package.json",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-ingress-sr1c-guard.mjs",
  "scripts/social-ingress-sr1c-mutations.mjs",
  "scripts/social-ingress-sr1c-smoke.mjs",
  "scripts/social-ingress-sr1c-successor-manifest.mjs",
  "scripts/meal-photo-analysis-edge-function-mi-e-c4-smoke.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-pair-sr1a-smoke.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs",
  "supabase/config.toml",
  "supabase/functions/_shared/auth/authenticateCaller.ts",
  "supabase/functions/meal-photo-analysis/auth.ts",
  "supabase/functions/social-candidate-provenance/candidateProvider.ts",
  "supabase/functions/social-candidate-provenance/config.ts",
  "supabase/functions/social-candidate-provenance/errors.ts",
  "supabase/functions/social-candidate-provenance/handler.ts",
  "supabase/functions/social-candidate-provenance/index.ts",
  SR1C_SUCCESSOR_MIGRATION
].sort());
