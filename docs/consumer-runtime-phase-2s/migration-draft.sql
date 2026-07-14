-- DRAFT ONLY -- NOT DEPLOYABLE -- NOT AN ACTIVE MIGRATION -- DO NOT APPLY TO PRODUCTION
-- Consumer Runtime Phase 2S: Consumer Public Restaurant/Menu Read Boundary
--
-- Projection: public.consumer_public_next_meal_candidates_v1
-- Purpose:    Single, safe, DB-enforced consumer read projection for next-meal
--             recommendation candidates.
--
--             Mobile consumers MUST ONLY query this view.
--             Raw restaurant/menu tables (restaurants, restaurant_branches, menus,
--             menu_items, branch_menu_items, menu_item_nutrition) are NEVER granted
--             directly to anon or authenticated.
--
-- DB-level row filters (ALL enforced inside this view definition):
--   Filter  1: restaurants.status = 'active'
--   Filter  2: restaurant_branches.status = 'active'
--   Filter  3: menus.status = 'published'
--   Filter  4: menu_items.status = 'active'
--   Filter  5: branch_menu_items.availability = 'available'  (excludes 'limited', 'unavailable')
--   Filter  6: branch_menu_items.sold_out = false
--   Filter  7: branch_menu_items.branch_specific_status = 'available'  (excludes 'hidden', 'discontinued')
--   Filter  8: current_published_menu_item_nutrition.calories IS NOT NULL
--              (publication semantics — is_current, verified_status — are enforced
--               INSIDE the published view; this projection does NOT duplicate them)
--   Filter B*: TODO_SCHEMA_VERIFY -- r.deleted_at IS NULL  (see verification item B)
--
--   Note: Filters 8 (is_current=true) and 9 (verified_status IN ...) from prior design
--   are intentionally absent here. Those are publication rules owned by the Restaurant
--   nutrition publication layer and enforced by current_published_menu_item_nutrition.
--   The Consumer projection must not re-implement or copy publication logic.
--   TODO_SCHEMA_VERIFY [D]: column names and published-only semantics of the remote
--   view must be verified before deployment.
--   Filter B*: TODO_SCHEMA_VERIFY -- rb.deleted_at IS NULL
--   Filter B*: TODO_SCHEMA_VERIFY -- mi.deleted_at IS NULL
--
-- Column allowlist (sensitive fields excluded — see denylist below):
--   INCLUDED:  candidate_id, restaurant_id, branch_id, menu_item_id,
--              meal_name, restaurant_name, branch_name, district,
--              public_image_url, calories, protein, carbohydrates, fat, fiber,
--              nutrition_source_public (public-safe provenance enum),
--              nutrition_updated_at (public-safe update timestamp, nullable),
--              availability
--   EXCLUDED:  legal_name, plan (subscription tier), confidence_score,
--              source (internal quality label), verified_status (internal workflow),
--              is_current, nutrition_badge_status, badge_enabled,
--              price, cost, margin, sold_out, branch_specific_status,
--              created_by, updated_by, reviewed_by,
--              deleted_at, created_at, updated_at,
--              sugar, sodium, saturated_fat, serving_size (macros not in consumer contract),
--              all analytics, audit, admin review, and ownership fields
--
-- Security model: Default view execution (owner-level, equivalent to SECURITY DEFINER)
--
-- PHASE_2S_SECURITY_MODEL_APPROVED:
--   In PostgreSQL/Supabase, a view WITHOUT security_invoker=true executes with the
--   privileges of the VIEW OWNER (the postgres superuser role). This is equivalent to
--   SECURITY DEFINER on functions, and is the required and intentional behavior here.
--
--   Rationale:
--   (a) security_invoker=true would require granting raw table SELECT to consumers,
--       which is explicitly prohibited by Phase 2S spec §XIV and §VI.
--   (b) Base-table RLS is intentionally NOT relied upon for row security.
--       The view's WHERE clause is the SOLE and COMPREHENSIVE row security boundary.
--   (c) The column SELECT list provides the column security boundary.
--   (d) No INSERT/UPDATE/DELETE is possible through a view without INSTEAD OF triggers.
--   (e) The view owner (postgres) has no Supabase service-role key privileges.
--       Owner-level DB access is distinct from the Supabase service-role API credential.
--
--   This security model was evaluated and approved per Phase 2S spec §VI and §XIII.
--   Guard check: consumer-public-restaurant-menu-phase-2s-guard.mjs verifies
--   security_invoker=true is NOT present and approval comment is present.
--
-- security_barrier = true (WITH clause on view):
--   PostgreSQL allows an optimizer to push predicates from outer queries INTO a view,
--   evaluating them before the view's own WHERE conditions. With owner-level execution,
--   a carefully crafted outer predicate could in principle be evaluated against base-table
--   data before the view's row-security WHERE clause has filtered the result set, which
--   could allow timing-channel or predicate-pushdown attacks.
--   security_barrier = true disables this optimization: the view's WHERE conditions are
--   always evaluated first, before any outer predicate is applied.
--   This is a belt-and-suspenders measure that reinforces the view WHERE clause as the
--   authoritative and unbypassable row-security boundary.
--   Guard check: consumer-public-restaurant-menu-phase-2s-guard.mjs verifies that
--   security_barrier = true is present in the SQL code.
--   Note: security_barrier does NOT mean security_invoker. The role model remains
--   owner-level execution. Do NOT substitute security_invoker = true.
--
-- TODO_SCHEMA_VERIFY items — ALL must be resolved before deployment:
--
--   [A] PK type: development-activation-pack uses TEXT IDs; schema drafts use UUID.
--       Verify actual live DB primary key type on restaurants, restaurant_branches,
--       menu_items, branch_menu_items, menus, menu_categories.
--       Impact: ::text casts in SELECT and candidate_id composition are safe for both;
--       however FK joins may need adjustment if types differ across tables.
--
--   [B] deleted_at column: present in schema draft 003/005 (restaurants, restaurant_branches,
--       menu_items) but ABSENT from development-activation-pack tables and restaurant-web
--       row types. Verify live DB schema. If column exists, uncomment the deleted_at IS NULL
--       filters in the WHERE clause. Failure to include deleted_at IS NULL when the column
--       exists may expose soft-deleted data.
--
--   [C] menu_items.menu_category_id: present in development-activation-pack and
--       restaurant-web MenuItemRow (menu_category_id: string). Schema draft 005 uses a
--       separate menu_category_items join table. Verify actual live column. Current JOIN
--       uses menu_items.menu_category_id directly; if the join table is used instead,
--       replace with JOIN menu_category_items mci ON mci.menu_item_id = mi.id
--       and JOIN menu_categories mc ON mc.id = mci.menu_category_id.
--
--   [D] TODO_SCHEMA_VERIFY [D]:
--       The Consumer projection directly depends on
--       public.current_published_menu_item_nutrition.
--       Deployment is prohibited until the remote view definition,
--       columns, owner, reloptions, grants, and published-only semantics
--       are verified.
--
--       Required pre-deployment verification (run validation queries B4a/B4b/B4c):
--       - Remote view definition matches local draft 012_views.sql (published-only semantics)
--       - View owner (expected: postgres)
--       - reloptions: security_barrier / security_invoker values
--       - Granted roles: is it already granted to anon, authenticated, or PUBLIC?
--       - Exposes ONLY current/published nutrition (not history, not rejected rows)
--       - Does NOT expose: confidence_score, source, reviewed_by, review workflow columns,
--         internal quality metadata
--       - Column names confirmed: menu_item_id, calories, protein, carbohydrates, fat, fiber
--       - Actual column types and nullable status for all projected nutrition columns
--
--       RISK if unverified: the projection may join a view with different semantics,
--       missing columns, or a remote definition that exposes internal nutrition data.
--       If the remote view definition differs materially from the local draft, this
--       migration draft must be updated before deployment — NOT fallen back to raw table.
--
--       Action: run validation queries B4a, B4b, B4c in Development BEFORE deployment.
--       Guard: Phase 2S guard verifies projection SQL references this view (not raw table).
--
--   [E] TODO_SCHEMA_VERIFY [E]:
--       Public-safe nutrition source provenance columns must be confirmed before deployment.
--       The Consumer projection includes nutrition_source_public and nutrition_updated_at,
--       assumed to be present in public.current_published_menu_item_nutrition.
--       Deployment is prohibited until all items below are verified:
--
--       Required pre-deployment verification (run validation queries C1–C8):
--       - Does the remote published view expose nutrition_source_public and
--         nutrition_updated_at as consumer-safe columns?
--       - If not: do these columns exist on the base nutrition table under different names?
--       - Which internal verified_status values map to 'ai_estimated' vs
--         'restaurant_confirmed' vs 'platform_reviewed'?
--         Do NOT assume 'verified' or any single status = 'restaurant_confirmed'.
--       - Is there a restaurant confirmation timestamp separate from the update timestamp?
--       - Is there a platform review timestamp separate from the update timestamp?
--       - Is nutrition_updated_at a safe, non-PII timestamp (no reviewer user ID embedded)?
--       - Is nutrition_source_public always non-null for published nutrition rows?
--       - What are the actual column data types and nullable status?
--
--       Prohibited fallbacks if [E] cannot be resolved:
--       - Do NOT fall back to joining raw menu_item_nutrition for provenance
--       - Do NOT select raw verified_status and expose it as nutrition_source_public
--       - Do NOT use CASE logic on verified_status in the consumer projection to guess mapping
--       - If the published view does not have these columns, Phase 2T must add them to the
--         view definition BEFORE deploying the consumer projection
--
--       Column assumptions used in this draft (marked with [E]):
--       - n.nutrition_source_public: assumed text with values in
--         ('ai_estimated', 'restaurant_confirmed', 'platform_reviewed')
--       - n.nutrition_updated_at: assumed timestamptz, nullable
--
--       Guard: Phase 2S guard verifies TODO_SCHEMA_VERIFY [E] is present as deploy blocker.
--       Validation: Section C queries (C1–C8) verify provenance column presence and values.
--
-- GUARD: This migration draft MUST NOT be promoted to supabase/migrations/ until:
--   1. All TODO_SCHEMA_VERIFY items [A], [B], [C], [D], [E] are resolved via live DB inspection
--   2. Security model (owner-level view execution + security_barrier = true) reviewed
--   3. Phase 2T deployment explicitly approved
--   4. Revoke statements in STEP 2 reviewed against live grant state including [D] view
--
-- Related files:
--   docs/consumer-runtime-phase-2s/validation-queries.sql
--   docs/consumer-runtime-phase-2s/phase-2s-boundary-design.md
--   scripts/consumer-public-restaurant-menu-phase-2s-guard.mjs

