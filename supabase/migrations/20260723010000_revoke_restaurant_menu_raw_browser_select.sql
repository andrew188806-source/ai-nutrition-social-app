BEGIN;

-- N4: revoke obsolete browser-role SELECT on raw restaurant/menu objects.
-- Public-safe projections and owner/internal RPCs intentionally remain unchanged.

REVOKE SELECT ON public.restaurants FROM anon, authenticated;
REVOKE SELECT ON public.restaurant_branches FROM anon, authenticated;
REVOKE SELECT ON public.menus FROM anon, authenticated;
REVOKE SELECT ON public.menu_categories FROM anon, authenticated;
REVOKE SELECT ON public.menu_items FROM anon, authenticated;
REVOKE SELECT ON public.branch_menu_items FROM anon, authenticated;

-- Legacy activation-pack helper views are obsolete browser surfaces.
REVOKE SELECT ON public.restaurant_public_view FROM anon, authenticated;
REVOKE SELECT ON public.published_menus_view FROM anon, authenticated;
REVOKE SELECT ON public.published_branch_menu_items_view FROM anon, authenticated;

COMMIT;
