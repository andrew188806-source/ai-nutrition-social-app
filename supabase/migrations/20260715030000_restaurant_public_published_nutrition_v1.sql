-- N2R: Public-safe restaurant nutrition projection.
-- This migration intentionally leaves upstream grants and RLS unchanged.

CREATE VIEW public.restaurant_public_published_nutrition_v1
WITH (security_barrier = true) AS
SELECT
  n.restaurant_id,
  n.menu_item_id,
  n.calories,
  n.protein,
  n.carbohydrates,
  n.fat,
  n.fiber,
  n.sugar,
  n.sodium,
  n.saturated_fat,
  n.serving_size,
  n.nutrition_source_public,
  n.nutrition_updated_at
FROM public.current_published_menu_item_nutrition n
WHERE n.nutrition_source_public IS NOT NULL;

REVOKE ALL ON public.restaurant_public_published_nutrition_v1 FROM PUBLIC;
GRANT SELECT ON public.restaurant_public_published_nutrition_v1 TO anon;
GRANT SELECT ON public.restaurant_public_published_nutrition_v1 TO authenticated;