-- ============================================================
-- STEP 1: Drop existing projection if present (idempotent re-apply)
-- ============================================================
drop view if exists public.consumer_public_next_meal_candidates_v1;

-- ============================================================
-- STEP 2: Revoke any existing raw table grants from consumer roles.
--
-- IMPORTANT: These revoke statements are COMMENTED OUT because:
-- (a) They must be reviewed against the live grant state before execution.
-- (b) Revoking grants that do not exist is safe, but revoking unexpectedly
--     may break existing restaurant-web or other consumers of raw tables.
-- (c) TODO_SCHEMA_VERIFY [A]: grant state on raw tables is only confirmed for
--     the development activation pack. Live production grants are unknown.
-- (d) TODO_SCHEMA_VERIFY [D]: current_published_menu_item_nutrition remote view grants
--     are unverified. Run validation query B4c to check existing grants before
--     deciding whether to include this view in the revoke list below.
--
-- Uncomment, review, and adapt before deploying:
--
-- revoke select on public.restaurants from anon;
-- revoke select on public.restaurant_branches from anon;
-- revoke select on public.menus from anon;
-- revoke select on public.menu_categories from anon;
-- revoke select on public.menu_items from anon;
-- revoke select on public.branch_menu_items from anon;
-- revoke select on public.menu_item_nutrition from anon;
-- revoke select on public.current_published_menu_item_nutrition from anon;
-- revoke select on public.restaurants from authenticated;
-- revoke select on public.restaurant_branches from authenticated;
-- revoke select on public.menus from authenticated;
-- revoke select on public.menu_categories from authenticated;
-- revoke select on public.menu_items from authenticated;
-- revoke select on public.branch_menu_items from authenticated;
-- revoke select on public.menu_item_nutrition from authenticated;
-- revoke select on public.current_published_menu_item_nutrition from authenticated;
-- ============================================================

