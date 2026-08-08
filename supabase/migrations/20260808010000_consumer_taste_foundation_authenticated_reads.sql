-- TS-2D forward-only corrective migration.
--
-- Grants the minimum table-level read privilege required for authenticated current-user taste
-- foundation reads (TS-2 canonical snapshot composition).
--
-- Owner row scoping already exists and is NOT changed here. 20260712131400 enabled row level
-- security on all three tables and created the owner policies
--   taste_profiles_owner_all       USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--   nutrition_goals_owner_all      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
--   dietary_restrictions_owner_all USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
-- so every row a caller can ever see is already restricted to that caller's own auth.uid().
--
-- A Development read-only ACL audit proved the gate is TABLE PRIVILEGE, not RLS: an authenticated
-- SELECT returned SQLSTATE 42501 "permission denied for table ..." rather than an RLS-filtered
-- empty result. This migration therefore adds only the missing privilege those existing policies
-- were never reachable through — the same minimal pattern as 20260713030100 for consumer_profiles.
--
-- SELECT only. authenticated only. No anon privilege, no write privilege (INSERT/UPDATE/DELETE),
-- no EXECUTE, no service-role behaviour, no policy creation, alteration or weakening, no schema
-- change, no table creation, no column change, no index, no function, no RPC, no view, no trigger,
-- no seed, no fixture, no Auth user, and no credential.

grant select on table public.taste_profiles to authenticated;
grant select on table public.nutrition_goals to authenticated;
grant select on table public.dietary_restrictions to authenticated;
