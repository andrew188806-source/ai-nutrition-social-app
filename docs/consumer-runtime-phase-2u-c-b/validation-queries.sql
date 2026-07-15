-- Read-only Development validation after a separately approved N3 deployment.
-- Do not execute against Production.

SELECT
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'menu_item_nutrition',
    'current_published_menu_item_nutrition',
    'restaurant_public_published_nutrition_v1',
    'consumer_public_next_meal_candidates_v1'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT
  has_table_privilege('anon', 'public.menu_item_nutrition', 'SELECT') AS anon_raw_select,
  has_table_privilege('authenticated', 'public.menu_item_nutrition', 'SELECT') AS authenticated_raw_select,
  has_table_privilege('anon', 'public.current_published_menu_item_nutrition', 'SELECT') AS anon_internal_select,
  has_table_privilege('authenticated', 'public.current_published_menu_item_nutrition', 'SELECT') AS authenticated_internal_select;

SELECT
  has_table_privilege('anon', 'public.restaurant_public_published_nutrition_v1', 'SELECT') AS anon_restaurant_safe_select,
  has_table_privilege('authenticated', 'public.restaurant_public_published_nutrition_v1', 'SELECT') AS authenticated_restaurant_safe_select,
  has_table_privilege('anon', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') AS anon_consumer_safe_select,
  has_table_privilege('authenticated', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') AS authenticated_consumer_safe_select;

SELECT
  count(*) AS restaurant_safe_row_count,
  count(*) FILTER (WHERE nutrition_source_public IS NULL) AS invalid_public_source_count
FROM public.restaurant_public_published_nutrition_v1;

SELECT count(*) AS consumer_safe_row_count
FROM public.consumer_public_next_meal_candidates_v1;
