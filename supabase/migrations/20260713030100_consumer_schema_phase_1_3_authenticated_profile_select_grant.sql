-- Consumer Schema Phase 1.3 forward-only corrective migration.
-- Grants the minimum table-level read privilege required by Consumer Runtime Phase 1D live profile smoke.
-- No seed, fixture, Auth user, write privilege, anon privilege, or production credential is included.

grant select on table public.consumer_profiles to authenticated;