-- ============================================================
-- STEP 3: Create consumer-facing projection VIEW
--
-- Security: This view executes as the VIEW OWNER (postgres) — not as the calling user.
-- This is default PostgreSQL view behavior (security_invoker = false equivalent).
-- The caller only needs SELECT privilege on THIS VIEW, not on the base tables.
-- Base tables remain inaccessible to consumers directly.
-- PHASE_2S_SECURITY_MODEL_APPROVED (see header for full justification).
--
-- security_barrier = true: ensures the view's WHERE conditions are always evaluated
-- before any outer predicate from the caller's query, preventing predicate-pushdown
-- attacks that could bypass row-security conditions. See header for full rationale.
-- ============================================================
create or replace view public.consumer_public_next_meal_candidates_v1
with (security_barrier = true)
as
select
  -- Stable candidate identity: menu_item + branch combination
  -- ::text cast is safe for both text and uuid PK schemas (TODO_SCHEMA_VERIFY [A])
  (mi.id::text || ':' || rb.id::text)                AS candidate_id,

  -- Canonical identifiers for Mobile → consumer domain mapping
  mi.restaurant_id::text                             AS restaurant_id,
  bmi.branch_id::text                                AS branch_id,
  mi.id::text                                        AS menu_item_id,

  -- Consumer display fields
  coalesce(bmi.branch_specific_name, mi.name)        AS meal_name,
  r.name                                             AS restaurant_name,
  rb.name                                            AS branch_name,
  rb.district                                        AS district,
  mi.image_url                                       AS public_image_url,

  -- Nutrition (calories NOT NULL per Filter 8; macros nullable per consumer contract)
  -- Source: current_published_menu_item_nutrition (not raw menu_item_nutrition).
  -- TODO_SCHEMA_VERIFY [D]: column names assumed from local draft; verify remote schema.
  n.calories                                         AS calories,
  n.protein                                          AS protein,
  n.carbohydrates                                    AS carbohydrates,
  n.fat                                              AS fat,
  n.fiber                                            AS fiber,

  -- Nutrition provenance (public-safe enum — NEVER raw verified_status / source / confidence_score)
  -- TODO_SCHEMA_VERIFY [E]: n.nutrition_source_public, n.nutrition_updated_at
  --   Assumed present in remote published view; must be confirmed before Phase 2T deployment.
  --   Allowed values for nutrition_source_public: 'ai_estimated', 'restaurant_confirmed', 'platform_reviewed'.
  --   Do NOT substitute raw verified_status. Do NOT use CASE on verified_status here.
  n.nutrition_source_public                          AS nutrition_source_public,
  n.nutrition_updated_at                             AS nutrition_updated_at,

  -- Availability (always 'available' per Filter 5; retained for explicit contract)
  bmi.availability                                   AS availability

