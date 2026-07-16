-- Phase 2V-E Development-only read-only audit template.
-- Run only after separate Development approval with an approved actor session.
-- Replace the psql variable with an approved Development restaurant identifier.
-- Supply actor_jwt_claims_json at runtime through an approved credential-neutral
-- operator wrapper. Never commit, echo, or retain that value in plan evidence.
-- Never capture raw result rows; retain plans, counts, timing, buffers and payload bytes only.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- Establish approved actor identity only for this read-only transaction. This
-- prevents operator execution with empty claims from producing misleading
-- zero-row plans. The placeholder value is supplied at runtime and is not stored.
SELECT pg_catalog.set_config('request.jwt.claims', :'actor_jwt_claims_json', true) IS NOT NULL AS actor_claims_configured;
SELECT pg_catalog.current_setting('request.jwt.claims', true) IS NOT NULL AS actor_claims_present;

-- Object, owner, row-security and ACL inventory.
SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  c.relkind AS object_kind,
  pg_get_userbyid(c.relowner) AS owner_name,
  c.relrowsecurity,
  c.relforcerowsecurity,
  c.relacl
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories', 'menu_items',
    'branch_menu_items', 'restaurant_public_view', 'published_menus_view',
    'published_branch_menu_items_view', 'menu_item_nutrition',
    'current_published_menu_item_nutrition', 'restaurant_public_published_nutrition_v1',
    'consumer_public_next_meal_candidates_v1', 'restaurant_consumer_aggregate_metrics'
  )
ORDER BY c.relname;

-- Browser table/view and column privilege inventory.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'restaurant_membership_context_reader')
ORDER BY table_name, grantee, ordinal_position;

-- Function owner, ACL, volatility and security configuration.
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef,
  p.provolatile,
  p.proacl,
  p.proconfig
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'restaurant_current_access_context_v1',
    'restaurant_has_restaurant_permission',
    'restaurant_has_branch_permission',
    'restaurant_internal_restaurants_v1',
    'restaurant_internal_branches_v1',
    'restaurant_internal_menus_v1',
    'restaurant_internal_menu_categories_v1',
    'restaurant_internal_menu_items_v1',
    'restaurant_internal_branch_menu_items_v1',
    'restaurant_internal_current_nutrition_v1'
  )
ORDER BY p.proname;

-- Relevant table/index inventory and sizes.
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'restaurant_users', 'restaurant_memberships', 'restaurant_membership_branch_scopes',
    'restaurant_role_permissions', 'restaurants', 'restaurant_branches', 'menus',
    'menu_categories', 'menu_items', 'branch_menu_items', 'menu_item_nutrition'
  )
ORDER BY tablename, indexname;

SELECT
  c.relname AS table_name,
  c.reltuples::bigint AS estimated_rows,
  pg_catalog.pg_total_relation_size(c.oid) AS total_bytes
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'restaurant_users', 'restaurant_memberships', 'restaurant_membership_branch_scopes',
    'restaurants', 'restaurant_branches', 'menus', 'menu_categories', 'menu_items',
    'branch_menu_items', 'menu_item_nutrition'
  )
ORDER BY c.relname;

-- Execute each template under the approved actor's ordinary authenticated session.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_current_access_context_v1();

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_restaurants_v1();

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_branches_v1(:'restaurant_id');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_menus_v1(:'restaurant_id');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_menu_categories_v1(:'restaurant_id');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_menu_items_v1(:'restaurant_id');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_branch_menu_items_v1(:'restaurant_id');

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON)
SELECT * FROM public.restaurant_internal_current_nutrition_v1(:'restaurant_id');

ROLLBACK;
