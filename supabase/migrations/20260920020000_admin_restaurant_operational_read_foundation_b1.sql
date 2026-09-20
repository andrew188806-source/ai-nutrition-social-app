-- ADMIN-B1: Platform Admin Restaurant operational READ foundation.
--
-- Fourteen read-only, purpose-built contracts for the accepted ADMIN-B Restaurant routes. Every contract is
-- a SECURITY DEFINER function owned by ONE sealed, column-scoped reader role; it requires the verified staff
-- caller to hold BOTH `admin_context.read` (the base admission every staff RPC requires) AND the exact
-- ADMIN-AE1 operational read key for its route, checked FIRST, before any table is touched. There is no
-- fallback: base Admin without the exact key receives `forbidden` and no data.
--
-- Read-only boundary: the sealed reader holds SELECT only (column-scoped, no other privilege), the functions
-- are STABLE, and no client role receives any table privilege. Existing Restaurant Owner / Consumer RLS is not
-- changed: the only policy additions are permissive SELECT policies that name the sealed reader role alone
-- (an RLS-enabled table silently returns zero rows to a role without one).
--
-- Deliberately NOT exposed (data minimisation / undecided product questions): restaurants.legal_name and
-- restaurants.plan, category tag internals, geocode provider references / address fingerprints / last errors,
-- restaurant user accounts, auth identifiers, membership personal data (only counts and an owner-present flag),
-- ingredient data (no source table exists) and any Nutritionist/certification queue.

begin;

create role staff_admin_restaurant_reader nologin noinherit nobypassrls;
comment on role staff_admin_restaurant_reader is
  'ADMIN-B1 sealed Platform Admin Restaurant operational reader. Column-scoped SELECT only; owns the read contracts; no login, client membership or write privilege.';

grant usage on schema admin_internal to staff_admin_restaurant_reader;
grant usage on schema public to staff_admin_restaurant_reader;

grant select (id, name, city, category, status, created_at, public_website_url, public_website_url_version,
  restaurant_about, restaurant_about_source, restaurant_about_version)
  on table public.restaurants to staff_admin_restaurant_reader;
grant select (id, restaurant_id, name, district, address, status, status_version, timezone_name, public_phone,
  public_phone_version, latitude, longitude, geocode_status, geocode_provider, geocode_resolved_at, geocode_attempts)
  on table public.restaurant_branches to staff_admin_restaurant_reader;
grant select (id, restaurant_id, name, status) on table public.menus to staff_admin_restaurant_reader;
grant select (id, menu_id, name, sort_order) on table public.menu_categories to staff_admin_restaurant_reader;
grant select (id, restaurant_id, menu_category_id, name, description, image_url, allergens, status,
  nutrition_badge_status, badge_enabled)
  on table public.menu_items to staff_admin_restaurant_reader;
grant select (id, restaurant_id, branch_id, menu_item_id, price, availability, sold_out, branch_specific_name,
  branch_specific_status)
  on table public.branch_menu_items to staff_admin_restaurant_reader;
grant select (id, menu_item_id, calories, protein, carbohydrates, fat, fiber, sugar, sodium, saturated_fat,
  serving_size, source, confidence_score, verified_status, is_current, updated_at)
  on table public.menu_item_nutrition to staff_admin_restaurant_reader;
grant select (branch_id, weekday, start_local_time, end_local_time, end_day_offset)
  on table public.restaurant_branch_weekly_hour_intervals to staff_admin_restaurant_reader;
grant select (id, branch_id, local_date, mode)
  on table public.restaurant_branch_special_hour_overrides to staff_admin_restaurant_reader;
grant select (override_id, start_local_time, end_local_time, end_day_offset)
  on table public.restaurant_branch_special_hour_intervals to staff_admin_restaurant_reader;
grant select (branch_id, starts_at, ends_at, cancelled_at)
  on table public.restaurant_branch_operational_closures to staff_admin_restaurant_reader;
grant select (branch_id, weekly_hours_configured)
  on table public.restaurant_branch_temporal_state to staff_admin_restaurant_reader;
grant select (restaurant_id, provider, public_url)
  on table public.restaurant_public_social_links to staff_admin_restaurant_reader;
