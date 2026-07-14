# Consumer Runtime Phase 2U — Implementation Plan

## Scope

Phase 2U-A implements N1, N2, and the Mobile Consumer live recommendation read path.

Phase 2U-B performs deployment audit (13-gate N3 prerequisite verification).

Phase 2U-C creates and deploys N3 (nutrition read boundary cleanup) — SEPARATE PHASE, NOT IN THIS IMPLEMENTATION.

Phase 2V implements Restaurant Web safe projections and N4 raw restaurant grant cleanup.

## Phase 2U-A: What This Phase Implements

### N1 — Extend Internal Published Nutrition View

**File**: `supabase/migrations/20260715010000_extend_published_nutrition_provenance.sql`

Extends `public.current_published_menu_item_nutrition` with:
- `nutrition_source_public`: CASE mapping of internal `source` to safe public label
- `nutrition_updated_at`: alias of `n.updated_at`

Mapping:
- `'ai_estimated'` → `'ai_estimated'`
- `'restaurant_verified'` → `'restaurant_confirmed'`
- `'platform_reviewed'` → `'platform_reviewed'`
- Unknown/null → `NULL`

Preserves all 16 existing columns at original positions. No grant changes. No RLS changes. `CREATE OR REPLACE VIEW` preserves ownership (`postgres`) and existing grants.

### N2 — Create Consumer Safe Projection

**File**: `supabase/migrations/20260715020000_consumer_public_next_meal_candidates_v1.sql`

Creates `public.consumer_public_next_meal_candidates_v1`:
- `WITH (security_barrier = true)` — prevents predicate-pushdown bypass
- Owner-level execution (security_invoker NOT set) — executes as postgres
- Joins via `current_published_menu_item_nutrition` only — never directly to `menu_item_nutrition`
- Filters: active restaurant, active branch, published menu, active menu_item, `availability='available'`, `sold_out=false`, `branch_specific_status='available'`, `calories IS NOT NULL`, `nutrition_source_public IS NOT NULL`
- Exposes: `candidate_id`, `restaurant_id`, `branch_id`, `menu_item_id`, `meal_name`, `restaurant_name`, `branch_name`, `district`, `public_image_url`, `calories`, `protein`, `carbohydrates`, `fat`, `fiber`, `nutrition_source_public`, `nutrition_updated_at`, `availability`
- Does NOT expose: `source`, `confidence_score`, `verified_status`, `is_current`, `legal_name`, `plan`, `price`
- Grants: `GRANT SELECT TO authenticated`; explicit `REVOKE ALL FROM PUBLIC, anon`

**N2 is not included in N3 scope**: N2 does not revoke any raw table grants.

### Mobile Live Repository

**New files**:
- `apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts` — Row types and client interface
- `apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts` — Repository implementation

**Modified files**:
- `apps/mobile/features/consumer-meals/types.ts` — Added `"supabase"` to `ConsumerNextMealRecommendationSource`
- `apps/mobile/features/consumer-meals/featureFlags.ts` — Added `"supabase"` to `nextMealRecommendationSources`
- `apps/mobile/features/consumer-meals/factories.ts` — Added Supabase branch in `createConsumerNextMealRecommendationRepository`

Default behavior: `parseNextMealRecommendationSource` returns `"disabled"` when env var is unset. The `"supabase"` source requires explicit `EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE=supabase` opt-in.

### Mobile Runtime Composition Closure

The Phase 2U-A runtime composition gap is closed without introducing a second Auth, session, environment, or Supabase client system.

Runtime dependency sources:

- `authPort`: existing `SupabaseConsumerAuthAdapter`, backed by the Auth client created by `SupabaseConsumerClientFactory`
- `restaurantMenuClient`: the same official Mobile Supabase client, narrowed to `SupabaseRestaurantMenuClientLike`
- Today Intake live read client, when enabled: the same Supabase client, narrowed to `SupabaseConsumerMealClientLike`
- URL and publishable key: existing `getSupabaseConsumerEnvironment()` parser
- session persistence and refresh: existing AsyncStorage Auth storage and official Supabase SDK loader

Actual App dependency trace:

