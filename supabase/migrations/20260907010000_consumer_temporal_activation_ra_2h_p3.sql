BEGIN;

-- =================================================================================================
-- RA-2H-P3. Consumer-facing temporal activation.
--
-- Composes the frozen RA-2H-P1 canonical evaluator
-- (restaurant_internal.evaluate_branch_temporal_state_v1) into Consumer read surfaces through two
-- minimal, state-only SECURITY DEFINER wrappers. This migration never duplicates weekly/special/DST/
-- closure logic, never exposes reason/audit/internal detail, and always evaluates against
-- pg_catalog.now() (DB-authoritative) -- never a client-supplied instant.
--
-- Composition happens ONCE per shared producer, not once per downstream consumer:
--   - consumer_public_restaurant_catalog_v2 (successor of _v1) feeds the Consumer catalogue list,
--     the restaurant detail modal, and Meal Identification's candidate source -- all three reuse the
--     same producer today, so one column addition here reaches all three.
--   - consumer_public_next_meal_candidates_v2 (successor of _v1) feeds the Next Meal / REC candidate
--     pipeline directly, and (via that same view, narrowed by branch id) the GEO-mediated read path
--     -- so GEO needs no separate producer change; only its downstream eligibility filter (added in
--     application code, not here) needs the new column.
--   - Meal Buddy candidates do not derive from either view (a separate producer, meal_buddy_cards),
--     so it is composed via the batch wrapper below, called once per request from its Edge Function,
--     analogous to how it already calls the frozen GEO-1A narrowing RPC.
--
-- Neither successor view filters anything by temporal state: CLOSED does not depublish. Admin
-- lifecycle (rb.status = 'active') remains the only discoverability gate, byte-identical to _v1.
-- Eligibility exclusion of CLOSED candidates happens downstream, in the REC ranking pipeline and the
-- Meal Buddy composition pipeline, at the same "hard eligibility, pre-ranking" stage as the existing
-- allergy/ingredient-avoidance/geo filters -- never as a WHERE clause here.
-- =================================================================================================

-- -------------------------------------------------------------------------------------------------
-- 1. Scalar per-branch wrapper. Called directly as a SELECT-list expression in a Consumer-facing
--    view: one DB-side evaluation per row within a single query, never a per-card client round trip.
-- -------------------------------------------------------------------------------------------------
create function restaurant_internal.consumer_branch_current_temporal_state_v1(p_branch_id text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  select e.state into v_state
  from restaurant_internal.evaluate_branch_temporal_state_v1(p_branch_id, pg_catalog.now()) e;
  return coalesce(v_state, 'UNKNOWN');
end;
$$;

comment on function restaurant_internal.consumer_branch_current_temporal_state_v1(text) is
  'RA-2H-P3. Minimal Consumer-facing wrapper around the canonical evaluator: state only (OPEN/CLOSED/UNKNOWN), never reason, audit or internal detail. DB-authoritative now().';

revoke all on function restaurant_internal.consumer_branch_current_temporal_state_v1(text) from public;
grant usage on schema restaurant_internal to anon;
grant usage on schema restaurant_internal to authenticated;
grant execute on function restaurant_internal.consumer_branch_current_temporal_state_v1(text) to anon;
grant execute on function restaurant_internal.consumer_branch_current_temporal_state_v1(text) to authenticated;

-- -------------------------------------------------------------------------------------------------
-- 2. Batch wrapper for server-side (Edge Function) composition, where a request already narrows to a
--    known set of branch ids: one round trip per request, never one per candidate.
-- -------------------------------------------------------------------------------------------------
create function restaurant_internal.consumer_branch_current_temporal_states_v1(p_branch_ids text[])
returns table(branch_id text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select b.id, coalesce(e.state, 'UNKNOWN')
  from unnest(p_branch_ids) as b(id)
  cross join lateral restaurant_internal.evaluate_branch_temporal_state_v1(b.id, pg_catalog.now()) e;
end;
$$;

comment on function restaurant_internal.consumer_branch_current_temporal_states_v1(text[]) is
  'RA-2H-P3. Batch Consumer-facing wrapper around the canonical evaluator for server-side (Edge Function) composition. State only, never reason/audit/internal detail. DB-authoritative now().';

revoke all on function restaurant_internal.consumer_branch_current_temporal_states_v1(text[]) from public;
grant usage on schema restaurant_internal to social_runtime_executor;
grant execute on function restaurant_internal.consumer_branch_current_temporal_states_v1(text[]) to social_runtime_executor;

-- -------------------------------------------------------------------------------------------------
-- 3. Successor catalogue view. Adds branch_temporal_state only; every existing column, join and
--    filter is byte-identical to consumer_public_restaurant_catalog_v1.
-- -------------------------------------------------------------------------------------------------
create view public.consumer_public_restaurant_catalog_v2
with (security_barrier = true) as
select
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
  n.nutrition_updated_at,
  restaurant_internal.consumer_branch_current_temporal_state_v1(rb.id) AS branch_temporal_state
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

REVOKE ALL ON public.consumer_public_restaurant_catalog_v2 FROM PUBLIC;
REVOKE ALL ON public.consumer_public_restaurant_catalog_v2 FROM anon;
REVOKE ALL ON public.consumer_public_restaurant_catalog_v2 FROM authenticated;
GRANT SELECT ON public.consumer_public_restaurant_catalog_v2 TO anon;
GRANT SELECT ON public.consumer_public_restaurant_catalog_v2 TO authenticated;

-- -------------------------------------------------------------------------------------------------
-- 4. Successor next-meal-candidates view. Adds branch_temporal_state only; every existing column,
--    join and filter is byte-identical to consumer_public_next_meal_candidates_v1. candidate_id
--    remains bmi.id, unchanged, so the existing taste/allergen/ingredient-avoidance derived views
--    (still keyed off _v1) continue to align by candidate_id with this successor's rows.
-- -------------------------------------------------------------------------------------------------
create view public.consumer_public_next_meal_candidates_v2
with (security_barrier = true) as
select
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
  bmi.availability,
  restaurant_internal.consumer_branch_current_temporal_state_v1(rb.id) AS branch_temporal_state
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

REVOKE ALL ON public.consumer_public_next_meal_candidates_v2 FROM PUBLIC;
REVOKE ALL ON public.consumer_public_next_meal_candidates_v2 FROM anon;
GRANT SELECT ON public.consumer_public_next_meal_candidates_v2 TO authenticated;

COMMIT;