grant select (restaurant_id, status, role_id) on table public.restaurant_memberships to staff_admin_restaurant_reader;
grant select (id, role_key) on table public.restaurant_roles to staff_admin_restaurant_reader;

create policy staff_admin_restaurant_reader_select on public.restaurants for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_branches for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.menus for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.menu_categories for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.menu_items for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.branch_menu_items for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.menu_item_nutrition for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_branch_weekly_hour_intervals for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_branch_special_hour_overrides for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_branch_special_hour_intervals for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_branch_operational_closures for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_branch_temporal_state for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_public_social_links for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_memberships for select to staff_admin_restaurant_reader using (true);
create policy staff_admin_restaurant_reader_select on public.restaurant_roles for select to staff_admin_restaurant_reader using (true);

-- The reader may call only the frozen exact staff predicate. Settle this grant as the predicate's sealed owner.
grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
set role staff_authority_context_reader;
grant execute on function public.staff_has_permission_v1(text) to staff_admin_restaurant_reader;
reset role;

grant create on schema admin_internal to staff_admin_restaurant_reader;
grant create on schema public to staff_admin_restaurant_reader;

-- ---------------------------------------------------------------------------------------------------------------
-- Private helpers (admin_internal; executable only by the sealed reader)
-- ---------------------------------------------------------------------------------------------------------------
create function admin_internal.staff_admin_restaurant_read_gate_v1(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select p_permission_key is not null
    and public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1(p_permission_key);
$$;
comment on function admin_internal.staff_admin_restaurant_read_gate_v1(text) is
  'ADMIN-B1 private gate: the verified staff caller must hold admin_context.read AND the one exact operational read key. No fallback.';

create function admin_internal.staff_admin_restaurant_read_valid_id_v1(p_id text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_id is not null and pg_catalog.length(p_id) between 1 and 200 and p_id = pg_catalog.btrim(p_id);
$$;
comment on function admin_internal.staff_admin_restaurant_read_valid_id_v1(text) is
  'ADMIN-B1 private identifier shape check (1-200 characters, no surrounding whitespace).';

-- ---------------------------------------------------------------------------------------------------------------
-- Contracts. Envelope: {state: ready|forbidden|invalid_request|not_found, ...}. Lists take p_limit (default 20,
-- 1..50) and p_offset (default 0, 0..10000); out-of-range values are REJECTED (invalid_request), never clamped.
-- Every list orders by a total order and returns {items, limit, offset, hasMore}.
-- ---------------------------------------------------------------------------------------------------------------

-- 1. Restaurant list -- admin.restaurants.read
create function public.staff_admin_restaurant_list_v1(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by r.name collate "C", r.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object(
        'restaurantId', r.id, 'name', r.name, 'city', r.city, 'category', r.category, 'status', r.status,
        'createdAt', r.created_at,
        'branchCount', (select pg_catalog.count(*) from public.restaurant_branches b where b.restaurant_id = r.id),
        'activeMembershipCount', (select pg_catalog.count(*) from public.restaurant_memberships m
          where m.restaurant_id = r.id and m.status = 'active'),
        'hasActiveOwner', exists (select 1 from public.restaurant_memberships m
          join public.restaurant_roles rl on rl.id = m.role_id
          where m.restaurant_id = r.id and m.status = 'active' and rl.role_key = 'owner')
      ) as item
    from public.restaurants r
    order by r.name collate "C", r.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 2. Restaurant detail -- admin.restaurants.read
create function public.staff_admin_restaurant_detail_v1(p_restaurant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object(
    'state', 'ready', 'restaurantId', r.id, 'name', r.name, 'city', r.city, 'category', r.category,
    'status', r.status, 'createdAt', r.created_at,
    'branchCount', (select pg_catalog.count(*) from public.restaurant_branches b where b.restaurant_id = r.id),
    'activeBranchCount', (select pg_catalog.count(*) from public.restaurant_branches b where b.restaurant_id = r.id and b.status = 'active'),
    'menuCount', (select pg_catalog.count(*) from public.menus mn where mn.restaurant_id = r.id),
    'menuItemCount', (select pg_catalog.count(*) from public.menu_items mi where mi.restaurant_id = r.id),
    'activeMembershipCount', (select pg_catalog.count(*) from public.restaurant_memberships m
      where m.restaurant_id = r.id and m.status = 'active'),
    'hasActiveOwner', exists (select 1 from public.restaurant_memberships m
      join public.restaurant_roles rl on rl.id = m.role_id
      where m.restaurant_id = r.id and m.status = 'active' and rl.role_key = 'owner'))
  into v_result
  from public.restaurants r where r.id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 3. Restaurant about -- admin.restaurants.about.read
create function public.staff_admin_restaurant_about_v1(p_restaurant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.about.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,
    'about', r.restaurant_about, 'aboutSource', r.restaurant_about_source, 'aboutVersion', r.restaurant_about_version::text)
  into v_result from public.restaurants r where r.id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 4. Restaurant contact -- admin.restaurants.contact.read
create function public.staff_admin_restaurant_contact_v1(p_restaurant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.contact.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,
    'publicWebsiteUrl', r.public_website_url, 'publicWebsiteUrlVersion', r.public_website_url_version::text,
    'socialLinks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('provider', l.provider, 'publicUrl', l.public_url)
      order by l.provider collate "C") from public.restaurant_public_social_links l where l.restaurant_id = r.id), '[]'::jsonb))
  into v_result from public.restaurants r where r.id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 5. Branch list for one Restaurant -- admin.restaurants.branches.read
create function public.staff_admin_restaurant_branch_list_v1(p_restaurant_id text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.branches.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id) then
    return pg_catalog.jsonb_build_object('state', 'not_found');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by b.name collate "C", b.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object('branchId', b.id, 'restaurantId', b.restaurant_id, 'name', b.name,
        'district', b.district, 'status', b.status) as item
    from public.restaurant_branches b
    where b.restaurant_id = p_restaurant_id
    order by b.name collate "C", b.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', p_restaurant_id, 'items', v_items,
    'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 6. Branch detail -- admin.restaurants.branches.read
create function public.staff_admin_restaurant_branch_detail_v1(p_restaurant_id text, p_branch_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.branches.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_branch_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'branchId', b.id, 'restaurantId', b.restaurant_id,
    'name', b.name, 'district', b.district, 'address', b.address, 'status', b.status,
    'statusVersion', b.status_version::text, 'timezoneName', b.timezone_name,
    'menuItemLinkCount', (select pg_catalog.count(*) from public.branch_menu_items x
      where x.branch_id = b.id and x.restaurant_id = b.restaurant_id))
  into v_result from public.restaurant_branches b
  where b.id = p_branch_id and b.restaurant_id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 7. Branch contact -- admin.restaurants.contact.read
create function public.staff_admin_restaurant_branch_contact_v1(p_restaurant_id text, p_branch_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.contact.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_branch_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'branchId', b.id, 'restaurantId', b.restaurant_id,
    'name', b.name, 'publicPhone', b.public_phone, 'publicPhoneVersion', b.public_phone_version::text)
  into v_result from public.restaurant_branches b
  where b.id = p_branch_id and b.restaurant_id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 8. Branch hours -- admin.restaurants.hours.read
create function public.staff_admin_restaurant_branch_hours_v1(p_restaurant_id text, p_branch_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.hours.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_branch_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'branchId', b.id, 'restaurantId', b.restaurant_id,
    'timezoneName', b.timezone_name,
    'weeklyHoursConfigured', coalesce((select t.weekly_hours_configured from public.restaurant_branch_temporal_state t where t.branch_id = b.id), false),
    'weekly', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('weekday', w.weekday,
        'start', w.start_local_time::text, 'end', w.end_local_time::text, 'endDayOffset', w.end_day_offset)
        order by w.weekday, w.start_local_time)
      from public.restaurant_branch_weekly_hour_intervals w where w.branch_id = b.id), '[]'::jsonb),
    'special', coalesce((select pg_catalog.jsonb_agg(s.item order by s.local_date desc, s.id) from (
        select o.id, o.local_date, pg_catalog.jsonb_build_object('localDate', o.local_date, 'mode', o.mode,
          'intervals', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('start', i.start_local_time::text,
              'end', i.end_local_time::text, 'endDayOffset', i.end_day_offset) order by i.start_local_time)
            from public.restaurant_branch_special_hour_intervals i where i.override_id = o.id), '[]'::jsonb)) as item
        from public.restaurant_branch_special_hour_overrides o where o.branch_id = b.id
        order by o.local_date desc, o.id limit 100) s), '[]'::jsonb),
    'closures', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('startsAt', c.starts_at, 'endsAt', c.ends_at)
        order by c.starts_at, c.ends_at)
      from (select x.starts_at, x.ends_at from public.restaurant_branch_operational_closures x
        where x.branch_id = b.id and x.cancelled_at is null and (x.ends_at is null or x.ends_at > pg_catalog.statement_timestamp())
        order by x.starts_at, x.ends_at limit 50) c), '[]'::jsonb))
  into v_result from public.restaurant_branches b
  where b.id = p_branch_id and b.restaurant_id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 9. Branch geo (restaurant operational geo only; no user location) -- admin.restaurants.geo.read
