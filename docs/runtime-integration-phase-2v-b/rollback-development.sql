-- DEVELOPMENT MANUAL REVIEW ONLY. DO NOT EXECUTE AUTOMATICALLY.
-- PRODUCTION USE IS PROHIBITED.
-- This rollback irreversibly deletes all Phase 2V-B membership-domain data.
-- It describes the combined final state of deployed migrations 20260715050000,
-- 20260715060000, owner-context ACL correction 20260716010000, and SET cleanup
-- 20260716020000. The two pending migrations create no object, so dropping the three RPCs naturally removes
-- their corrected ACLs; no separate ACL rollback or history repair is needed.
-- Attempt 4 failed with SQLSTATE XX000 at its membership revoke and rolled back
-- completely. Attempt 5 failed with SQLSTATE 0LP01 at its first ADMIN-true grant
-- and also rolled back. Attempt 6 failed with SQLSTATE XX000 during same-transaction
-- SET restoration and rolled back. The split moves SET=false cleanup to 020000.
-- It intentionally does not touch existing restaurant, menu, nutrition,
-- Consumer function, public-safe view, or Supabase-managed auth privilege objects.

-- This is a two-stage manual plan, not a single executable script. Stage 1 must
-- be run only by a separately approved operator already acting as the dedicated
-- function owner. This file deliberately contains no role-switch statement.

-- STAGE 1 — function-owner context only.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.restaurant_has_branch_permission(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_has_restaurant_permission(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restaurant_current_access_context_v1() FROM authenticated;

DROP FUNCTION public.restaurant_has_branch_permission(text, text, text);
DROP FUNCTION public.restaurant_has_restaurant_permission(text, text);
DROP FUNCTION public.restaurant_current_access_context_v1();

COMMIT;

-- STOP. Stage 2 requires a separately reviewed deployment-role connection.
-- Do not continue in function-owner context.

-- STAGE 2 — deployment-role context only.
BEGIN;

-- This REVOKE belongs only to a separately approved complete destructive
-- rollback that will also drop the owner role. It is not part of the Option D
-- corrective migration, which must preserve the audited membership row and
-- leave its existing ADMIN option unchanged by omission.
REVOKE restaurant_membership_context_reader FROM postgres;

DROP TRIGGER restaurant_membership_branch_scopes_consistency_trigger
  ON public.restaurant_membership_branch_scopes;

DROP FUNCTION public.enforce_restaurant_membership_branch_scope_consistency();

DROP POLICY restaurant_membership_branch_scopes_self_active_select
  ON public.restaurant_membership_branch_scopes;
DROP POLICY role_permissions_self_active_select
  ON public.role_permissions;
DROP POLICY restaurant_roles_self_active_select
  ON public.restaurant_roles;
DROP POLICY restaurant_memberships_self_active_select
  ON public.restaurant_memberships;
DROP POLICY restaurant_users_self_active_select
  ON public.restaurant_users;

REVOKE SELECT (id, restaurant_id)
  ON TABLE public.restaurant_branches
  FROM restaurant_membership_context_reader;
REVOKE SELECT (membership_id, branch_id, status)
  ON TABLE public.restaurant_membership_branch_scopes
  FROM restaurant_membership_context_reader;
REVOKE SELECT (id, restaurant_user_id, restaurant_id, role_id, status)
  ON TABLE public.restaurant_memberships
  FROM restaurant_membership_context_reader;
REVOKE SELECT (role_id, permission_key, permission_scope)
  ON TABLE public.role_permissions
  FROM restaurant_membership_context_reader;
REVOKE SELECT (id, role_key, status)
  ON TABLE public.restaurant_roles
  FROM restaurant_membership_context_reader;
REVOKE SELECT (id, auth_user_id, login_status)
  ON TABLE public.restaurant_users
  FROM restaurant_membership_context_reader;
REVOKE USAGE ON SCHEMA public FROM restaurant_membership_context_reader;

DROP ROLE restaurant_membership_context_reader;

DROP TABLE public.restaurant_membership_branch_scopes;
DROP TABLE public.restaurant_memberships;
DROP TABLE public.role_permissions;
DROP TABLE public.restaurant_roles;
DROP TABLE public.restaurant_users;

COMMIT;

-- After a separately approved Development rollback, run the rollback-verification
-- sections in validation-queries.sql and confirm the pre-2V-B public-safe views,
-- Consumer functions, raw-grant state, and migration-recovery plan are unchanged.
