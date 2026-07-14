-- DRAFT ONLY -- NOT AN ACTIVE MIGRATION -- DO NOT APPLY TO PRODUCTION
-- Consumer Runtime Phase 2S: Validation Queries for consumer_public_next_meal_candidates_v1
--
-- Purpose:  Read-only validation queries to verify the Phase 2S projection is correctly
--           configured after deployment in a development/staging environment.
--           Run these queries ONLY in a disposable development database.
--           All queries return rows only on FAILURE (empty result = pass).
--           Exception: queries 1, 2, 13, 14, 15, 16, 17, 18 may return non-row results.
--
-- DO NOT run against Production. DO NOT run against shared development databases.
-- DO NOT promote these queries to supabase/migrations/ (validation-only SELECTs).
-- Phase 2S deployment has NOT occurred; these queries cannot yet be executed remotely.

-- ============================================================
-- Query 1: Projection exists
-- Expected: returns row with relkind = 'v'
-- ============================================================
select relname, relkind
from pg_class pc
join pg_namespace pn on pn.oid = pc.relnamespace
where pn.nspname = 'public'
  and pc.relname = 'consumer_public_next_meal_candidates_v1'
  and pc.relkind = 'v';
-- FAIL if result is empty (view does not exist)

-- ============================================================
-- Query 2: Column list matches allowlist exactly
-- Expected: returns exactly these columns and no others
-- ============================================================
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'consumer_public_next_meal_candidates_v1'
order by ordinal_position;
-- FAIL if result contains any column NOT in:
--   candidate_id, restaurant_id, branch_id, menu_item_id,
--   meal_name, restaurant_name, branch_name, district, public_image_url,
--   calories, protein, carbohydrates, fat, fiber, availability

-- ============================================================
-- Query 3: No sensitive columns present
-- Expected: empty result
-- ============================================================
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'consumer_public_next_meal_candidates_v1'
  and column_name in (
    'legal_name', 'plan', 'confidence_score', 'source', 'verified_status',
    'is_current', 'nutrition_badge_status', 'badge_enabled',
    'price', 'cost', 'margin', 'sold_out', 'branch_specific_status',
    'created_by', 'updated_by', 'reviewed_by',
    'deleted_at', 'created_at', 'updated_at',
    'sugar', 'sodium', 'saturated_fat', 'serving_size',
    'tag_ids', 'allergens', 'description', 'category', 'city',
    'latitude', 'longitude', 'address',
    'nutrition_id', 'menu_category_id',
    'restaurant_id_raw', 'branch_menu_item_id'
  );
-- FAIL if any rows returned (forbidden column found in view)

-- ============================================================
-- Query 4: No draft menus visible
-- Expected: empty result
-- ============================================================
select c.candidate_id, c.restaurant_name, c.meal_name
from public.consumer_public_next_meal_candidates_v1 c
join public.menu_items mi   on mi.id = c.menu_item_id
join public.menu_categories mc on mc.id = mi.menu_category_id
join public.menus mn        on mn.id = mc.menu_id
where mn.status = 'draft';
-- FAIL if any rows returned (draft menu item visible through projection)

-- ============================================================
-- Query 5: No archived menus visible
-- Expected: empty result
-- ============================================================
select c.candidate_id, c.restaurant_name, c.meal_name
from public.consumer_public_next_meal_candidates_v1 c
join public.menu_items mi   on mi.id = c.menu_item_id
join public.menu_categories mc on mc.id = mi.menu_category_id
join public.menus mn        on mn.id = mc.menu_id
where mn.status in ('archived', 'paused');
-- FAIL if any rows returned (non-published menu visible through projection)

-- ============================================================
-- Query 6: No draft or archived menu items visible
-- Expected: empty result
-- ============================================================
select c.candidate_id, c.meal_name
from public.consumer_public_next_meal_candidates_v1 c
join public.menu_items mi on mi.id = c.menu_item_id
where mi.status in ('draft', 'archived');
-- FAIL if any rows returned

-- ============================================================
-- Query 7: No inactive or non-active branches visible
-- Expected: empty result
-- ============================================================
select c.candidate_id, c.branch_name
from public.consumer_public_next_meal_candidates_v1 c
join public.restaurant_branches rb on rb.id = c.branch_id
where rb.status != 'active';
-- FAIL if any rows returned (inactive/closed/archived branch visible)

