BEGIN;

-- Development-only reuse of the Phase 2V-B owner-context pattern. The
-- SET=false restoration is intentionally isolated in 20260716060000.
GRANT restaurant_membership_context_reader TO postgres
  WITH INHERIT FALSE, SET TRUE;

-- PostgreSQL requires the prospective function owner to hold CREATE on the
-- target schema during ownership transfer. This grant is revoked before commit.
GRANT CREATE ON SCHEMA public TO restaurant_membership_context_reader;

CREATE FUNCTION public.restaurant_internal_restaurants_v1()
RETURNS TABLE (
  restaurant_id text,
  name text,
  city text,
  category text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.restaurant_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.permission_key = 'access_context.read'
      AND access.permission_scope = 'self'
  )
  SELECT DISTINCT
    restaurant.id AS restaurant_id,
    restaurant.name,
    restaurant.city,
    restaurant.category,
    restaurant.status
  FROM public.restaurants AS restaurant
  JOIN authorized_scope AS scope ON scope.restaurant_id = restaurant.id;
$$;

CREATE FUNCTION public.restaurant_internal_branches_v1(p_restaurant_id text)
RETURNS TABLE (
  branch_id text,
  restaurant_id text,
  name text,
  district text,
  address text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.permission_scope, access.branch_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.restaurant_id = p_restaurant_id
      AND access.permission_key = 'branch.read'
      AND access.permission_scope IN ('restaurant', 'branch')
  )
  SELECT DISTINCT
    branch.id AS branch_id,
    branch.restaurant_id,
    branch.name,
    branch.district,
    branch.address,
    branch.status
  FROM public.restaurant_branches AS branch
  JOIN authorized_scope AS scope
    ON scope.permission_scope = 'restaurant'
    OR (scope.permission_scope = 'branch' AND scope.branch_id = branch.id)
  WHERE branch.restaurant_id = p_restaurant_id;
$$;

CREATE FUNCTION public.restaurant_internal_menus_v1(p_restaurant_id text)
RETURNS TABLE (
  menu_id text,
  restaurant_id text,
  name text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.permission_scope, access.branch_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.restaurant_id = p_restaurant_id
      AND access.permission_key = 'menu.read'
      AND access.permission_scope IN ('restaurant', 'branch')
  )
  SELECT DISTINCT
    menu.id AS menu_id,
    menu.restaurant_id,
    menu.name,
    menu.status
  FROM public.menus AS menu
  JOIN authorized_scope AS scope
    ON scope.permission_scope = 'restaurant'
    OR (
      scope.permission_scope = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.menu_categories AS category
        JOIN public.menu_items AS item
          ON item.menu_category_id = category.id
         AND item.restaurant_id = menu.restaurant_id
        JOIN public.branch_menu_items AS branch_item
          ON branch_item.menu_item_id = item.id
         AND branch_item.restaurant_id = menu.restaurant_id
        JOIN public.restaurant_branches AS branch
          ON branch.id = branch_item.branch_id
         AND branch.restaurant_id = menu.restaurant_id
        WHERE category.menu_id = menu.id
          AND branch.id = scope.branch_id
      )
    )
  WHERE menu.restaurant_id = p_restaurant_id;
$$;

CREATE FUNCTION public.restaurant_internal_menu_categories_v1(p_restaurant_id text)
RETURNS TABLE (
  category_id text,
  menu_id text,
  restaurant_id text,
  name text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.permission_scope, access.branch_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.restaurant_id = p_restaurant_id
      AND access.permission_key = 'menu.read'
      AND access.permission_scope IN ('restaurant', 'branch')
  )
  SELECT DISTINCT
    category.id AS category_id,
    category.menu_id,
    menu.restaurant_id,
    category.name,
    category.sort_order
  FROM public.menu_categories AS category
  JOIN public.menus AS menu ON menu.id = category.menu_id
  JOIN authorized_scope AS scope
    ON scope.permission_scope = 'restaurant'
    OR (
      scope.permission_scope = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.menu_items AS item
        JOIN public.branch_menu_items AS branch_item
          ON branch_item.menu_item_id = item.id
         AND branch_item.restaurant_id = item.restaurant_id
        JOIN public.restaurant_branches AS branch
          ON branch.id = branch_item.branch_id
         AND branch.restaurant_id = item.restaurant_id
        WHERE item.menu_category_id = category.id
          AND item.restaurant_id = menu.restaurant_id
          AND branch.id = scope.branch_id
      )
    )
  WHERE menu.restaurant_id = p_restaurant_id;
$$;

CREATE FUNCTION public.restaurant_internal_menu_items_v1(p_restaurant_id text)
RETURNS TABLE (
  menu_item_id text,
  restaurant_id text,
  menu_category_id text,
  name text,
  description text,
  image_url text,
  allergens text[],
  status text,
  nutrition_badge_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.permission_scope, access.branch_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.restaurant_id = p_restaurant_id
      AND access.permission_key = 'menu.read'
      AND access.permission_scope IN ('restaurant', 'branch')
  )
  SELECT DISTINCT
    item.id AS menu_item_id,
    item.restaurant_id,
    item.menu_category_id,
    item.name,
    item.description,
    item.image_url,
    item.allergens,
    item.status,
    item.nutrition_badge_status
  FROM public.menu_items AS item
  JOIN public.menu_categories AS category ON category.id = item.menu_category_id
  JOIN public.menus AS menu
    ON menu.id = category.menu_id
   AND menu.restaurant_id = item.restaurant_id
  JOIN authorized_scope AS scope
    ON scope.permission_scope = 'restaurant'
    OR (
      scope.permission_scope = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branch_menu_items AS branch_item
        JOIN public.restaurant_branches AS branch
          ON branch.id = branch_item.branch_id
         AND branch.restaurant_id = branch_item.restaurant_id
        WHERE branch_item.menu_item_id = item.id
          AND branch_item.restaurant_id = item.restaurant_id
          AND branch.id = scope.branch_id
      )
    )
  WHERE item.restaurant_id = p_restaurant_id;