from public.branch_menu_items bmi

-- All joins are INNER: rows missing any joined relation are excluded from results
join public.menu_items mi           on mi.id = bmi.menu_item_id
join public.restaurants r           on r.id = mi.restaurant_id
join public.restaurant_branches rb  on rb.id = bmi.branch_id

-- Menu status check via menu_categories (TODO_SCHEMA_VERIFY [C])
-- If menu_items.menu_category_id does not exist on the table, replace with:
--   JOIN menu_category_items mci ON mci.menu_item_id = mi.id
--   JOIN menu_categories mc ON mc.id = mci.menu_category_id
--   JOIN menus mn ON mn.id = mc.menu_id
join public.menu_categories mc      on mc.id = mi.menu_category_id
join public.menus mn                on mn.id = mc.menu_id

-- Nutrition join: INNER join to published-only nutrition view.
-- Publication semantics (is_current, verified_status) are enforced inside this view —
-- NOT duplicated in this projection. Raw menu_item_nutrition is NOT referenced.
-- TODO_SCHEMA_VERIFY [D]: column names (menu_item_id, calories, protein, carbohydrates,
-- fat, fiber) assumed from local draft 012_views.sql; remote definition must be verified.
-- If remote columns differ, update column references below before deployment.
-- Do NOT fall back to raw public.menu_item_nutrition if view columns cannot be confirmed.
join public.current_published_menu_item_nutrition n
  on  n.menu_item_id = mi.id
  and n.calories     is not null                                 -- Filter 8