-- ============================================================
-- Query 8: No unavailable or limited branch-menu items visible
-- Expected: empty result (availability must always = 'available')
-- ============================================================
select c.candidate_id, c.availability
from public.consumer_public_next_meal_candidates_v1 c
where c.availability != 'available';
-- FAIL if any rows returned (limited or unavailable items visible)

-- ============================================================
-- Query 9: No sold-out items visible
-- Expected: empty result
-- ============================================================
select c.candidate_id
from public.consumer_public_next_meal_candidates_v1 c
join public.branch_menu_items bmi
  on  bmi.menu_item_id = c.menu_item_id
  and bmi.branch_id    = c.branch_id
where bmi.sold_out = true;
-- FAIL if any rows returned

-- ============================================================
-- Query 10: No unpublished or unverified nutrition visible
-- Expected: empty result
-- ============================================================
select c.candidate_id
from public.consumer_public_next_meal_candidates_v1 c
join public.menu_item_nutrition n on n.menu_item_id = c.menu_item_id
where n.is_current = false
   or n.verified_status not in ('verified', 'ai_estimated');
-- FAIL if any rows returned (rejected or pending nutrition visible)

-- ============================================================
-- Query 11: No soft-deleted data visible
-- TODO_SCHEMA_VERIFY [B]: Run this query only if deleted_at column exists.
-- If deleted_at does not exist on these tables, skip this query.
-- Expected: empty result
-- ============================================================
-- select c.candidate_id
-- from public.consumer_public_next_meal_candidates_v1 c
-- join public.restaurants r on r.id = c.restaurant_id
-- where r.deleted_at is not null;
-- FAIL if any rows returned
--
-- Analogous for restaurant_branches and menu_items:
-- select c.candidate_id
-- from public.consumer_public_next_meal_candidates_v1 c
-- join public.menu_items mi on mi.id = c.menu_item_id
-- where mi.deleted_at is not null;

-- ============================================================
-- Query 12: All calories are NOT NULL
-- Expected: empty result
-- ============================================================
select candidate_id
from public.consumer_public_next_meal_candidates_v1
where calories is null;
-- FAIL if any rows returned

-- ============================================================
-- Query 13: candidate_id is unique
-- Expected: empty result (no duplicates)
-- ============================================================
select candidate_id, count(*) as duplicate_count
from public.consumer_public_next_meal_candidates_v1
group by candidate_id
having count(*) > 1;
-- FAIL if any rows returned (duplicate candidate_id)

-- ============================================================
-- Query 14: menu_item × branch combination is unique
-- Expected: empty result
-- ============================================================
select menu_item_id, branch_id, count(*) as duplicate_count
from public.consumer_public_next_meal_candidates_v1
group by menu_item_id, branch_id
having count(*) > 1;
-- FAIL if any rows returned

-- ============================================================
-- Query 15: anon role has NO access to the projection
-- Expected: no privilege row for anon
-- ============================================================
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'consumer_public_next_meal_candidates_v1'
  and grantee      = 'anon';
-- FAIL if any rows returned (anon should have no privileges)

-- ============================================================
-- Query 16: authenticated role has ONLY SELECT on projection
-- Expected: exactly one row: (authenticated, SELECT)
-- ============================================================
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'consumer_public_next_meal_candidates_v1'
  and grantee      = 'authenticated';
-- FAIL if result is empty (no grant) or contains INSERT/UPDATE/DELETE

-- ============================================================
-- Query 17: Raw restaurant/menu tables have no additional SELECT grants to anon or authenticated
-- Expected: only grants that existed BEFORE Phase 2S deployment appear
-- (Run this before and after deployment to diff the grant state)
-- ============================================================
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories',
    'menu_items', 'branch_menu_items', 'menu_item_nutrition',
    'current_published_menu_item_nutrition'
  )
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'SELECT'
order by table_name, grantee;
-- VERIFY: Compare result to pre-deployment baseline. Phase 2S should not ADD new raw table grants.

