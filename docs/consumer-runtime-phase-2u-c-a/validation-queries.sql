-- Read-only Development validation for Phase 2U-C-A after an approved deployment.
-- Do not execute against Production.

-- Exact ordered view columns.
SELECT
  ordinal_position,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'restaurant_public_published_nutrition_v1'
ORDER BY ordinal_position;

-- View definition: confirm security_barrier and the single approved upstream.
SELECT
  c.relname,
  c.reloptions,
  pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'restaurant_public_published_nutrition_v1';

-- Effective table/view privileges for the intended public roles.
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'restaurant_public_published_nutrition_v1'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- Projection invariants. No row payload is printed by these aggregate checks.
SELECT
  count(*) AS row_count,
  count(*) FILTER (WHERE nutrition_source_public IS NULL) AS null_public_source_count
FROM public.restaurant_public_published_nutrition_v1;
