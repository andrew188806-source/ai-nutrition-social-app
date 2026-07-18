-- Consumer Runtime Phase 2X-C-A local-only migration draft.
-- Enables only owner-scoped authenticated Favorites reads through existing RLS.
-- No write privilege, RPC, seed, fixture, or remote execution is included.

begin;

revoke all on table public.favorite_restaurants from public, anon, authenticated;
revoke all on table public.favorite_menu_items from public, anon, authenticated;

grant select on table public.favorite_restaurants to authenticated;
grant select on table public.favorite_menu_items to authenticated;

revoke insert, update, delete on table public.favorite_restaurants from public, anon, authenticated;
revoke insert, update, delete on table public.favorite_menu_items from public, anon, authenticated;

commit;