$$;

CREATE FUNCTION public.restaurant_internal_branch_menu_items_v1(p_restaurant_id text)
RETURNS TABLE (
  branch_menu_item_id text,
  restaurant_id text,
  branch_id text,
  menu_item_id text,
  price numeric,
  availability text,
  sold_out boolean,
  branch_specific_name text,
  branch_specific_description text,
  branch_specific_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.permission_scope, access.branch_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.restaurant_id = p_restaurant_id
      AND access.permission_key = 'menu.read'
      AND access.permission_scope IN ('restaurant', 'branch')
  )
  SELECT DISTINCT
    branch_item.id AS branch_menu_item_id,
    branch_item.restaurant_id,
    branch_item.branch_id,
    branch_item.menu_item_id,
    branch_item.price,
    branch_item.availability,
    branch_item.sold_out,
    branch_item.branch_specific_name,
    branch_item.branch_specific_description,
    branch_item.branch_specific_status
  FROM public.branch_menu_items AS branch_item
  JOIN public.restaurant_branches AS branch
    ON branch.id = branch_item.branch_id
   AND branch.restaurant_id = branch_item.restaurant_id
  JOIN public.menu_items AS item
    ON item.id = branch_item.menu_item_id
   AND item.restaurant_id = branch_item.restaurant_id
  JOIN public.menu_categories AS category ON category.id = item.menu_category_id
  JOIN public.menus AS menu
    ON menu.id = category.menu_id
   AND menu.restaurant_id = item.restaurant_id
  JOIN authorized_scope AS scope
    ON scope.permission_scope = 'restaurant'
    OR (scope.permission_scope = 'branch' AND scope.branch_id = branch.id)
  WHERE branch_item.restaurant_id = p_restaurant_id;
$$;

CREATE FUNCTION public.restaurant_internal_current_nutrition_v1(p_restaurant_id text)
RETURNS TABLE (
  nutrition_id text,
  restaurant_id text,
  menu_item_id text,
  calories numeric,
  protein numeric,
  carbohydrates numeric,
  fat numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,
  saturated_fat numeric,
  serving_size text,
  verified_status text,
  is_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $$
  WITH authorized_scope AS MATERIALIZED (
    SELECT access.permission_scope, access.branch_id
    FROM public.restaurant_current_access_context_v1() AS access
    WHERE access.restaurant_id = p_restaurant_id
      AND access.permission_key = 'nutrition.read'
      AND access.permission_scope IN ('restaurant', 'branch')
  )
  SELECT DISTINCT
    nutrition.id AS nutrition_id,
    item.restaurant_id,
    nutrition.menu_item_id,
    nutrition.calories,
    nutrition.protein,
    nutrition.carbohydrates,
    nutrition.fat,
    nutrition.fiber,
    nutrition.sugar,
    nutrition.sodium,
    nutrition.saturated_fat,
    nutrition.serving_size,
    nutrition.verified_status,
    nutrition.is_current
  FROM public.menu_item_nutrition AS nutrition
  JOIN public.menu_items AS item ON item.id = nutrition.menu_item_id
  JOIN public.menu_categories AS category ON category.id = item.menu_category_id
  JOIN public.menus AS menu
    ON menu.id = category.menu_id
   AND menu.restaurant_id = item.restaurant_id
  JOIN authorized_scope AS scope
    ON scope.permission_scope = 'restaurant'
    OR (
      scope.permission_scope = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branch_menu_items AS branch_item
        JOIN public.restaurant_branches AS branch
          ON branch.id = branch_item.branch_id
         AND branch.restaurant_id = branch_item.restaurant_id
        WHERE branch_item.menu_item_id = item.id
          AND branch_item.restaurant_id = item.restaurant_id
          AND branch.id = scope.branch_id
      )
    )
  WHERE item.restaurant_id = p_restaurant_id
    AND nutrition.is_current = true;
$$;

ALTER FUNCTION public.restaurant_internal_restaurants_v1()
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_internal_branches_v1(text)
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_internal_menus_v1(text)
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_internal_menu_categories_v1(text)
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_internal_menu_items_v1(text)
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_internal_branch_menu_items_v1(text)
  OWNER TO restaurant_membership_context_reader;
ALTER FUNCTION public.restaurant_internal_current_nutrition_v1(text)
  OWNER TO restaurant_membership_context_reader;

SET LOCAL ROLE restaurant_membership_context_reader;

REVOKE ALL ON FUNCTION public.restaurant_internal_restaurants_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_restaurants_v1() FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_restaurants_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_restaurants_v1() TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_internal_branches_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_branches_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_branches_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_branches_v1(text) TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_internal_menus_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_menus_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_menus_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_menus_v1(text) TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_internal_menu_categories_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_menu_categories_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_menu_categories_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_menu_categories_v1(text) TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_internal_menu_items_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_menu_items_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_menu_items_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_menu_items_v1(text) TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_internal_branch_menu_items_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_branch_menu_items_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_branch_menu_items_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_branch_menu_items_v1(text) TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_internal_current_nutrition_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_internal_current_nutrition_v1(text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_internal_current_nutrition_v1(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_current_nutrition_v1(text) TO authenticated;

SET LOCAL ROLE NONE;

REVOKE CREATE ON SCHEMA public FROM restaurant_membership_context_reader;

COMMIT;
