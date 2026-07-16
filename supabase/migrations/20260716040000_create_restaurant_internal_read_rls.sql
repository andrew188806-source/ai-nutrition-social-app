BEGIN;

-- Phase 2V-C grants only exact columns to the dedicated NOLOGIN/NOBYPASSRLS
-- reader. Browser roles receive no raw-table privilege in this migration.

REVOKE SELECT ON TABLE public.restaurants FROM restaurant_membership_context_reader;
REVOKE SELECT ON TABLE public.restaurant_branches FROM restaurant_membership_context_reader;
REVOKE SELECT ON TABLE public.menus FROM restaurant_membership_context_reader;
REVOKE SELECT ON TABLE public.menu_categories FROM restaurant_membership_context_reader;
REVOKE SELECT ON TABLE public.menu_items FROM restaurant_membership_context_reader;
REVOKE SELECT ON TABLE public.branch_menu_items FROM restaurant_membership_context_reader;
REVOKE SELECT ON TABLE public.menu_item_nutrition FROM restaurant_membership_context_reader;

GRANT SELECT (id, name, city, category, status)
  ON TABLE public.restaurants TO restaurant_membership_context_reader;
GRANT SELECT (id, restaurant_id, name, district, address, status)
  ON TABLE public.restaurant_branches TO restaurant_membership_context_reader;
GRANT SELECT (id, restaurant_id, name, status)
  ON TABLE public.menus TO restaurant_membership_context_reader;
GRANT SELECT (id, menu_id, name, sort_order)
  ON TABLE public.menu_categories TO restaurant_membership_context_reader;
GRANT SELECT (
  id, restaurant_id, menu_category_id, name, description, image_url,
  allergens, status, nutrition_badge_status
)
  ON TABLE public.menu_items TO restaurant_membership_context_reader;
GRANT SELECT (
  id, restaurant_id, branch_id, menu_item_id, price, availability, sold_out,
  branch_specific_name, branch_specific_description, branch_specific_status
)
  ON TABLE public.branch_menu_items TO restaurant_membership_context_reader;
GRANT SELECT (
  id, menu_item_id, calories, protein, carbohydrates, fat, fiber, sugar,
  sodium, saturated_fat, serving_size, verified_status, is_current
)
  ON TABLE public.menu_item_nutrition TO restaurant_membership_context_reader;

-- Every restrictive policy derives the current tenant from the verified JWT
-- actor and active membership. This prevents existing permissive public
-- policies from widening the projection reader across tenants. Branch-level
-- assignment remains an independent predicate inside every strict RPC.

CREATE POLICY restaurants_internal_tenant_restrict
ON public.restaurants AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled'
      AND rm.status = 'active'
      AND rr.status = 'active'
      AND rm.restaurant_id = restaurants.id
  )
);

CREATE POLICY restaurants_internal_access_permit
ON public.restaurants FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled'
      AND rm.status = 'active'
      AND rr.status = 'active'
      AND rm.restaurant_id = restaurants.id
      AND rp.permission_key = 'access_context.read'
      AND rp.permission_scope = 'self'
  )
);

CREATE POLICY restaurant_branches_internal_tenant_restrict
ON public.restaurant_branches AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = restaurant_branches.restaurant_id
  )
);

CREATE POLICY restaurant_branches_internal_access_permit
ON public.restaurant_branches FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = restaurant_branches.restaurant_id
      AND rp.permission_key = 'branch.read'
      AND rp.permission_scope IN ('restaurant', 'branch')
  )
);

CREATE POLICY menus_internal_tenant_restrict
ON public.menus AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = menus.restaurant_id
  )
);

CREATE POLICY menus_internal_access_permit
ON public.menus FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = menus.restaurant_id
      AND rp.permission_key = 'menu.read'
      AND rp.permission_scope IN ('restaurant', 'branch')
  )
);

CREATE POLICY menu_categories_internal_tenant_restrict
ON public.menu_categories AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.menus AS m
    JOIN public.restaurant_users AS ru ON true
    JOIN public.restaurant_memberships AS rm
      ON rm.restaurant_user_id = ru.id AND rm.restaurant_id = m.restaurant_id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE m.id = menu_categories.menu_id
      AND ru.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
  )
);

CREATE POLICY menu_categories_internal_access_permit
ON public.menu_categories FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.menus AS m
    JOIN public.restaurant_users AS ru ON true
    JOIN public.restaurant_memberships AS rm
      ON rm.restaurant_user_id = ru.id AND rm.restaurant_id = m.restaurant_id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE m.id = menu_categories.menu_id
      AND ru.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rp.permission_key = 'menu.read'
      AND rp.permission_scope IN ('restaurant', 'branch')
  )
);

CREATE POLICY menu_items_internal_tenant_restrict
ON public.menu_items AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = menu_items.restaurant_id
  )
);

CREATE POLICY menu_items_internal_access_permit
ON public.menu_items FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = menu_items.restaurant_id
      AND rp.permission_key = 'menu.read'
      AND rp.permission_scope IN ('restaurant', 'branch')
  )
);

CREATE POLICY branch_menu_items_internal_tenant_restrict
ON public.branch_menu_items AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = branch_menu_items.restaurant_id
  )
);

CREATE POLICY branch_menu_items_internal_access_permit
ON public.branch_menu_items FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_users AS ru
    JOIN public.restaurant_memberships AS rm ON rm.restaurant_user_id = ru.id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE ru.auth_user_id = COALESCE(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rm.restaurant_id = branch_menu_items.restaurant_id
      AND rp.permission_key = 'menu.read'
      AND rp.permission_scope IN ('restaurant', 'branch')
  )
);

CREATE POLICY menu_item_nutrition_internal_tenant_restrict
ON public.menu_item_nutrition AS RESTRICTIVE FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.menu_items AS mi
    JOIN public.restaurant_users AS ru ON true
    JOIN public.restaurant_memberships AS rm
      ON rm.restaurant_user_id = ru.id AND rm.restaurant_id = mi.restaurant_id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    WHERE mi.id = menu_item_nutrition.menu_item_id
      AND ru.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
  )
);

CREATE POLICY menu_item_nutrition_internal_access_permit
ON public.menu_item_nutrition FOR SELECT
TO restaurant_membership_context_reader
USING (
  EXISTS (
    SELECT 1 FROM public.menu_items AS mi
    JOIN public.restaurant_users AS ru ON true
    JOIN public.restaurant_memberships AS rm
      ON rm.restaurant_user_id = ru.id AND rm.restaurant_id = mi.restaurant_id
    JOIN public.restaurant_roles AS rr ON rr.id = rm.role_id
    JOIN public.role_permissions AS rp ON rp.role_id = rr.id
    WHERE mi.id = menu_item_nutrition.menu_item_id
      AND ru.auth_user_id = COALESCE(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )::pg_catalog.uuid
      AND ru.login_status = 'enabled' AND rm.status = 'active' AND rr.status = 'active'
      AND rp.permission_key = 'nutrition.read'
      AND rp.permission_scope IN ('restaurant', 'branch')
  )
);

COMMIT;
