CREATE VIEW public.consumer_public_next_meal_candidates_v1
WITH (security_barrier = true) AS
SELECT
  bmi.id                    AS candidate_id,
  n.restaurant_id,
  bmi.branch_id,
  n.menu_item_id,
  mi.name                   AS meal_name,
  r.name                    AS restaurant_name,
  rb.name                   AS branch_name,
  rb.district,
  mi.image_url              AS public_image_url,
  n.calories,
  n.protein,
  n.carbohydrates,
  n.fat,
  n.fiber,
  n.nutrition_source_public,
  n.nutrition_updated_at,
  bmi.availability
FROM public.current_published_menu_item_nutrition n
JOIN public.menu_items mi ON mi.id = n.menu_item_id
JOIN public.restaurants r ON r.id = n.restaurant_id
JOIN public.menu_categories mc ON mc.id = mi.menu_category_id
JOIN public.menus m ON m.id = mc.menu_id AND m.restaurant_id = n.restaurant_id
JOIN public.branch_menu_items bmi
  ON bmi.menu_item_id = n.menu_item_id
  AND bmi.restaurant_id = n.restaurant_id
JOIN public.restaurant_branches rb
  ON rb.id = bmi.branch_id
  AND rb.restaurant_id = n.restaurant_id
WHERE m.status = 'published'
  AND rb.status = 'active'
  AND bmi.availability = 'available'
  AND bmi.sold_out = false
  AND bmi.branch_specific_status = 'available'
  AND n.calories IS NOT NULL
  AND n.nutrition_source_public IS NOT NULL;

REVOKE ALL ON public.consumer_public_next_meal_candidates_v1 FROM PUBLIC;
REVOKE ALL ON public.consumer_public_next_meal_candidates_v1 FROM anon;
GRANT SELECT ON public.consumer_public_next_meal_candidates_v1 TO authenticated;
