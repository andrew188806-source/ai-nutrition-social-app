import crypto from "node:crypto";

export const GEO1DP0_BASELINE = "67a53639878d142647f3550008b02aafa71ae7ce";
export const GEO1DP0_BASELINE_SUBJECT = "Activate Ingredient Avoidance recommendation eligibility";
export const GEO1DP0_COMMIT_SUBJECT = "Persist exact Meal Buddy branch context";
export const GEO1DP0_MIGRATION =
  "supabase/migrations/20260903010000_meal_buddy_card_branch_context_authority.sql";
export const GEO1DP0_MIGRATION_SHA256 =
  "d7a68e3bd0ad3d95e5c46db8a30e60f45d4cb228d74ecf3a430bd32899c5bff1";

export const GEO1DP0_NPM_KEYS = Object.freeze([
  "test:geo-meal-buddy-geo-1d-p0",
  "test:geo-meal-buddy-geo-1d-p0-smoke",
  "test:geo-meal-buddy-geo-1d-p0-mutations",
  "test:geo-meal-buddy-geo-1d-p0-postgres"
]);

export const GEO1DP0_PRODUCT_PATHS = Object.freeze([
  GEO1DP0_MIGRATION,
  "supabase/functions/_shared/meal-buddy-card-api/runtime.ts"
]);

export const GEO1DP0_PATHS = Object.freeze([
  ...GEO1DP0_PRODUCT_PATHS,
  "package.json",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-meal-buddy-geo-1d-p0-guard.mjs",
  "scripts/geo-meal-buddy-geo-1d-p0-mutations.mjs",
  "scripts/geo-meal-buddy-geo-1d-p0-postgres-apply.mjs",
  "scripts/geo-meal-buddy-geo-1d-p0-smoke.mjs",
  "scripts/geo-meal-buddy-geo-1d-p0-successor-manifest.mjs",
  "scripts/recommendation-rec-a-guard.mjs",
  "scripts/recommendation-rec-b-guard.mjs",
  "scripts/recommendation-rec-c-guard.mjs",
  "scripts/recommendation-rec-d-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs"
].sort());

const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export function classifyGeo1dp0Lifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === GEO1DP0_BASELINE
    && input.originHead === GEO1DP0_BASELINE && input.behind === 0 && input.ahead === 0
    && input.stagedPaths.length === 0 && !input.deleted && same(worktree, GEO1DP0_PATHS);
  const frozenShape = input.parent === GEO1DP0_BASELINE
    && input.stagedPaths.length === 0 && input.worktreePaths.length === 0
    && !input.deleted && same(delta, GEO1DP0_PATHS);
  const frozenLocal = frozenShape && input.originHead === GEO1DP0_BASELINE
    && input.behind === 0 && input.ahead === 1;
  const frozenPushed = frozenShape && input.originHead === input.head
    && input.behind === 0 && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local"
    : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase,
    manifest: candidate ? worktree : delta });
}

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)\/\/[^\n]*/g, "$1")
  .replace(/(^|\s)--[^\n]*/g, "$1");

export function auditGeo1dp0Sources(sources) {
  const migration = sources[GEO1DP0_MIGRATION] ?? "";
  const runtime = sources["supabase/functions/_shared/meal-buddy-card-api/runtime.ts"] ?? "";
  const code = stripComments(migration);
  const violations = [];
  const rule = (name, pass) => { if (!pass) violations.push(name); };

  rule("private schema binding", /create table social_internal\.meal_buddy_card_branch_context/.test(code));
  rule("one binding per card", /meal_buddy_card_branch_context_pkey primary key \(card_id\)/.test(code));
  rule("card restaurant composite FK", /foreign key \(card_id, restaurant_id\)[\s\S]{0,120}?references public\.meal_buddy_cards \(id, restaurant_id\)/.test(code));
  rule("branch restaurant composite FK", /foreign key \(branch_id, restaurant_id\)[\s\S]{0,120}?references public\.restaurant_branches \(id, restaurant_id\)/.test(code));
  rule("forced RLS", /enable row level security/.test(code) && /force row level security/.test(code));
  rule("writer policies are scoped only to the sealed authority",
    /for select to meal_buddy_card_write_authority using \(true\)/.test(code)
    && /for insert to meal_buddy_card_write_authority with check \(true\)/.test(code));
  rule("client table access revoked", /revoke all on table[\s\S]{0,180}?anon, authenticated, authenticator, service_role, social_runtime_executor/.test(code));
  rule("existing sealed writer reused", /to meal_buddy_card_write_authority/.test(code)
    && /owner to meal_buddy_card_write_authority/.test(code));
  rule("atomic successor calls frozen handoff", /v_payload := social_internal\.create_meal_buddy_card_from_recommendation\(/.test(code));
  rule("same validated branch input is inserted", /values \(v_card_id, p_recommendation_restaurant_id, p_branch_id\)/.test(code));
  rule("binding follows successful card only", /v_payload ->> 'ok' = 'true' and p_branch_id is not null/.test(code));
  rule("server-only bounded read seam", /create function social_internal\.read_meal_buddy_card_branch_context/.test(code)
    && /cardinality\(p_card_ids\) > 200/.test(code));
  rule("only executor receives function execution", (code.match(/grant execute on function/g) ?? []).length === 2
    && !/grant execute[\s\S]{0,200}?to (anon|authenticated|service_role)/i.test(code));
  rule("runtime invokes exact atomic successor", /create_meal_buddy_card_from_recommendation_with_branch_context/.test(runtime));
  rule("no historical backfill", !/insert into social_internal\.meal_buddy_card_branch_context[\s\S]{0,200}?select/i.test(code));
  rule("no GEO filtering", !/narrow_branch_candidates|within_radius|distance_meters|radius/i.test(code + runtime));
  rule("no dedupe ranking or exposure change", !/row_number|rankSocialCandidates|applySocialExposure/.test(code + runtime));
  rule("no branch disclosure in card DTO", !/OwnedMealBuddyCardDto[\s\S]{0,300}?branchId/.test(runtime));
  rule("no arbitrary branch inference", !/limit 1|order by[\s\S]{0,80}?branch|restaurant_id[^\n]*select/i.test(code));
  return Object.freeze(violations);
}

export function createGeo1dp0Manifest(readFile) {
  const entries = GEO1DP0_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(readFile(file)).digest("hex")
  }));
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: crypto.createHash("sha256")
      .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
      .digest("hex")
  });
}
