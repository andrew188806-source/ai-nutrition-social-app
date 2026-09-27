-- GQA-5 Restaurant catalogue read repair (SQLSTATE 57014 under the authenticated role).
--
-- ROOT CAUSE. Owner catalogue reads ran as the sealed definer restaurant_membership_context_reader with
-- row_security on. Every catalogue reader policy re-joined the FORCE-RLS authority tables, whose own
-- {public} policies nest EXISTS through each other, and three policies additionally joined another
-- RLS-protected relation inline (menu_categories -> menus, menu_item_nutrition -> menu_items,
-- restaurant_membership_branch_scopes -> restaurant_branches). The rewriter expanded each RPC into
-- 274-377 plan nodes with ~100 subplans over tiny tables, and LANGUAGE sql SECURITY DEFINER bodies were
-- re-planned on every call. Seven concurrent page reads exceeded the 8 s statement_timeout.
--
-- REPAIR (authorization unchanged; only the evaluation strategy changes).
-- B. The same predicates are evaluated through PL/pgSQL SECURITY INVOKER lookups that run the identical
--    query as the caller, under the caller's own row level security. PL/pgSQL is never inlined, so the
--    outer plan no longer expands the referenced relations' policies at plan time.
--    * restaurant_internal_visible_{menu,menu_item,branch}_restaurant_id_v1(id): the restaurant_id of the
--      row with that primary key if the caller can see it, else NULL (the former inline join).
--    * restaurant_internal_actor_is_active_member_v1 / _actor_has_catalog_permission_v1: the former
--      restrict / permit EXISTS bodies, with the policy's own permission key and scope set passed in.
--    Policies keep their name, command, roles and permissive/restrictive kind (ALTER POLICY ... USING).
--    No BYPASSRLS, no owner bypass, no RLS change, no grant widening: EXECUTE on the helpers is granted
--    only to restaurant_membership_context_reader, the only role these policies apply to (the branch
--    scope policy is {public}, but only that role can read restaurant_membership_branch_scopes).
-- A. The read RPCs are recreated as PL/pgSQL with their query text copied verbatim (RETURN QUERY), so the
--    plan is cached per connection. CREATE OR REPLACE keeps OID, owner, ACL and signature.
--
-- Equivalence: an OLD vs NEW matrix of 17 actor shapes x 5 role worlds x 12 relations and every RPC across
-- four restaurant ids produced identical row identities and rejection codes (3,755 observations).
-- Nothing else is changed: no data, no historical migration, no Development-only policy, no default ACL.

BEGIN;