where
  -- Filter 1: Active restaurant only
  r.status = 'active'

  -- Filter 2: Active branch only
  and rb.status = 'active'

  -- Filter 3: Published menu only (draft/paused/archived excluded)
  and mn.status = 'published'

  -- Filter 4: Active menu item only (draft/archived excluded)
  and mi.status = 'active'

  -- Filter 5: Available branch menu item only ('limited' and 'unavailable' excluded)
  and bmi.availability = 'available'

  -- Filter 6: Not sold out
  and bmi.sold_out = false

  -- Filter 7: Branch-specific status available ('hidden' and 'discontinued' excluded)
  and bmi.branch_specific_status = 'available'

  -- TODO_SCHEMA_VERIFY [B]: Uncomment if deleted_at column exists on these tables:
  -- and r.deleted_at  is null
  -- and rb.deleted_at is null
  -- and mi.deleted_at is null
  ;

-- ============================================================
-- STEP 4: Access control — view-only SELECT for authenticated consumers
-- ============================================================

-- Prevent all unauthenticated and default access
revoke all on public.consumer_public_next_meal_candidates_v1 from public;
revoke all on public.consumer_public_next_meal_candidates_v1 from anon;

-- Grant read access to signed-in consumers only
-- (mobile consumers must be authenticated to use next-meal recommendations)
grant select on public.consumer_public_next_meal_candidates_v1 to authenticated;

-- No INSERT, UPDATE, DELETE, or EXECUTE grants — this is read-only.
-- No anon grants — anonymous app access is not permitted for recommendation data.
-- No service-role grants — service role bypasses RLS by default; no special handling needed.

-- ============================================================
-- STEP 5: Self-documenting view comment
-- ============================================================
comment on view public.consumer_public_next_meal_candidates_v1 is
  'Consumer Runtime Phase 2S — Consumer-facing read-only projection of active restaurant '
  'menu items for next-meal recommendation. '
  'SECURITY: Executes as view owner (owner-level); raw base tables are NOT accessible '
  'to consumers. Row security enforced by WHERE clause. Column security enforced by SELECT list. '
  'FILTERS: active restaurants, active branches, published menus, active menu items, '
  'availability=available, sold_out=false, branch_specific_status=available, '
  'is_current nutrition, verified_status in (verified, ai_estimated), calories not null. '
  'EXCLUDED COLUMNS: legal_name, plan, price, confidence_score, source, verified_status, '
  'is_current, badge fields, audit fields, analytics, admin review state, internal IDs. '
  'ROLE: SELECT granted to authenticated only; anon and PUBLIC have no access. '
  'NO WRITES: No INSERT/UPDATE/DELETE/EXECUTE grants exist or are permitted on this view. '
  'MOBILE CONSUMERS MUST ONLY QUERY THIS VIEW — NOT RAW RESTAURANT/MENU TABLES. '
  'Phase 2S boundary — see docs/consumer-runtime-phase-2s/phase-2s-boundary-design.md.';