create function public.staff_admin_restaurant_branch_geo_v1(p_restaurant_id text, p_branch_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.geo.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_branch_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'branchId', b.id, 'restaurantId', b.restaurant_id,
    'address', b.address, 'latitude', b.latitude, 'longitude', b.longitude, 'geocodeStatus', b.geocode_status,
    'geocodeProvider', b.geocode_provider, 'geocodeResolvedAt', b.geocode_resolved_at, 'geocodeAttempts', b.geocode_attempts)
  into v_result from public.restaurant_branches b
  where b.id = p_branch_id and b.restaurant_id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 10. Menu list for one Restaurant -- admin.restaurants.menus.read
create function public.staff_admin_restaurant_menu_list_v1(p_restaurant_id text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menus.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id) then
    return pg_catalog.jsonb_build_object('state', 'not_found');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by mn.name collate "C", mn.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object('menuId', mn.id, 'restaurantId', mn.restaurant_id, 'name', mn.name, 'status', mn.status,
        'categoryCount', (select pg_catalog.count(*) from public.menu_categories c where c.menu_id = mn.id),
        'itemCount', (select pg_catalog.count(*) from public.menu_items mi
          join public.menu_categories c on c.id = mi.menu_category_id
          where c.menu_id = mn.id and mi.restaurant_id = mn.restaurant_id)) as item
    from public.menus mn
    where mn.restaurant_id = p_restaurant_id
    order by mn.name collate "C", mn.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', p_restaurant_id, 'items', v_items,
    'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 11. Menu detail (menu + categories) -- admin.restaurants.menu.read
