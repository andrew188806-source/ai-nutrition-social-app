-- Consumer Schema Phase 1.3 forward-only corrective migration.
-- Grants the minimum table-level read privileges required by Consumer Runtime Phase 2B live meal read smoke.
-- Keeps anon without meal table privileges and includes no seed, fixture, write privilege, policy change, or production credential.

grant select on table public.meal_records to authenticated;
grant select on table public.meal_record_items to authenticated;

revoke all on table public.meal_records from anon;
revoke all on table public.meal_record_items from anon;
