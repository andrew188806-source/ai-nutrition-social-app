-- Phase 2V-B cleanup migration: restore the deployment-role membership SET
-- option in a fresh transaction with no role-switch history.

BEGIN;

GRANT restaurant_membership_context_reader TO postgres
  WITH INHERIT FALSE, SET FALSE;

COMMIT;