create function public.staff_admin_restaurant_menu_detail_v1(p_restaurant_id text, p_menu_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_menu_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'menuId', mn.id, 'restaurantId', mn.restaurant_id,
    'name', mn.name, 'status', mn.status,
    'categories', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('categoryId', c.id, 'name', c.name,
        'sortOrder', c.sort_order, 'itemCount', (select pg_catalog.count(*) from public.menu_items mi
          where mi.menu_category_id = c.id and mi.restaurant_id = mn.restaurant_id))
        order by c.sort_order, c.name collate "C", c.id collate "C")
      from (select x.id, x.name, x.sort_order from public.menu_categories x where x.menu_id = mn.id
        order by x.sort_order, x.name collate "C", x.id collate "C" limit 100) c), '[]'::jsonb))
  into v_result from public.menus mn
  where mn.id = p_menu_id and mn.restaurant_id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 12. Menu item list for one Restaurant (optionally one of its menus) -- admin.restaurants.menu_items.read
create function public.staff_admin_restaurant_menu_item_list_v1(
  p_restaurant_id text, p_menu_id text default null, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_items.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or (p_menu_id is not null and not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_menu_id))
    or v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id)
    or (p_menu_id is not null and not exists (select 1 from public.menus mn where mn.id = p_menu_id and mn.restaurant_id = p_restaurant_id)) then
    return pg_catalog.jsonb_build_object('state', 'not_found');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by mn.name collate "C", c.sort_order, mi.name collate "C", mi.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object('menuItemId', mi.id, 'restaurantId', mi.restaurant_id, 'name', mi.name,
        'status', mi.status, 'menuId', mn.id, 'menuName', mn.name, 'categoryId', c.id, 'categoryName', c.name,
        'nutritionBadgeStatus', mi.nutrition_badge_status, 'badgeEnabled', mi.badge_enabled) as item
    from public.menu_items mi
    join public.menu_categories c on c.id = mi.menu_category_id
    join public.menus mn on mn.id = c.menu_id and mn.restaurant_id = mi.restaurant_id
    where mi.restaurant_id = p_restaurant_id
      and (p_menu_id is null or mn.id = p_menu_id)
    order by mn.name collate "C", c.sort_order, mi.name collate "C", mi.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', p_restaurant_id, 'menuId', p_menu_id,
    'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 13. Menu item detail (status fields + the current nutrition record) -- admin.restaurants.menu_item.read
