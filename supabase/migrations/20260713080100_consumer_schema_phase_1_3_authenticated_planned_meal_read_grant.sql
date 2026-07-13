-- Consumer Runtime Phase 2M forward-only migration.
-- Adds the minimal authenticated read privilege for current-user planned meals verification.
-- RLS ownership policies remain the authority for row access.

grant select on table public.planned_meals to authenticated;
revoke all on table public.planned_meals from anon;
