BEGIN;

CREATE VIEW public.consumer_public_restaurant_catalog_v1
WITH (security_barrier = true) AS
SELECT
  r.id AS restaurant_id,
  r.name AS restaurant_name,
  r.city AS restaurant_city,
  r.category AS restaurant_category,
  r.tags AS restaurant_tags,
  rb.id AS branch_id,
  rb.name AS branch_name,
  rb.district AS branch_district,
  rb.address AS branch_address,
  m.id AS menu_id,
  m.name AS menu_name,
  mc.id AS menu_category_id,
  mc.name AS menu_category_name,
  mc.sort_order AS menu_category_sort_order,
  bmi.id AS branch_menu_item_id,
  mi.id AS menu_item_id,
  COALESCE(bmi.branch_specific_name, mi.name) AS menu_item_name,
  COALESCE(bmi.branch_specific_description, mi.description) AS menu_item_description,
  mi.image_url AS menu_item_image_url,
  mi.tag_ids AS menu_item_tags,
  mi.allergens AS menu_item_allergens,
  bmi.price AS branch_price,
  bmi.availability AS branch_availability,
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
FROM public.restaurants AS r
JOIN public.restaurant_branches AS rb
  ON rb.restaurant_id = r.id
  AND rb.status = 'active'
  AND rb.is_active = true
JOIN public.menus AS m
  ON m.restaurant_id = r.id
  AND m.status = 'published'
JOIN public.menu_categories AS mc
  ON mc.menu_id = m.id
JOIN public.menu_items AS mi
  ON mi.restaurant_id = r.id
  AND mi.menu_category_id = mc.id
  AND mi.status = 'active'
JOIN public.branch_menu_items AS bmi
  ON bmi.restaurant_id = r.id
  AND bmi.branch_id = rb.id
  AND bmi.menu_item_id = mi.id
  AND bmi.availability IN ('available', 'limited')
  AND bmi.sold_out = false
  AND bmi.branch_specific_status = 'available'
LEFT JOIN public.restaurant_public_published_nutrition_v1 AS n
  ON n.restaurant_id = r.id
  AND n.menu_item_id = mi.id
WHERE r.status = 'active';

REVOKE ALL ON public.consumer_public_restaurant_catalog_v1 FROM PUBLIC;
REVOKE ALL ON public.consumer_public_restaurant_catalog_v1 FROM anon;
REVOKE ALL ON public.consumer_public_restaurant_catalog_v1 FROM authenticated;
GRANT SELECT ON public.consumer_public_restaurant_catalog_v1 TO anon;
GRANT SELECT ON public.consumer_public_restaurant_catalog_v1 TO authenticated;

COMMIT;