create function public.staff_admin_restaurant_menu_item_detail_v1(p_restaurant_id text, p_menu_item_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_item.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_menu_item_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object('state', 'ready', 'menuItemId', mi.id, 'restaurantId', mi.restaurant_id,
    'name', mi.name, 'description', mi.description, 'imageUrl', mi.image_url, 'status', mi.status,
    'menuId', mn.id, 'menuName', mn.name, 'categoryId', c.id, 'categoryName', c.name,
    'allergens', pg_catalog.to_jsonb(mi.allergens),
    'nutritionBadgeStatus', mi.nutrition_badge_status, 'badgeEnabled', mi.badge_enabled,
    'branchLinkCount', (select pg_catalog.count(*) from public.branch_menu_items x
      where x.menu_item_id = mi.id and x.restaurant_id = mi.restaurant_id),
    'currentNutrition', (select pg_catalog.jsonb_build_object('source', n.source, 'verifiedStatus', n.verified_status,
        'confidenceScore', n.confidence_score, 'servingSize', n.serving_size, 'calories', n.calories, 'protein', n.protein,
        'carbohydrates', n.carbohydrates, 'fat', n.fat, 'fiber', n.fiber, 'sugar', n.sugar, 'sodium', n.sodium,
        'saturatedFat', n.saturated_fat, 'updatedAt', n.updated_at)
      from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.is_current
      order by n.updated_at desc, n.id limit 1))
  into v_result
  from public.menu_items mi
  join public.menu_categories c on c.id = mi.menu_category_id
  join public.menus mn on mn.id = c.menu_id and mn.restaurant_id = mi.restaurant_id
  where mi.id = p_menu_item_id and mi.restaurant_id = p_restaurant_id;
  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));
end;
$$;

-- 14. Branch menu items (branch <-> item relationships) -- admin.restaurants.menu_items.read
create function public.staff_admin_restaurant_branch_menu_item_list_v1(
  p_restaurant_id text, p_branch_id text, p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_items.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_restaurant_id)
    or not admin_internal.staff_admin_restaurant_read_valid_id_v1(p_branch_id)
    or v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  if not exists (select 1 from public.restaurant_branches b where b.id = p_branch_id and b.restaurant_id = p_restaurant_id) then
    return pg_catalog.jsonb_build_object('state', 'not_found');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by mi.name collate "C", x.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object('branchMenuItemId', x.id, 'branchId', x.branch_id, 'restaurantId', x.restaurant_id,
        'menuItemId', mi.id, 'menuItemName', mi.name, 'menuItemStatus', mi.status, 'branchSpecificName', x.branch_specific_name,
        'price', x.price, 'availability', x.availability, 'soldOut', x.sold_out,
        'branchSpecificStatus', x.branch_specific_status) as item
    from public.branch_menu_items x
    join public.menu_items mi on mi.id = x.menu_item_id and mi.restaurant_id = x.restaurant_id
    where x.branch_id = p_branch_id and x.restaurant_id = p_restaurant_id
    order by mi.name collate "C", x.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'branchId', p_branch_id, 'restaurantId', p_restaurant_id,
    'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Comments, ACLs (settled BEFORE ownership transfers), ownership
