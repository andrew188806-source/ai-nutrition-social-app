-- Phase 2V-B corrective migration: restore exact execute ACLs on the three
-- deployed strict membership read RPCs. Direct object references intentionally
-- fail when the required role or any required function is absent.

BEGIN;

GRANT restaurant_membership_context_reader TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_current_access_context_v1() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_current_access_context_v1() TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_has_restaurant_permission(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_has_branch_permission(text, text, text) TO authenticated;

REVOKE restaurant_membership_context_reader FROM postgres;

COMMIT;