-- ============================================================
-- Query 17b: No INSERT, UPDATE, DELETE, EXECUTE grants on raw tables or projection
-- Expected: empty result
-- ============================================================
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'consumer_public_next_meal_candidates_v1',
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories',
    'menu_items', 'branch_menu_items', 'menu_item_nutrition'
  )
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
-- FAIL if any rows returned (write grants must not exist)

-- ============================================================
-- Query 18: View cannot expose admin or analytics columns
-- Expected: empty result
-- ============================================================
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'consumer_public_next_meal_candidates_v1'
  and column_name in (
    -- Analytics
    'impressions', 'clicks', 'store_page_views', 'new_user_reach',
    'before_views', 'after_views', 'before_add_to_cart', 'after_add_to_cart',
    'views', 'favorites', 'add_to_cart', 'recommendation_impressions',
    -- Admin review workflow
    'reviewed_by', 'reviewer_id', 'review_status', 'review_note',
    'nutrition_id', 'estimate_id', 'before_data', 'after_data', 'reason',
    -- Subscription/commercial
    'plan', 'legal_name', 'cost', 'margin',
    -- Internal quality metadata
    'confidence_score', 'source', 'verified_status', 'is_current',
    -- Audit
    'created_by', 'updated_by', 'changed_by', 'deleted_at',
    -- Badge management
    'nutrition_badge_status', 'badge_enabled'
  );
-- FAIL if any rows returned (admin/analytics column visible in consumer projection)

-- ============================================================
-- Query 19: View has security_barrier = true in reloptions
-- Expected: one row; reloptions array must contain 'security_barrier=true'
-- Run AFTER deployment (cannot run before view exists)
-- ============================================================
select pc.relname, pc.reloptions
from pg_class pc
join pg_namespace pn on pn.oid = pc.relnamespace
where pn.nspname = 'public'
  and pc.relname = 'consumer_public_next_meal_candidates_v1';
-- FAIL if result is empty (view missing)
-- FAIL if reloptions is NULL or does not contain 'security_barrier=true'

-- ============================================================
-- SECTION A-ext: Projection Nutrition Dependency Verification (Post-Deployment)
--
-- Purpose: Verify that the deployed projection depends on the published nutrition view,
--          NOT on raw menu_item_nutrition.
-- TODO_SCHEMA_VERIFY [D]: Run B4 queries first to verify the remote published view
--   definition matches expected semantics before relying on these checks.
-- ============================================================

-- ─── A-ext-1: Projection view definition references current_published_menu_item_nutrition ──
-- Expected: view definition text contains 'current_published_menu_item_nutrition'
select pg_get_viewdef('public.consumer_public_next_meal_candidates_v1'::regclass, true) as view_definition;
-- FAIL if view_definition does not contain 'current_published_menu_item_nutrition'
-- VERIFY: Confirm the published view is the nutrition join target (not raw menu_item_nutrition)

-- ─── A-ext-2: Projection view definition does NOT directly reference raw menu_item_nutrition ──
-- Expected: view_definition does NOT contain standalone 'public.menu_item_nutrition'
--   (current_published_menu_item_nutrition is acceptable as a substring of itself, not raw)
select pg_get_viewdef('public.consumer_public_next_meal_candidates_v1'::regclass, false) as view_definition_compact;
-- Manual check: search returned text for 'join public.menu_item_nutrition' or
--   'from public.menu_item_nutrition' — these must NOT appear as raw table references.
--   'current_published_menu_item_nutrition' appearing is correct and expected.

-- ─── A-ext-3: pg_depend confirms projection depends on published view (not raw table) ──
-- Expected: dependency on current_published_menu_item_nutrition, not menu_item_nutrition
select
  ref_cls.relname  as referenced_object,
  dep_cls.relname  as dependent_object,
  pg_describe_object(dep.classid, dep.objid, 0) as dep_description
from pg_depend dep
join pg_class dep_cls on dep_cls.oid = dep.objid
join pg_class ref_cls on ref_cls.oid = dep.refobjid
join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
join pg_namespace ref_ns on ref_ns.oid = ref_cls.relnamespace
where dep_ns.nspname  = 'public'
  and dep_cls.relname = 'consumer_public_next_meal_candidates_v1'
  and ref_ns.nspname  = 'public'
  and ref_cls.relname in ('menu_item_nutrition', 'current_published_menu_item_nutrition')