-- ---------------------------------------------------------------------------------------------------------------
comment on function public.staff_admin_restaurant_list_v1(integer, integer) is 'ADMIN-B1 bounded Restaurant list. Requires admin_context.read + admin.restaurants.read. Read-only.';
comment on function public.staff_admin_restaurant_detail_v1(text) is 'ADMIN-B1 Restaurant detail. Requires admin_context.read + admin.restaurants.read. Read-only.';
comment on function public.staff_admin_restaurant_about_v1(text) is 'ADMIN-B1 Restaurant about. Requires admin_context.read + admin.restaurants.about.read. Read-only.';
comment on function public.staff_admin_restaurant_contact_v1(text) is 'ADMIN-B1 Restaurant public contact. Requires admin_context.read + admin.restaurants.contact.read. Read-only.';
comment on function public.staff_admin_restaurant_branch_list_v1(text, integer, integer) is 'ADMIN-B1 bounded Branch list of one Restaurant. Requires admin_context.read + admin.restaurants.branches.read. Read-only.';
comment on function public.staff_admin_restaurant_branch_detail_v1(text, text) is 'ADMIN-B1 Branch detail (exact Restaurant/Branch pair). Requires admin_context.read + admin.restaurants.branches.read. Read-only.';
comment on function public.staff_admin_restaurant_branch_contact_v1(text, text) is 'ADMIN-B1 Branch public phone. Requires admin_context.read + admin.restaurants.contact.read. Read-only.';
comment on function public.staff_admin_restaurant_branch_hours_v1(text, text) is 'ADMIN-B1 Branch weekly/special hours and open closures. Requires admin_context.read + admin.restaurants.hours.read. Read-only.';
comment on function public.staff_admin_restaurant_branch_geo_v1(text, text) is 'ADMIN-B1 Branch operational geo. Requires admin_context.read + admin.restaurants.geo.read. Read-only.';
comment on function public.staff_admin_restaurant_menu_list_v1(text, integer, integer) is 'ADMIN-B1 bounded Menu list of one Restaurant. Requires admin_context.read + admin.restaurants.menus.read. Read-only.';
comment on function public.staff_admin_restaurant_menu_detail_v1(text, text) is 'ADMIN-B1 Menu detail with categories (exact Restaurant/Menu pair). Requires admin_context.read + admin.restaurants.menu.read. Read-only.';
comment on function public.staff_admin_restaurant_menu_item_list_v1(text, text, integer, integer) is 'ADMIN-B1 bounded Menu Item list of one Restaurant (optionally one Menu). Requires admin_context.read + admin.restaurants.menu_items.read. Read-only.';
comment on function public.staff_admin_restaurant_menu_item_detail_v1(text, text) is 'ADMIN-B1 Menu Item detail with current nutrition record. Requires admin_context.read + admin.restaurants.menu_item.read. Read-only.';
comment on function public.staff_admin_restaurant_branch_menu_item_list_v1(text, text, integer, integer) is 'ADMIN-B1 bounded Branch-Menu-Item list (exact Restaurant/Branch pair). Requires admin_context.read + admin.restaurants.menu_items.read. Read-only.';

revoke all on function
  admin_internal.staff_admin_restaurant_read_gate_v1(text),
  admin_internal.staff_admin_restaurant_read_valid_id_v1(text),
  public.staff_admin_restaurant_list_v1(integer, integer),
  public.staff_admin_restaurant_detail_v1(text),
  public.staff_admin_restaurant_about_v1(text),
  public.staff_admin_restaurant_contact_v1(text),
  public.staff_admin_restaurant_branch_list_v1(text, integer, integer),
  public.staff_admin_restaurant_branch_detail_v1(text, text),
  public.staff_admin_restaurant_branch_contact_v1(text, text),
  public.staff_admin_restaurant_branch_hours_v1(text, text),
  public.staff_admin_restaurant_branch_geo_v1(text, text),
  public.staff_admin_restaurant_menu_list_v1(text, integer, integer),
  public.staff_admin_restaurant_menu_detail_v1(text, text),
  public.staff_admin_restaurant_menu_item_list_v1(text, text, integer, integer),
  public.staff_admin_restaurant_menu_item_detail_v1(text, text),
  public.staff_admin_restaurant_branch_menu_item_list_v1(text, text, integer, integer)
from public, anon, authenticated, authenticator, service_role, staff_admin_restaurant_reader;

grant execute on function
  admin_internal.staff_admin_restaurant_read_gate_v1(text),
  admin_internal.staff_admin_restaurant_read_valid_id_v1(text)
to staff_admin_restaurant_reader;

