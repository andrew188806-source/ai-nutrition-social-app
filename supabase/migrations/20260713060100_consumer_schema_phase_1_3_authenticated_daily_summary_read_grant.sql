-- Consumer Runtime Phase 2F forward-only migration.
-- Adds the minimal authenticated read privilege for current-user daily nutrition summary verification.
-- RLS ownership policies remain the authority for row access.

grant select on table public.daily_nutrition_summaries to authenticated;
revoke all on table public.daily_nutrition_summaries from anon;
