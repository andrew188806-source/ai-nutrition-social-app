-- N1: Extend public.current_published_menu_item_nutrition with public-safe provenance columns.
-- Adds nutrition_source_public and nutrition_updated_at as the last two columns.
-- Preserves all 16 existing columns in their original order.
-- No grant changes. No RLS changes. No security_invoker.
-- PostgreSQL CREATE OR REPLACE VIEW preserves existing ownership and grants.
-- Consumer Runtime Phase 2U-A

CREATE OR REPLACE VIEW public.current_published_menu_item_nutrition AS
SELECT
  n.id,
  i.restaurant_id,
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
  n.source,
  n.confidence_score,
  n.verified_status,
  n.updated_at,
  CASE n.source
    WHEN 'ai_estimated'        THEN 'ai_estimated'::text
    WHEN 'restaurant_verified' THEN 'restaurant_confirmed'::text
    WHEN 'platform_reviewed'   THEN 'platform_reviewed'::text
    ELSE NULL
  END AS nutrition_source_public,
  n.updated_at AS nutrition_updated_at
FROM public.menu_item_nutrition n
JOIN public.menu_items i ON i.id = n.menu_item_id
JOIN public.restaurants r ON r.id = i.restaurant_id
WHERE n.is_current = true
  AND n.verified_status = ANY (ARRAY['verified'::text, 'ai_estimated'::text])
  AND i.status = 'active'
  AND r.status = 'active';