order by ref_cls.relname;
-- FAIL if result contains a dependency on raw 'menu_item_nutrition'
-- PASS if dependency is on 'current_published_menu_item_nutrition' only
-- Note: if published view is a VIEW over menu_item_nutrition, the projection may show
--   an indirect dependency on menu_item_nutrition — this is expected and acceptable.
--   A DIRECT dependency on menu_item_nutrition from the projection is NOT acceptable.

-- ─── A-ext-4: Published view does not expose sensitive nutrition columns ──────
-- Expected: empty result (no forbidden columns in current_published_menu_item_nutrition)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
  and column_name in (
    'confidence_score', 'source', 'reviewed_by', 'review_status', 'review_note',
    'estimate_id', 'before_data', 'after_data', 'reason',
    'created_by', 'updated_by', 'changed_by',
    'nutrition_badge_status', 'badge_enabled'
  );
-- FAIL if any rows returned — sensitive columns exist in published nutrition view
-- If this fails, the Consumer projection must NOT use this view until it is narrowed.

-- ─── A-ext-5: Projection calories are always NOT NULL ──────────────────────
-- (Unchanged from Query 12 — preserved for completeness in post-nutrition-join context)
select candidate_id
from public.consumer_public_next_meal_candidates_v1
where calories is null;
-- FAIL if any rows returned (null calories visible — should have been excluded by view join)

-- ─── A-ext-6: Projection nullable macros are preserved as null, not coalesced to 0 ──
-- Expected: null protein rows exist when nutrition is incomplete (not all zeros)
-- This query is observational — compare against raw published view for same menu_item_id
select c.candidate_id, c.protein, c.carbohydrates, c.fat, c.fiber,
       n.protein as src_protein, n.carbohydrates as src_carbs, n.fat as src_fat, n.fiber as src_fiber
from public.consumer_public_next_meal_candidates_v1 c
join public.current_published_menu_item_nutrition n on n.menu_item_id = c.menu_item_id
where (c.protein = 0 and n.protein is null)
   or (c.carbohydrates = 0 and n.carbohydrates is null)
   or (c.fat = 0 and n.fat is null)
   or (c.fiber = 0 and n.fiber is null);
-- FAIL if any rows returned (null macro was coalesced to 0 — data corruption)

-- ============================================================
-- SECTION B: Pre-Deployment Baseline Inspection Queries
--
-- Purpose: Record the current privilege, ownership, RLS, and policy state of raw
--          restaurant/menu tables and existing views BEFORE deploying Phase 2S.
--          Run in Development only. Compare result AFTER deployment to verify
--          Phase 2S did not expand any raw table access.
--
-- TODO_SCHEMA_VERIFY [D]: Queries B4 and B5 are required for [D] resolution.
-- All queries in this section are INFORMATIONAL — not pass/fail.
-- DO NOT run against Production. DO NOT include in supabase/migrations/.
-- ============================================================

-- ─── B1: SELECT privileges on raw restaurant/menu tables (pre-deployment baseline) ──
select table_schema, table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories',
    'menu_items', 'branch_menu_items', 'menu_item_nutrition',
    'current_published_menu_item_nutrition'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC', 'public')
order by table_name, grantee, privilege_type;
-- Record as PRE-DEPLOYMENT baseline.
-- After deployment: re-run and diff — Phase 2S must add NO new rows to this result.

-- ─── B2: Table/view owners and reloptions ────────────────────────────────
select
  pn.nspname                                                as schema,
  pc.relname                                                as name,
  case pc.relkind
    when 'r' then 'table'
    when 'v' then 'view'
    when 'm' then 'matview'
    else pc.relkind::text
  end                                                       as kind,
  pg_catalog.pg_get_userbyid(pc.relowner)                  as owner,
  pc.reloptions
from pg_class pc
join pg_namespace pn on pn.oid = pc.relnamespace
where pn.nspname = 'public'
  and pc.relname in (
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories',
    'menu_items', 'branch_menu_items', 'menu_item_nutrition',
    'current_published_menu_item_nutrition'
  )
