import crypto from "node:crypto";
export const SR2JA_BASELINE = "cab2e5344c9ec3a5924066d9ee5804c871a2a2ae";
export const SR2JA_BASELINE_SUBJECT = "Activate SR-2I-B Meal Buddy relationship mobile UI";
export const SR2JA_MIGRATION = "supabase/migrations/20260823020000_meal_buddy_chat_authority.sql";
export const SR2JA_PREDECESSOR_MIGRATION = "supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql";
export const SR2JA_PREDECESSOR_MIGRATION_SHA256 = "0d9b83c76adf9e59c913badb948b2d61f80560b62b22763f49bbb5a7233eb12c";
export const SR2JA_PATHS = Object.freeze([
  "package.json",
  "scripts/meal-buddy-chat-sr2j-a-concurrency.mjs",
  "scripts/meal-buddy-chat-sr2j-a-guard.mjs",
  "scripts/meal-buddy-chat-sr2j-a-mutations.mjs",
  "scripts/meal-buddy-chat-sr2j-a-smoke.mjs",
  "scripts/meal-buddy-chat-sr2j-a-successor-manifest.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-successor-manifest.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs",
  "supabase/config.toml",
  "supabase/functions/_shared/meal-buddy-chat-api/index.ts",
  "supabase/functions/_shared/meal-buddy-chat-api/repository.ts",
  "supabase/functions/_shared/meal-buddy-chat-api/request.ts",
  "supabase/functions/_shared/meal-buddy-chat-api/service.ts",
  "supabase/functions/_shared/meal-buddy-chat-api/types.ts",
  "supabase/functions/_shared/meal-buddy-chat-ref/crypto.ts",
  "supabase/functions/_shared/meal-buddy-chat-ref/index.ts",
  "supabase/functions/_shared/meal-buddy-chat-ref/policy.ts",
  "supabase/functions/meal-buddy-chat/config.ts",
  "supabase/functions/meal-buddy-chat/errors.ts",
  "supabase/functions/meal-buddy-chat/handler.ts",
  "supabase/functions/meal-buddy-chat/index.ts",
  "supabase/migrations/20260823020000_meal_buddy_chat_authority.sql"
].sort());
const exact = (a, b) => { const left = [...a].sort(); const right = [...b].sort(); return left.length === right.length && left.every((value, index) => value === right[index]); };
export function classifySr2jaLifecycle(state) {
  const candidate = state.head === SR2JA_BASELINE && state.originHead === SR2JA_BASELINE && state.ahead === 0 && state.behind === 0 && !state.deleted && state.stagedPaths.length === 0 && exact(state.worktreePaths, SR2JA_PATHS);
  const frozen = state.head !== SR2JA_BASELINE && state.parent === SR2JA_BASELINE && !state.deleted && state.worktreePaths.length === 0 && state.stagedPaths.length === 0 && exact(state.deltaPaths, SR2JA_PATHS);
  const frozenUnpushed = frozen && state.originHead === SR2JA_BASELINE && state.ahead === 1 && state.behind === 0;
  const phase = candidate ? "candidate" : frozenUnpushed ? "frozen_unpushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? state.worktreePaths : state.deltaPaths });
}
export function createSr2jaManifest(readBytes) {
  const entries = SR2JA_PATHS.map((path) => ({ path, sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex") }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({ entries, text, aggregateSha256: crypto.createHash("sha256").update(text, "utf8").digest("hex") });
}
