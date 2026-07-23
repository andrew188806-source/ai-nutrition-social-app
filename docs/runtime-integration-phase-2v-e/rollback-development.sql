-- DEVELOPMENT MANUAL REVIEW ONLY. DO NOT EXECUTE AUTOMATICALLY.
-- PRODUCTION USE IS PROHIBITED.
-- This rollback precisely restores the browser-role SELECT grants revoked by
-- supabase/migrations/20260723010000_revoke_restaurant_menu_raw_browser_select.sql.
-- It does not alter RLS, policies, object ownership, function bodies, function
-- ACLs, column-level grants, public-safe projections, Consumer projections,
-- owner/internal RPCs, membership RPCs, nutrition raw grants, or migration history.

BEGIN;

GRANT SELECT ON public.restaurants TO anon, authenticated;
GRANT SELECT ON public.restaurant_branches TO anon, authenticated;
GRANT SELECT ON public.menus TO anon, authenticated;
GRANT SELECT ON public.menu_categories TO anon, authenticated;
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT SELECT ON public.branch_menu_items TO anon, authenticated;

GRANT SELECT ON public.restaurant_public_view TO anon, authenticated;
GRANT SELECT ON public.published_menus_view TO anon, authenticated;
GRANT SELECT ON public.published_branch_menu_items_view TO anon, authenticated;

COMMIT;