order by pc.relname;
-- Record: owner and reloptions (security_barrier, security_invoker) for each object.
-- Verify: current_published_menu_item_nutrition owner matches expected.

-- ─── B3: RLS enabled and forced status on raw base tables ─────────────────
select
  pn.nspname                  as schema,
  pc.relname                  as name,
  pc.relrowsecurity           as rls_enabled,
  pc.relforcerowsecurity      as rls_forced
from pg_class pc
join pg_namespace pn on pn.oid = pc.relnamespace
where pn.nspname = 'public'
  and pc.relname in (
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories',
    'menu_items', 'branch_menu_items', 'menu_item_nutrition'
  )
order by pc.relname;
-- Record: RLS state per table. Phase 2S relies on view WHERE clause, not base-table RLS.
-- Verify: if RLS is enabled on base tables, check whether policies include consumer roles.

-- ─── B4: TODO_SCHEMA_VERIFY [D] — current_published_menu_item_nutrition view ──
-- Step B4a: View definition and reloptions
select
  pc.relname,
  pg_catalog.pg_get_userbyid(pc.relowner)  as owner,
  pc.reloptions,
  pg_get_viewdef('public.current_published_menu_item_nutrition'::regclass, true) as view_definition
from pg_class pc
join pg_namespace pn on pn.oid = pc.relnamespace
where pn.nspname = 'public'
  and pc.relname = 'current_published_menu_item_nutrition';
-- Verify: view definition matches local draft 012_views.sql.
-- Check: does it expose confidence_score, source, reviewed_by, or other sensitive columns?
-- Check: reloptions — does it have security_barrier or security_invoker set?

-- Step B4b: Column list of current_published_menu_item_nutrition
select column_name, data_type, is_nullable, ordinal_position
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
order by ordinal_position;
-- Verify: columns are limited to safe nutrition fields.
-- FAIL CONDITION: if confidence_score, source, reviewed_by, review_status, or
--   any admin/internal column appears, this view must NOT be granted to consumers.
-- Record: nullable status of calories, protein, carbohydrates, fat, fiber.

-- Step B4c: Grants on current_published_menu_item_nutrition
select grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
  and grantee in ('anon', 'authenticated', 'PUBLIC', 'public');
-- Record: any existing consumer grants.
-- If grants exist, Phase 2T STEP 2 must include revoke statements for this view
-- (currently commented out in migration-draft.sql pending this verification).

-- ─── B5: Existing RLS policies on raw restaurant/menu tables ─────────────
select
  n.nspname                                          as schema,
  pc.relname                                         as table_name,
  p.polname                                          as policy_name,
  p.polcmd                                           as command,
  p.polpermissive                                    as permissive,
  pg_get_expr(p.polqual, p.polrelid)                 as using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid)            as with_check_expr,
  array_to_string(p.polroles::text[], ', ')          as roles
from pg_policy p
join pg_class pc  on pc.oid = p.polrelid
join pg_namespace n on n.oid = pc.relnamespace
where n.nspname = 'public'
  and pc.relname in (
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories',
    'menu_items', 'branch_menu_items', 'menu_item_nutrition'
  )
order by pc.relname, p.polname;
-- Record: all existing RLS policies.
-- Compare against local draft 013_rls_policy_drafts.sql.
-- Verify: policies match what Phase 2S and Phase 2T rely on.
-- Note: Phase 2S does NOT rely on base-table RLS for consumer row security.
--       The view WHERE clause is the sole consumer row-security boundary.

-- ============================================================
-- SECTION C: Nutrition Provenance Verification
--
-- Purpose: Verify that public.current_published_menu_item_nutrition exposes
--          public-safe provenance columns (nutrition_source_public, nutrition_updated_at)
--          and that no raw internal provenance columns are visible to consumers.
--
-- TODO_SCHEMA_VERIFY [E]: ALL queries in this section MUST pass before Phase 2T deployment.
-- These queries require the remote view to already include provenance columns.
-- If C1 or C2 fail, Phase 2T must add these columns to the view BEFORE deploying
-- the consumer projection. Do NOT substitute raw verified_status.
-- Run in Development only. DO NOT run against Production.
-- DO NOT include in supabase/migrations/ (validation-only SELECTs).
-- ============================================================