grant execute on function
  public.staff_admin_restaurant_list_v1(integer, integer),
  public.staff_admin_restaurant_detail_v1(text),
  public.staff_admin_restaurant_about_v1(text),
  public.staff_admin_restaurant_contact_v1(text),
  public.staff_admin_restaurant_branch_list_v1(text, integer, integer),
  public.staff_admin_restaurant_branch_detail_v1(text, text),
  public.staff_admin_restaurant_branch_contact_v1(text, text),
  public.staff_admin_restaurant_branch_hours_v1(text, text),
  public.staff_admin_restaurant_branch_geo_v1(text, text),
  public.staff_admin_restaurant_menu_list_v1(text, integer, integer),
  public.staff_admin_restaurant_menu_detail_v1(text, text),
  public.staff_admin_restaurant_menu_item_list_v1(text, text, integer, integer),
  public.staff_admin_restaurant_menu_item_detail_v1(text, text),
  public.staff_admin_restaurant_branch_menu_item_list_v1(text, text, integer, integer)
to authenticated;

grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;

alter function admin_internal.staff_admin_restaurant_read_gate_v1(text) owner to staff_admin_restaurant_reader;
alter function admin_internal.staff_admin_restaurant_read_valid_id_v1(text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_list_v1(integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_detail_v1(text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_about_v1(text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_contact_v1(text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_branch_list_v1(text, integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_branch_detail_v1(text, text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_branch_contact_v1(text, text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_branch_hours_v1(text, text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_branch_geo_v1(text, text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_menu_list_v1(text, integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_menu_detail_v1(text, text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_menu_item_list_v1(text, text, integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_menu_item_detail_v1(text, text) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_restaurant_branch_menu_item_list_v1(text, text, integer, integer) owner to staff_admin_restaurant_reader;

revoke create on schema public from staff_admin_restaurant_reader;
revoke create on schema admin_internal from staff_admin_restaurant_reader;
revoke staff_authority_context_reader from postgres granted by postgres;
revoke staff_admin_restaurant_reader from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------------------------
-- Fail-closed postconditions: exact object set, security mode, ACL, ownership, permission mapping, read-only.
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare
  v_expected constant jsonb := '{
    "staff_admin_restaurant_list_v1": "admin.restaurants.read",
    "staff_admin_restaurant_detail_v1": "admin.restaurants.read",
    "staff_admin_restaurant_about_v1": "admin.restaurants.about.read",
    "staff_admin_restaurant_contact_v1": "admin.restaurants.contact.read",
    "staff_admin_restaurant_branch_list_v1": "admin.restaurants.branches.read",
    "staff_admin_restaurant_branch_detail_v1": "admin.restaurants.branches.read",
    "staff_admin_restaurant_branch_contact_v1": "admin.restaurants.contact.read",
    "staff_admin_restaurant_branch_hours_v1": "admin.restaurants.hours.read",
    "staff_admin_restaurant_branch_geo_v1": "admin.restaurants.geo.read",
    "staff_admin_restaurant_menu_list_v1": "admin.restaurants.menus.read",
    "staff_admin_restaurant_menu_detail_v1": "admin.restaurants.menu.read",
    "staff_admin_restaurant_menu_item_list_v1": "admin.restaurants.menu_items.read",
    "staff_admin_restaurant_menu_item_detail_v1": "admin.restaurants.menu_item.read",
    "staff_admin_restaurant_branch_menu_item_list_v1": "admin.restaurants.menu_items.read"}'::jsonb;
  v_fn record;
  v_seen integer := 0;
  v_owner constant text := 'staff_admin_restaurant_reader';
begin
  for v_fn in
    select p.oid, p.proname, p.prosecdef, p.provolatile, p.proconfig, p.prosrc, pg_catalog.pg_get_userbyid(p.proowner) as owner_name
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'staff\_admin\_restaurant\_%' escape '\'
      and p.proname not in ('staff_admin_restaurant_branch_status_v1')
  loop
    v_seen := v_seen + 1;
    if not (v_expected ? v_fn.proname) then raise exception using errcode = '23514', message = 'b1_unexpected_contract_' || v_fn.proname; end if;
    if not v_fn.prosecdef or v_fn.provolatile <> 's' or v_fn.owner_name <> v_owner
      or not (v_fn.proconfig @> array['search_path=""', 'row_security=on']) then
      raise exception using errcode = '23514', message = 'b1_contract_mode_mismatch_' || v_fn.proname;
    end if;
    -- exact permission mapping: the body checks its one key through the private gate, first.
    if pg_catalog.strpos(v_fn.prosrc, 'staff_admin_restaurant_read_gate_v1(''' || (v_expected ->> v_fn.proname) || ''')') = 0
      or pg_catalog.strpos(v_fn.prosrc, 'admin_context.read') > 0 then
      raise exception using errcode = '23514', message = 'b1_contract_permission_mismatch_' || v_fn.proname;
    end if;
    -- read-only: no write verb anywhere in the body.
    if v_fn.prosrc ~* '(^|[^a-z_])(insert|update|delete|truncate|merge|alter|drop|create|grant|revoke)[[:space:]]' then
      raise exception using errcode = '23514', message = 'b1_contract_not_read_only_' || v_fn.proname;
    end if;
    if exists (select 1 from pg_catalog.aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_fn.oid), '{}'::aclitem[])) a where a.grantee = 0)
      or pg_catalog.has_function_privilege('anon', v_fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticator', v_fn.oid, 'EXECUTE')
      or not pg_catalog.has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception using errcode = '23514', message = 'b1_contract_acl_mismatch_' || v_fn.proname;
    end if;
    if (select pg_catalog.count(*) from pg_catalog.aclexplode((select proacl from pg_catalog.pg_proc where oid = v_fn.oid)) a) <> 2 then
      raise exception using errcode = '23514', message = 'b1_contract_acl_extra_grantee_' || v_fn.proname;
    end if;
  end loop;
  if v_seen <> 14 then raise exception using errcode = '23514', message = 'b1_contract_count_mismatch'; end if;

  -- private helpers: sealed-reader only.
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'admin_internal' and p.proname in ('staff_admin_restaurant_read_gate_v1', 'staff_admin_restaurant_read_valid_id_v1')
      and (pg_catalog.pg_get_userbyid(p.proowner) <> v_owner
        or (select pg_catalog.count(*) from pg_catalog.aclexplode(p.proacl) a) <> 1
        or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee = 0))
  ) or (select pg_catalog.count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'admin_internal' and p.proname like 'staff\_admin\_restaurant\_read\_%' escape '\') <> 2
  then
    raise exception using errcode = '23514', message = 'b1_helper_mismatch';
  end if;

  -- sealed reader: no login/inherit/bypassrls, no membership anywhere, no write or extra privilege, no client table grants.
  if exists (select 1 from pg_catalog.pg_roles where rolname = v_owner and (rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb))
    -- the reader belongs to no role, and only the platform creator (postgres) may appear as a member of it
    or exists (select 1 from pg_catalog.pg_auth_members m where m.member = (select oid from pg_catalog.pg_roles where rolname = v_owner))
    or exists (select 1 from pg_catalog.pg_auth_members m where m.roleid = (select oid from pg_catalog.pg_roles where rolname = v_owner)
      and m.member <> (select oid from pg_catalog.pg_roles where rolname = 'postgres'))
    or pg_catalog.pg_has_role('postgres', v_owner, 'SET') then
    raise exception using errcode = '23514', message = 'b1_reader_role_mismatch';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants g
    where g.grantee = v_owner and g.privilege_type <> 'SELECT'
  ) or exists (
    select 1 from information_schema.column_privileges g where g.grantee = v_owner and g.privilege_type <> 'SELECT'
  ) then
    raise exception using errcode = '23514', message = 'b1_reader_non_select_privilege';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies where policyname = 'staff_admin_restaurant_reader_select' and roles = array[v_owner]::name[]) <> 15
    or exists (select 1 from pg_catalog.pg_policies where policyname = 'staff_admin_restaurant_reader_select' and (cmd <> 'SELECT' or qual <> 'true')) then
    raise exception using errcode = '23514', message = 'b1_reader_policy_mismatch';
  end if;
  -- no client-role privilege was added to any Restaurant table (whole-table SELECT for anon/authenticated on the
  -- internal operational tables would be raw exposure; the two client roles must not gain SELECT here).
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('restaurant_memberships', 'restaurant_roles', 'restaurant_branch_temporal_state')
      and (pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT'))
  ) then
    raise exception using errcode = '23514', message = 'b1_client_table_grant_present';
  end if;
  if pg_catalog.pg_has_role('postgres', 'staff_authority_context_reader', 'SET') then
    raise exception using errcode = '23514', message = 'b1_context_reader_set_edge_retained';
  end if;
end;
$$;

commit;
