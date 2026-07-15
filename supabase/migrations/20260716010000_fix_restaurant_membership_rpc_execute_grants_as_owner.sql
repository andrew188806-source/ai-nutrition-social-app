-- Phase 2V-B corrective migration: apply the three strict read RPC execute
-- ACLs while current_user is their dedicated minimum-privilege owner.

BEGIN;

GRANT restaurant_membership_context_reader TO postgres
  WITH INHERIT FALSE, SET TRUE;

SET LOCAL ROLE restaurant_membership_context_reader;

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

SET LOCAL ROLE NONE;

COMMIT;
