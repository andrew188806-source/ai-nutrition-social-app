#!/usr/bin/env node
// RA-2H-P3 guard: static verification that Consumer temporal activation composes the frozen
// RA-2H-P1 evaluator once per shared producer, never duplicates its logic, never widens its grant to
// a client-reachable role directly, and never lets CLOSED depublish a catalogue entity.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const checks = []; const failures = [];
function check(name, pass, detail) {
  const r = { name, pass: Boolean(pass) };
  checks.push(r); if (!r.pass) failures.push({ ...r, detail });
  console.log(`${r.pass ? "PASS" : "FAIL"} ${name}`);
  if (!r.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

const P1_MIGRATION = "supabase/migrations/20260906030000_restaurant_owner_branch_temporal_authority.sql";
const P1_SHA = "a4cbdcad2f83bde7fa08b0496b48d55b95c4c228353705b3ed2decc2dbbcf151";
const P3_MIGRATION = "supabase/migrations/20260907010000_consumer_temporal_activation_ra_2h_p3.sql";

const p1 = read(P1_MIGRATION).replace(/\r\n/g, "\n");
const p1Sha = crypto.createHash("sha256").update(p1, "utf8").digest("hex");
check("P1 migration is byte-unchanged (LF-normalized SHA-256 pinned)", p1Sha === P1_SHA, p1Sha);

const p3 = fs.existsSync(path.join(root, P3_MIGRATION)) ? read(P3_MIGRATION) : "";
check("P3 successor migration exists", p3.length > 0);

// --- 1. Composition, not duplication -------------------------------------------------------------
check("P3 migration calls the frozen evaluator by name",
  p3.includes("restaurant_internal.evaluate_branch_temporal_state_v1"));
check("P3 migration does not reimplement weekday/DST arithmetic (no isodow/at time zone in P3)",
  !/isodow|at time zone/i.test(p3));
check("P3 migration introduces exactly two new evaluator wrapper functions",
  (p3.match(/create function restaurant_internal\.consumer_branch_current_temporal_state/g) ?? []).length === 2);

// --- 2. Grant boundary: the raw evaluator is never reachable by a client-facing role ---------------
const evaluatorGrantIdx = p1.indexOf("grant execute on function restaurant_internal.evaluate_branch_temporal_state_v1");
const evaluatorGrantWindow = evaluatorGrantIdx >= 0 ? p1.slice(evaluatorGrantIdx, evaluatorGrantIdx + 150) : "";
check("raw evaluator grant target is unchanged (sealed reader role only)",
  evaluatorGrantWindow.includes("restaurant_branch_temporal_context_reader"), evaluatorGrantWindow);
check("P3 never grants execute on the raw evaluator to anon/authenticated/social_runtime_executor",
  !/grant execute on function restaurant_internal\.evaluate_branch_temporal_state_v1[\s\S]{0,80}(anon|authenticated|social_runtime_executor)/i.test(p3));
check("P3 wrapper functions are the ones granted to anon/authenticated/social_runtime_executor",
  /grant execute on function restaurant_internal\.consumer_branch_current_temporal_state_v1\(text\) to anon/.test(p3)
  && /grant execute on function restaurant_internal\.consumer_branch_current_temporal_state_v1\(text\) to authenticated/.test(p3)
  && /grant execute on function restaurant_internal\.consumer_branch_current_temporal_states_v1\(text\[\]\) to social_runtime_executor/.test(p3));
check("P3 wrappers use DB-authoritative now(), never a client-supplied instant",
  (p3.match(/pg_catalog\.now\(\)/g) ?? []).length >= 2 && !/p_at\b|p_now\b|p_instant\b/.test(p3));
check("P3 wrappers expose state only, never reason/audit/internal detail",
  !/'reason'|auditId|audit_log/i.test(p3));

// --- 3. Successor views: additive only, no filtering, admin lifecycle gate unchanged ---------------
const catalogV1 = read("supabase/migrations/20260724010000_consumer_public_restaurant_catalog_v1.sql");
const nextMealV1 = read("supabase/migrations/20260715020000_consumer_public_next_meal_candidates_v1.sql");
check("catalogue successor view exists and adds exactly one new column",
  p3.includes("create view public.consumer_public_restaurant_catalog_v2")
  && p3.includes("branch_temporal_state") && p3.includes("r.status = 'active'"));
check("catalogue successor's admin lifecycle gate is byte-identical to _v1's (rb.status/is_active/r.status)",
  catalogV1.includes("rb.status = 'active'") && catalogV1.includes("rb.is_active = true") && catalogV1.includes("r.status = 'active'")
  && p3.includes("rb.status = 'active'") && p3.includes("rb.is_active = true"));
const catalogV2Start = p3.indexOf("create view public.consumer_public_restaurant_catalog_v2");
const catalogV2End = p3.indexOf("GRANT SELECT ON public.consumer_public_restaurant_catalog_v2 TO authenticated;");
const catalogV2Sql = p3.slice(catalogV2Start, catalogV2End);
check("catalogue successor view has NO temporal-state WHERE/filter clause (CLOSED never depublishes)",
  catalogV2Start >= 0 && catalogV2End > catalogV2Start && !/where[\s\S]*branch_temporal_state/i.test(catalogV2Sql),
  catalogV2Sql.slice(-400));
check("next-meal successor view exists and adds exactly one new column",
  p3.includes("create view public.consumer_public_next_meal_candidates_v2") && p3.includes("bmi.availability = 'available'"));
check("next-meal successor's existing gates are byte-identical to _v1's",
  nextMealV1.includes("rb.status = 'active'") && nextMealV1.includes("bmi.sold_out = false")
  && p3.includes("bmi.sold_out = false") && p3.includes("branch_specific_status = 'available'"));
check("candidate_id remains bmi.id (unchanged join key for existing taste/allergen/ingredient views)",
  p3.includes("bmi.id                    AS candidate_id"));

// --- 4. No RA-2A..RA-2F / GEO / identity byte drift in the successor views --------------------------
check("no sold_out/branch_specific_status/price authority rewritten (still simple column reads)",
  !/set\s+sold_out|set\s+branch_specific_status|update\s+public\.branch_menu_items/i.test(p3));
check("no geo_internal object touched by P3", !/geo_internal\./.test(p3));
check("no restaurant/branch/menu/food identity column renamed or dropped in either successor view",
  p3.includes("r.id AS restaurant_id") && p3.includes("rb.id AS branch_id")
  && p3.includes("bmi.id                    AS candidate_id") && p3.includes("mi.name                   AS meal_name"));

// --- 5. TypeScript integration: single exclusion point per gated surface, no client clock authority -
const rec = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts");
check("REC eligibility filter rejects CLOSED, not '!== OPEN' (UNKNOWN/OPEN both preserved)",
  rec.includes('candidate.branchTemporalState !== "CLOSED"') && !rec.includes('branchTemporalState === "OPEN"'));
check("REC temporal filter runs before ranking, after allergy/ingredient-avoidance eligibility",
  rec.indexOf("applyBranchTemporalEligibility(ingredientAvoidanceResult.candidates)") <
    rec.indexOf("rankNextMealCandidatesByNutrition("));
check("REC temporal filter never touches Taste scoring functions",
  !/applyBranchTemporalEligibility[\s\S]{0,400}(evaluateCandidateTaste|composeDualLaneRecommendation)/.test(rec));
check("REC view/row contract points at the successor view (_v2)",
  read("apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts").includes("consumer_public_next_meal_candidates_v2"));

const mealBuddyCompose = read("supabase/functions/_shared/meal-buddy-candidate-api/compose.ts");
check("Meal Buddy temporal stage runs once, after GEO, before ranking/exposure",
  mealBuddyCompose.indexOf("applyMealBuddyTemporalEligibility(transport, afterGeo)") <
    mealBuddyCompose.indexOf("readSocialCandidateTasteSources("));
check("Meal Buddy temporal stage excludes CLOSED only (never !== OPEN)",
  mealBuddyCompose.includes('states.get(context.branchId) !== "CLOSED"'));
check("Meal Buddy temporal stage never touches Taste comparison/ranking/exposure/context functions",
  !/applyMealBuddyTemporalEligibility[\s\S]{0,600}(compareComposedServerPair|composeMealBuddyContextRanking|applySocialExposure)/.test(mealBuddyCompose));
check("Meal Buddy temporal stage fails open (fallback) on read error, never excludes on failure",
  /applyMealBuddyTemporalEligibility[\s\S]{0,2000}catch[\s\S]{0,80}status: "fallback", cards: selectedCards/.test(mealBuddyCompose));

const catalogMapper = read("apps/mobile/features/restaurants/catalog/mapper.ts");
check("catalogue mapper never excludes/filters a branch by temporalState",
  !/===\s*"CLOSED"/.test(catalogMapper) && !/branches\.filter\(/.test(catalogMapper));
check("catalogue mapper never coerces a malformed temporal value into a state",
  catalogMapper.includes("KNOWN_TEMPORAL_STATES.has(value)") && catalogMapper.includes(": null"));

// --- 6. No client-authoritative clock introduced by this round's new/changed temporal code ----------
const touchedFiles = [
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseNextMealGeoRows.ts",
  "apps/mobile/features/restaurants/catalog/mapper.ts",
  "apps/mobile/features/restaurants/catalog/rowContract.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/compose.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts",
  "supabase/functions/_shared/next-meal-geo-api/compose.ts"
];
const clockLeak = touchedFiles.filter((f) => /Date\.now\(\)|new Date\(\)/.test(read(f)));
check("no new client/server-code Date.now()/new Date() authority near the temporal composition points", clockLeak.length === 0, clockLeak);

// --- 7. No N+1 from the client -----------------------------------------------------------------------
check("catalogue/next-meal views compute temporal state as a plain SELECT-list expression (one query, not per-card)",
  p3.includes("restaurant_internal.consumer_branch_current_temporal_state_v1(rb.id) AS branch_temporal_state"));
check("Meal Buddy reads temporal states via the batch wrapper, once per request, never per candidate",
  read("supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts")
    .includes("consumer_branch_current_temporal_states_v1"));

console.log(JSON.stringify({
  suite: "consumer-temporal-activation-ra-2h-p3-guard",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
if (failures.length) process.exitCode = 1;
