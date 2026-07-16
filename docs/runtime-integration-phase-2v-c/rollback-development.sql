-- DEVELOPMENT MANUAL REVIEW ONLY. PRODUCTION USE IS PROHIBITED.
-- This is a two-stage destructive rollback plan and is not an active migration.

-- STAGE 1: run only in restaurant_membership_context_reader owner context.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.restaurant_internal_current_nutrition_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_internal_branch_menu_items_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_internal_menu_items_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_internal_menu_categories_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_internal_menus_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_internal_branches_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_internal_restaurants_v1() FROM authenticated;

DROP FUNCTION public.restaurant_internal_current_nutrition_v1(text);
DROP FUNCTION public.restaurant_internal_branch_menu_items_v1(text);
DROP FUNCTION public.restaurant_internal_menu_items_v1(text);
DROP FUNCTION public.restaurant_internal_menu_categories_v1(text);
DROP FUNCTION public.restaurant_internal_menus_v1(text);
DROP FUNCTION public.restaurant_internal_branches_v1(text);
DROP FUNCTION public.restaurant_internal_restaurants_v1();

COMMIT;

-- STOP. STAGE 2 requires a separately approved deployment-role connection.
BEGIN;

DROP POLICY menu_item_nutrition_internal_access_permit ON public.menu_item_nutrition;
DROP POLICY menu_item_nutrition_internal_tenant_restrict ON public.menu_item_nutrition;
DROP POLICY branch_menu_items_internal_access_permit ON public.branch_menu_items;
DROP POLICY branch_menu_items_internal_tenant_restrict ON public.branch_menu_items;
DROP POLICY menu_items_internal_access_permit ON public.menu_items;
DROP POLICY menu_items_internal_tenant_restrict ON public.menu_items;
DROP POLICY menu_categories_internal_access_permit ON public.menu_categories;
DROP POLICY menu_categories_internal_tenant_restrict ON public.menu_categories;
DROP POLICY menus_internal_access_permit ON public.menus;
DROP POLICY menus_internal_tenant_restrict ON public.menus;
DROP POLICY restaurant_branches_internal_access_permit ON public.restaurant_branches;
DROP POLICY restaurant_branches_internal_tenant_restrict ON public.restaurant_branches;
DROP POLICY restaurants_internal_access_permit ON public.restaurants;
DROP POLICY restaurants_internal_tenant_restrict ON public.restaurants;

REVOKE SELECT (
  id, menu_item_id, calories, protein, carbohydrates, fat, fiber, sugar,
  sodium, saturated_fat, serving_size, verified_status, is_current
) ON TABLE public.menu_item_nutrition FROM restaurant_membership_context_reader;
REVOKE SELECT (
  id, restaurant_id, branch_id, menu_item_id, price, availability, sold_out,
  branch_specific_name, branch_specific_description, branch_specific_status
) ON TABLE public.branch_menu_items FROM restaurant_membership_context_reader;
REVOKE SELECT (
  id, restaurant_id, menu_category_id, name, description, image_url,
  allergens, status, nutrition_badge_status
) ON TABLE public.menu_items FROM restaurant_membership_context_reader;
REVOKE SELECT (id, menu_id, name, sort_order)
  ON TABLE public.menu_categories FROM restaurant_membership_context_reader;
REVOKE SELECT (id, restaurant_id, name, status)
  ON TABLE public.menus FROM restaurant_membership_context_reader;
REVOKE SELECT (name, district, address, status)
  ON TABLE public.restaurant_branches FROM restaurant_membership_context_reader;
REVOKE SELECT (id, name, city, category, status)
  ON TABLE public.restaurants FROM restaurant_membership_context_reader;

ALTER TABLE public.branch_menu_items
  DROP CONSTRAINT branch_menu_items_item_restaurant_fkey;
ALTER TABLE public.branch_menu_items
  DROP CONSTRAINT branch_menu_items_branch_restaurant_fkey;
ALTER TABLE public.menu_items
  DROP CONSTRAINT menu_items_id_restaurant_id_key;
ALTER TABLE public.restaurant_branches
  DROP CONSTRAINT restaurant_branches_id_restaurant_id_key;

COMMIT;

-- Do not repair migration history. Revalidate public-safe views, Phase 2V-B
-- helpers, grants, RLS and final membership state after approved rollback.
