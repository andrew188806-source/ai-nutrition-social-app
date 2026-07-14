-- Consumer Runtime Phase 2U Validation Queries
-- Read-only. All statements are SELECT only.
-- Run against Development Supabase via: npx supabase db query --linked "<sql>"

-- ============================================================
-- Pre-deployment gates (run before N1)
-- ============================================================

-- Gate A: Unknown provenance — must return zero rows
-- select
--   n.source,
--   n.verified_status,
--   count(*) as row_count
-- from public.menu_item_nutrition n
-- where n.is_current = true
--   and n.verified_status in ('verified', 'ai_estimated')
--   and (
--     n.source is null
--     or n.source not in ('ai_estimated', 'restaurant_verified', 'platform_reviewed')
--   )
-- group by n.source, n.verified_status;

-- Gate B: Published row uniqueness — must return zero rows
-- select
--   menu_item_id,
--   count(*) as published_row_count
-- from public.current_published_menu_item_nutrition
-- group by menu_item_id
-- having count(*) > 1;

-- Gate C: Partial unique index — must return exactly one row
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'menu_item_nutrition'
--   and indexname = 'menu_item_nutrition_one_current';

-- Gate D: Branch-menu uniqueness — must include branch_id+menu_item_id unique index
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'branch_menu_items';

-- ============================================================
-- Post-N1 validation
-- ============================================================

-- N1-V1: View exists with new columns
select column_name, data_type, ordinal_position
from information_schema.columns
where table_schema = 'public'
  and table_name = 'current_published_menu_item_nutrition'
order by ordinal_position;
-- Expected: 18 rows (16 original + nutrition_source_public + nutrition_updated_at at positions 17, 18)

-- N1-V2: nutrition_source_public mapping correctness
select
  source,
  nutrition_source_public,
  count(*) as row_count
from public.current_published_menu_item_nutrition
group by source, nutrition_source_public
order by source;
-- Expected: 'ai_estimated' → 'ai_estimated', 'restaurant_verified' → 'restaurant_confirmed'
-- No row where nutrition_source_public IS NULL and source IS NOT NULL with a known value

-- N1-V3: Unknown source still produces NULL
select count(*) as null_provenance_count
from public.current_published_menu_item_nutrition
where nutrition_source_public is null;
-- Must be zero — if non-zero, there are unknown source values present that produce NULL
-- These are Phase 2U-C blockers (must investigate before N3)

-- N1-V4: View owner preserved
select pg_get_userbyid(relowner) as owner
from pg_class
where relname = 'current_published_menu_item_nutrition'
  and relnamespace = 'public'::regnamespace;
-- Expected: postgres

-- N1-V5: Grants preserved (anon, authenticated SELECT still present — N3 not yet executed)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'current_published_menu_item_nutrition'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
-- Expected: anon SELECT, authenticated SELECT (grants preserved by OR REPLACE)

-- ============================================================
-- Post-N2 validation
-- ============================================================

-- N2-V1: View exists
select viewname, definition
from pg_views
where schemaname = 'public'
  and viewname = 'consumer_public_next_meal_candidates_v1';
-- Must return one row

-- N2-V2: security_barrier = true in reloptions
select reloptions
from pg_class
where relname = 'consumer_public_next_meal_candidates_v1'
  and relnamespace = 'public'::regnamespace;
-- Must include 'security_barrier=true'

-- N2-V3: Column list (no internal columns)
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'consumer_public_next_meal_candidates_v1'
order by ordinal_position;
-- Must NOT include: source, confidence_score, verified_status, is_current, verified_by

-- N2-V4: Grants — authenticated SELECT, no anon, no PUBLIC
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'consumer_public_next_meal_candidates_v1'
order by grantee, privilege_type;
-- Expected: authenticated → SELECT only; no anon; no PUBLIC

-- N2-V5: Anon privilege check — must be false
select
  has_table_privilege('anon', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') as anon_can_read,
  has_table_privilege('authenticated', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') as authenticated_can_read;
-- Expected: anon_can_read=false, authenticated_can_read=true

-- N2-V6: No duplicate candidates (uniqueness guaranteed by constraints)
select candidate_id, count(*) as count
from public.consumer_public_next_meal_candidates_v1
group by candidate_id
having count(*) > 1;
-- Must return zero rows

-- N2-V7: All rows have non-null calories and nutrition_source_public
select count(*) as invalid_rows
from public.consumer_public_next_meal_candidates_v1
where calories is null or nutrition_source_public is null;
-- Must return zero rows

-- ============================================================
-- Helper-view dependency scan (use before N3 in Phase 2U-B)
-- ============================================================

-- Direct dependencies on menu_item_nutrition
-- (Uses pg_rewrite, not the incorrect pg_depend.objid → pg_class.oid pattern)
select distinct
  view_ns.nspname as view_schema,
  view_cls.relname as view_name,
  view_cls.relkind,
  pg_get_userbyid(view_cls.relowner) as owner
from pg_depend dep
join pg_rewrite rewrite_rule on rewrite_rule.oid = dep.objid
join pg_class view_cls on view_cls.oid = rewrite_rule.ev_class
join pg_namespace view_ns on view_ns.oid = view_cls.relnamespace
where dep.refobjid = 'public.menu_item_nutrition'::regclass
  and dep.deptype = 'n'
  and view_cls.relkind in ('v', 'm')
order by view_schema, view_name;

-- Grants on each discovered view
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('current_published_menu_item_nutrition', 'consumer_public_next_meal_candidates_v1')
order by table_name, grantee, privilege_type;

-- ============================================================
-- N3 post-deployment assertions (PHASE 2U-C ONLY)
-- ============================================================

-- Run after N3 executes. All four must be false.
-- select
--   has_table_privilege('anon', 'public.menu_item_nutrition', 'SELECT') as anon_can_read_raw_nutrition,
--   has_table_privilege('authenticated', 'public.menu_item_nutrition', 'SELECT') as authenticated_can_read_raw_nutrition,
--   has_table_privilege('anon', 'public.current_published_menu_item_nutrition', 'SELECT') as anon_can_read_internal_view,
--   has_table_privilege('authenticated', 'public.current_published_menu_item_nutrition', 'SELECT') as authenticated_can_read_internal_view;

-- Projection must still be readable after N3:
-- select has_table_privilege('authenticated', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') as consumer_projection_accessible;
-- Must be true.