```text
/recommendation
→ createCanonicalNextMealPrototypeRuntimeDependencies()
→ SupabaseConsumerClientFactory
→ one shared authenticated Supabase client
→ SupabaseConsumerAuthAdapter + mealClient + restaurantMenuClient
→ createCanonicalNextMealPrototypeProvider(dependencies)
→ createConsumerNextMealRecommendationService(undefined, dependencies)
→ createConsumerNextMealRecommendationRepository(flags, dependencies)
→ SupabaseConsumerNextMealRecommendationRepository
→ consumer_public_next_meal_candidates_v1
```

The module-scope provider does not lock a session or token. `SupabaseConsumerAuthAdapter.getCurrentSession()` calls the shared Supabase Auth client's `getSession()` for every repository request. The official client owns token refresh and injects the current authenticated token into its read request. Login after startup, refreshed sessions, and logout are therefore observed on subsequent calls; no raw access token is stored in a module constant or exposed through the canonical result.

If the source is `supabase` and composition cannot provide either `authPort` or `restaurantMenuClient`, provider creation remains fail-closed. There is no mock or anonymous fallback. Disabled, mock, and local-menu-demo sources retain their existing behavior, and the default source remains disabled.

Development deployment status supplied for this continuation:

- N1 `20260715010000_extend_published_nutrition_provenance.sql`: deployed
- N2 `20260715020000_consumer_public_next_meal_candidates_v1.sql`: deployed
- Migration count: 23

Codex performs local contract validation only in this continuation. Authenticated Development live smoke and credential-backed verification remain assigned to Claude. N3 is still absent and undeployed. Raw nutrition grants and RLS are unchanged.

### Guard and Smoke

- `scripts/consumer-public-restaurant-menu-phase-2u-guard.mjs`
- `scripts/consumer-public-restaurant-menu-phase-2u-smoke.mjs`

The contract smoke exercises the real provider → service → repository-factory → Supabase-repository chain with fake authenticated dependencies. It does not perform a network request or claim to be a live smoke.

## What Phase 2U-A Does NOT Do

- **N3** is NOT created, NOT deployed, NOT added to `supabase/migrations/`
- Raw grant revoke on `menu_item_nutrition` is NOT executed
- Raw grant revoke on `current_published_menu_item_nutrition` is NOT executed
- Restaurant Web is NOT modified
- Restaurant owner projection is NOT designed
- Production is NOT touched

## N3 Design (FUTURE PHASE 2U-C — DO NOT CREATE AS A PENDING MIGRATION)

```sql
-- FUTURE PHASE 2U-C
-- DO NOT CREATE AS A PENDING MIGRATION
-- DO NOT DEPLOY BEFORE AUDIT GATES

REVOKE SELECT ON public.current_published_menu_item_nutrition FROM anon;
REVOKE SELECT ON public.current_published_menu_item_nutrition FROM authenticated;
REVOKE SELECT ON public.menu_item_nutrition FROM anon;
REVOKE SELECT ON public.menu_item_nutrition FROM authenticated;
```

**N3 Gate conditions** (all 13 must be confirmed before N3 executes):
1. N1 deployed and validated
2. N2 deployed and validated
3. Mobile Supabase repository live and deployed to Development
4. Authenticated Consumer recommendation smoke passed
5. Anon Consumer projection denial smoke passed
6. Consumer projection returns zero null-provenance rows
7. Consumer projection exposes no internal columns
8. Repository search: no direct client read of `menu_item_nutrition`
9. Repository search: no direct client read of `current_published_menu_item_nutrition`
10. Development deployment config audited
11. Restaurant Web deployment version audited
12. No known old client or manual tool depends on raw nutrition reads
13. `pg_depend` / `pg_rewrite` scan complete — all dependent views identified and dispositioned

## N4 Design (FUTURE PHASE 2V — NOT IN SCOPE)

Revoke SELECT on `restaurants`, `restaurant_branches`, `menus`, `menu_categories`, `menu_items`, `branch_menu_items`, activation-pack helper views — only after Restaurant Web safe projections deployed.

## Restaurant Owner Projection (BLOCKED PENDING TENANT ISOLATION INSPECTION)

Cannot be designed until:
- `restaurant_users` table existence and schema confirmed
- `auth.uid()` → `restaurant_id` mapping mechanism confirmed
- Multi-admin and revocation model confirmed
- DB-level isolation predicate designed and validated
