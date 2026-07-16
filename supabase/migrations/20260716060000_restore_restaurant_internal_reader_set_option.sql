-- Phase 2V-C cleanup migration. This fresh transaction restores only the
-- deployment-role membership options after the owner-context migration.

BEGIN;

GRANT restaurant_membership_context_reader TO postgres
  WITH INHERIT FALSE, SET FALSE;

COMMIT;