CREATE FUNCTION public.restaurant_internal_actor_is_active_member_v1(p_restaurant_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET row_security = 'on'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE rm.restaurant_id = p_restaurant_id
      AND ru.auth_user_id = (COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), ((NULLIF(current_setting('request.jwt.claims'::text, true), ''::text))::jsonb ->> 'sub'::text)))::uuid
      AND ru.login_status = 'enabled'::text AND rm.status = 'active'::text AND rr.status = 'active'::text);
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurant_internal_actor_is_active_member_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_actor_is_active_member_v1(text) TO restaurant_membership_context_reader;
CREATE FUNCTION public.restaurant_internal_actor_has_catalog_permission_v1(p_restaurant_id text, p_permission_key text, p_permission_scopes text[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET row_security = 'on'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE rm.restaurant_id = p_restaurant_id
      AND ru.auth_user_id = (COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), ((NULLIF(current_setting('request.jwt.claims'::text, true), ''::text))::jsonb ->> 'sub'::text)))::uuid
      AND ru.login_status = 'enabled'::text AND rm.status = 'active'::text AND rr.status = 'active'::text
      AND rp.permission_key = p_permission_key
      AND rp.permission_scope = ANY (p_permission_scopes));
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurant_internal_actor_has_catalog_permission_v1(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_actor_has_catalog_permission_v1(text, text, text[]) TO restaurant_membership_context_reader;

CREATE FUNCTION public.restaurant_internal_visible_menu_restaurant_id_v1(p_menu_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET row_security = 'on'
AS $function$
BEGIN
  -- The caller's own row level security decides visibility, exactly as the former inline join did.
  -- The id is the primary key, so at most one row qualifies; NULL means "no visible row".
  RETURN (SELECT t.restaurant_id FROM public.menus AS t WHERE t.id = p_menu_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurant_internal_visible_menu_restaurant_id_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_visible_menu_restaurant_id_v1(text) TO restaurant_membership_context_reader;

CREATE FUNCTION public.restaurant_internal_visible_menu_item_restaurant_id_v1(p_menu_item_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET row_security = 'on'
AS $function$
BEGIN
  -- The caller's own row level security decides visibility, exactly as the former inline join did.
  -- The id is the primary key, so at most one row qualifies; NULL means "no visible row".
  RETURN (SELECT t.restaurant_id FROM public.menu_items AS t WHERE t.id = p_menu_item_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurant_internal_visible_menu_item_restaurant_id_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_visible_menu_item_restaurant_id_v1(text) TO restaurant_membership_context_reader;

CREATE FUNCTION public.restaurant_internal_visible_branch_restaurant_id_v1(p_branch_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET row_security = 'on'
AS $function$
BEGIN
  -- The caller's own row level security decides visibility, exactly as the former inline join did.
  -- The id is the primary key, so at most one row qualifies; NULL means "no visible row".
  RETURN (SELECT t.restaurant_id FROM public.restaurant_branches AS t WHERE t.id = p_branch_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurant_internal_visible_branch_restaurant_id_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_internal_visible_branch_restaurant_id_v1(text) TO restaurant_membership_context_reader;

ALTER POLICY menu_categories_internal_access_permit ON public.menu_categories
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(public.restaurant_internal_visible_menu_restaurant_id_v1(menu_categories.menu_id), 'menu.read'::text, ARRAY['restaurant'::text, 'branch'::text]));

ALTER POLICY menu_categories_internal_tenant_restrict ON public.menu_categories
  USING (public.restaurant_internal_actor_is_active_member_v1(public.restaurant_internal_visible_menu_restaurant_id_v1(menu_categories.menu_id)));

ALTER POLICY menu_item_nutrition_internal_access_permit ON public.menu_item_nutrition
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(public.restaurant_internal_visible_menu_item_restaurant_id_v1(menu_item_nutrition.menu_item_id), 'nutrition.read'::text, ARRAY['restaurant'::text, 'branch'::text]));

ALTER POLICY menu_item_nutrition_internal_tenant_restrict ON public.menu_item_nutrition
  USING (public.restaurant_internal_actor_is_active_member_v1(public.restaurant_internal_visible_menu_item_restaurant_id_v1(menu_item_nutrition.menu_item_id)));

ALTER POLICY restaurants_internal_access_permit ON public.restaurants
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(restaurants.id, 'access_context.read'::text, ARRAY['self'::text]));

ALTER POLICY restaurants_internal_tenant_restrict ON public.restaurants
  USING (public.restaurant_internal_actor_is_active_member_v1(restaurants.id));

ALTER POLICY restaurant_branches_internal_access_permit ON public.restaurant_branches
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(restaurant_branches.restaurant_id, 'branch.read'::text, ARRAY['restaurant'::text, 'branch'::text]));

ALTER POLICY restaurant_branches_internal_tenant_restrict ON public.restaurant_branches
  USING (public.restaurant_internal_actor_is_active_member_v1(restaurant_branches.restaurant_id));

ALTER POLICY menus_internal_access_permit ON public.menus
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(menus.restaurant_id, 'menu.read'::text, ARRAY['restaurant'::text, 'branch'::text]));

ALTER POLICY menus_internal_tenant_restrict ON public.menus
  USING (public.restaurant_internal_actor_is_active_member_v1(menus.restaurant_id));

ALTER POLICY menu_items_internal_access_permit ON public.menu_items
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(menu_items.restaurant_id, 'menu.read'::text, ARRAY['restaurant'::text, 'branch'::text]));

ALTER POLICY menu_items_internal_tenant_restrict ON public.menu_items
  USING (public.restaurant_internal_actor_is_active_member_v1(menu_items.restaurant_id));

ALTER POLICY branch_menu_items_internal_access_permit ON public.branch_menu_items
  USING (public.restaurant_internal_actor_has_catalog_permission_v1(branch_menu_items.restaurant_id, 'menu.read'::text, ARRAY['restaurant'::text, 'branch'::text]));

ALTER POLICY branch_menu_items_internal_tenant_restrict ON public.branch_menu_items
  USING (public.restaurant_internal_actor_is_active_member_v1(branch_menu_items.restaurant_id));

ALTER POLICY restaurant_membership_branch_scopes_self_active_select ON public.restaurant_membership_branch_scopes
  USING ((status = 'active'::text) AND EXISTS (
    SELECT 1
    FROM public.restaurant_memberships AS membership
    JOIN public.restaurant_users AS restaurant_user ON restaurant_user.id = membership.restaurant_user_id
    WHERE membership.id = restaurant_membership_branch_scopes.membership_id
      AND membership.restaurant_id = public.restaurant_internal_visible_branch_restaurant_id_v1(restaurant_membership_branch_scopes.branch_id)
      AND membership.status = 'active'::text
      AND restaurant_user.auth_user_id = (COALESCE(NULLIF(current_setting('request.jwt.claim.sub'::text, true), ''::text), ((NULLIF(current_setting('request.jwt.claims'::text, true), ''::text))::jsonb ->> 'sub'::text)))::uuid
      AND restaurant_user.login_status = 'enabled'::text
  ));

GRANT restaurant_membership_context_reader TO postgres
  WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO restaurant_membership_context_reader;
SET LOCAL ROLE restaurant_membership_context_reader;

CREATE OR REPLACE FUNCTION public.restaurant_current_access_context_v1()
RETURNS TABLE (
  restaurant_id text,
  role_key text,
  permission_key text,
  permission_scope text,
  branch_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH request_actor AS (
    SELECT COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (
        nullif(
          pg_catalog.current_setting('request.jwt.claims', true),
          ''
        )::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid AS auth_user_id
  )
  SELECT
    membership.restaurant_id,
    role.role_key,
    permission.permission_key,
    permission.permission_scope,
    CASE
      WHEN permission.permission_scope = 'branch' THEN branch_scope.branch_id
      ELSE NULL::text
    END AS branch_id
  FROM request_actor
  JOIN public.restaurant_users AS restaurant_user
    ON restaurant_user.auth_user_id = request_actor.auth_user_id
   AND restaurant_user.login_status = 'enabled'
  JOIN public.restaurant_memberships AS membership
    ON membership.restaurant_user_id = restaurant_user.id
   AND membership.status = 'active'
  JOIN public.restaurant_roles AS role
    ON role.id = membership.role_id
   AND role.status = 'active'
  JOIN public.role_permissions AS permission
    ON permission.role_id = role.id
  LEFT JOIN public.restaurant_membership_branch_scopes AS branch_scope
    ON branch_scope.membership_id = membership.id
   AND branch_scope.status = 'active'
   AND permission.permission_scope = 'branch'
  LEFT JOIN public.restaurant_branches AS branch
    ON branch.id = branch_scope.branch_id
   AND branch.restaurant_id = membership.restaurant_id
  WHERE (
      permission.permission_scope <> 'branch'
      OR branch.id IS NOT NULL
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_restaurants_v1()
RETURNS TABLE (
  restaurant_id text,
  name text,
  city text,
  category text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_branches_v1(p_restaurant_id text)
RETURNS TABLE (
  branch_id text,
  restaurant_id text,
  name text,
  district text,
  address text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_menus_v1(p_restaurant_id text)
RETURNS TABLE (
  menu_id text,
  restaurant_id text,
  name text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_menu_categories_v1(p_restaurant_id text)
RETURNS TABLE (
  category_id text,
  menu_id text,
  restaurant_id text,
  name text,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_menu_items_v1(p_restaurant_id text)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_branch_menu_items_v1(p_restaurant_id text)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_current_nutrition_v1(p_restaurant_id text)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_restaurants_v2()
RETURNS TABLE (
  restaurant_id text, name text, city text, category text, status text,
  public_website_url text, public_website_url_version text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  with authorized_scope as materialized (
    select access.restaurant_id
    from public.restaurant_current_access_context_v1() access
    where access.permission_key = 'access_context.read' and access.permission_scope = 'self'
  )
  select distinct restaurant.id, restaurant.name, restaurant.city, restaurant.category,
    restaurant.status, restaurant.public_website_url, restaurant.public_website_url_version::text
  from public.restaurants restaurant
  join authorized_scope scope on scope.restaurant_id = restaurant.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_internal_branches_v2(p_restaurant_id text)
RETURNS TABLE (
  branch_id text,
  restaurant_id text,
  name text,
  district text,
  address text,
  status text,
  public_phone text,
  public_phone_version text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = 'on'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  with authorized_scope as materialized (
    select access.permission_scope, access.branch_id
    from public.restaurant_current_access_context_v1() as access
    where access.restaurant_id = p_restaurant_id
      and access.permission_key = 'branch.read'
      and access.permission_scope in ('restaurant', 'branch')
  )
  select distinct
    branch.id,
    branch.restaurant_id,
    branch.name,
    branch.district,
    branch.address,
    branch.status,
    branch.public_phone,
    branch.public_phone_version::text
  from public.restaurant_branches as branch
  join authorized_scope as scope
    on scope.permission_scope = 'restaurant'
    or (scope.permission_scope = 'branch' and scope.branch_id = branch.id)
  where branch.restaurant_id = p_restaurant_id;
END;
$function$;

SET LOCAL ROLE NONE;
REVOKE CREATE ON SCHEMA public FROM restaurant_membership_context_reader;
GRANT restaurant_membership_context_reader TO postgres
  WITH INHERIT FALSE, SET FALSE;

DO $verify$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname IN ('restaurant_current_access_context_v1', 'restaurant_internal_restaurants_v1', 'restaurant_internal_branches_v1',
      'restaurant_internal_menus_v1', 'restaurant_internal_menu_categories_v1', 'restaurant_internal_menu_items_v1',
      'restaurant_internal_branch_menu_items_v1', 'restaurant_internal_current_nutrition_v1', 'restaurant_internal_restaurants_v2',
      'restaurant_internal_branches_v2')
    AND NOT (l.lanname = 'plpgsql' AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'restaurant_membership_context_reader'
      AND p.proconfig @> ARRAY['search_path=""', 'row_security=on']);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'read RPC invariant violated: %', bad; END IF;

  SELECT string_agg(p.proname, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname LIKE 'restaurant\_internal\_%' AND (p.proname LIKE '%\_visible\_%' OR p.proname LIKE '%\_actor\_%')
    AND NOT (l.lanname = 'plpgsql' AND NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""', 'row_security=on']
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND pg_catalog.has_function_privilege('restaurant_membership_context_reader', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee = 0));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'lookup helper invariant violated: %', bad; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('restaurant_internal_visible_menu_restaurant_id_v1', 'restaurant_internal_visible_menu_item_restaurant_id_v1',
        'restaurant_internal_visible_branch_restaurant_id_v1', 'restaurant_internal_actor_is_active_member_v1', 'restaurant_internal_actor_has_catalog_permission_v1')) <> 5 THEN
    RAISE EXCEPTION 'expected exactly five lookup helpers';
  END IF;

  SELECT string_agg(c.relname || '.' || pol.polname, ', ') INTO bad
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  WHERE c.relnamespace = 'public'::regnamespace
    AND pol.polname IN ('menu_categories_internal_access_permit', 'menu_categories_internal_tenant_restrict',
      'menu_item_nutrition_internal_access_permit', 'menu_item_nutrition_internal_tenant_restrict',
      'restaurant_membership_branch_scopes_self_active_select')
    AND pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) NOT LIKE '%restaurant_internal_visible_%';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'boundary policy not re-expressed: %', bad; END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles mem ON mem.oid = m.member
             WHERE r.rolname = 'restaurant_membership_context_reader' AND mem.rolname = 'postgres' AND m.set_option) THEN
    RAISE EXCEPTION 'postgres retained a SET edge to restaurant_membership_context_reader';
  END IF;
  IF pg_catalog.has_schema_privilege('restaurant_membership_context_reader', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'restaurant_membership_context_reader retained CREATE on schema public';
  END IF;
END;
$verify$;

COMMIT;