-- ─── C1: Published view has nutrition_source_public column ─────────────────
-- Expected: returns row with column_name = 'nutrition_source_public'
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
  and column_name  = 'nutrition_source_public';
-- FAIL if empty: remote view does not expose nutrition_source_public.
-- If this fails: Phase 2T must add nutrition_source_public to the view definition BEFORE
-- deploying the consumer projection. Do NOT expose raw verified_status as a substitute.

-- ─── C2: Published view has nutrition_updated_at column ────────────────────
-- Expected: returns row with column_name = 'nutrition_updated_at'
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
  and column_name  = 'nutrition_updated_at';
-- FAIL if empty: remote view does not expose nutrition_updated_at.
-- If this fails: Phase 2T may omit nutrition_updated_at from the consumer projection
-- (it is an optional enhancement), but must document the omission and update the draft.

-- ─── C3: nutrition_source_public values are within approved allowlist ───────
-- Expected: empty result (all values within approved set; no unapproved values)
select distinct nutrition_source_public
from public.current_published_menu_item_nutrition
where nutrition_source_public not in ('ai_estimated', 'restaurant_confirmed', 'platform_reviewed');
-- FAIL if any rows returned: unapproved nutrition_source_public values exist.
-- Approved allowlist: 'ai_estimated', 'restaurant_confirmed', 'platform_reviewed'.
-- Do NOT add values that expose internal review workflow states.

-- ─── C4: nutrition_source_public is never null in published rows ────────────
-- Expected: null_source_count = 0
select count(*) as null_source_count
from public.current_published_menu_item_nutrition
where nutrition_source_public is null;
-- FAIL if count > 0: published nutrition rows exist with no provenance classification.
-- Every row in the published view must have a non-null nutrition_source_public value.

-- ─── C5: Consumer projection nutrition_source_public matches published view ─
-- Expected: empty result (no mismatch between projection and published view source values)
select
  c.candidate_id,
  c.nutrition_source_public  as proj_source,
  n.nutrition_source_public  as view_source
from public.consumer_public_next_meal_candidates_v1 c
join public.current_published_menu_item_nutrition n on n.menu_item_id = c.menu_item_id
where c.nutrition_source_public is distinct from n.nutrition_source_public;
-- FAIL if any rows returned: projection source value does not match published view source.
-- Mismatch would indicate the column is being derived from a different source.

-- ─── C6: Consumer projection does not expose raw verified_status or source ──
-- Expected: empty result (no raw internal provenance columns in projection column list)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'consumer_public_next_meal_candidates_v1'
  and column_name in (
    'verified_status', 'source', 'confidence_score',
    'reviewed_by', 'review_status', 'review_note',
    'is_current', 'before_data', 'after_data',
    'nutrition_badge_status', 'badge_enabled'
  );
-- FAIL if any rows returned: internal nutrition columns are exposed in consumer projection.
-- Consumer projection must only expose nutrition_source_public (mapped, safe values).
-- Raw verified_status must NOT appear as a column alias or under any other name.

-- ─── C7: nutrition_updated_at is a timestamp type in published view (nullable) ──
-- Expected: returns row with data_type = 'timestamp with time zone' (or similar timestamp type)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
  and column_name  = 'nutrition_updated_at'
  and data_type in (
    'timestamp with time zone', 'timestamp without time zone', 'date'
  );
-- FAIL if empty: either column does not exist or is not a recognized timestamp type.
-- Timestamp type required — text or integer would require explicit conversion in Phase 2T.

-- ─── C8: Published view does not expose reviewer/workflow internal columns ──
-- Expected: empty result (no workflow internals exposed in published view)
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'current_published_menu_item_nutrition'
  and column_name in (
    'verified_status', 'source', 'confidence_score',
    'reviewed_by', 'review_status', 'review_note',
    'is_current', 'before_data', 'after_data', 'reason',
    'nutrition_badge_status', 'badge_enabled',
    'created_by', 'updated_by', 'changed_by'
  );
-- FAIL if any rows returned: reviewer/workflow internal columns exist in published nutrition view.
-- If this fails, the view definition must be narrowed before Phase 2T deployment.
-- Note: A-ext-4 covers a subset of these columns; C8 is the comprehensive workflow check.
