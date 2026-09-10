begin;

-- RA-2G-P1-R1: close the public visibility gap where consumer_public_restaurant_about_v1
-- enumerated any restaurant with status='active' and non-null About text, independent of
-- whether that restaurant has any catalogue-eligible row at all. An active restaurant with zero
-- eligible branch/menu/menu-item/branch_menu_item rows is invisible to
-- consumer_public_restaurant_catalog_v4 but was still discoverable through About -- widening the
-- canonical public restaurant universe beyond what the catalogue itself allows. Fixed by gating
-- publication on membership in that exact same universe via EXISTS (no join, no row
-- multiplication -- restaurants remains one row per id, so this stays one row per restaurant).
-- No product/API/UI contract changes: same view name, same two columns, same grants.

create or replace view public.consumer_public_restaurant_about_v1
with (security_barrier = true) as
select r.id as restaurant_id, r.restaurant_about
from public.restaurants as r
where r.status = 'active'
  and r.restaurant_about is not null
  and exists (
    select 1
    from public.consumer_public_restaurant_catalog_v4 as catalogue
    where catalogue.restaurant_id = r.id
  );

revoke all on public.consumer_public_restaurant_about_v1 from public, anon, authenticated;
grant select on public.consumer_public_restaurant_about_v1 to anon, authenticated;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'consumer_public_restaurant_about_v1';
  if v_count <> 2 then
    raise exception 'RA-2G-P1-R1: public About projection column count changed';
  end if;

  select pg_catalog.count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'consumer_public_restaurant_about_v1'
    and column_name in ('restaurant_id', 'restaurant_about');
  if v_count <> 2 then
    raise exception 'RA-2G-P1-R1: public About projection column contract changed';
  end if;

  if not pg_catalog.has_table_privilege('anon', 'public.consumer_public_restaurant_about_v1', 'SELECT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.consumer_public_restaurant_about_v1', 'SELECT')
  then
    raise exception 'RA-2G-P1-R1: anon/authenticated SELECT grant changed';
  end if;
end
$$;

commit;
