BEGIN;

REVOKE SELECT
ON public.menu_item_nutrition
FROM anon, authenticated;

REVOKE SELECT
ON public.current_published_menu_item_nutrition
FROM anon, authenticated;

COMMIT;
