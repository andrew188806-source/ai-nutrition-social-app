begin;

-- RA-2I-P1B: one restaurant-global public website. NULL means unpublished.
alter table public.role_permissions drop constraint role_permissions_permission_key_check;
alter table public.role_permissions
  add constraint role_permissions_permission_key_check
  check (permission_key in (
    'access_context.read', 'restaurant.read', 'branch.read', 'menu.read', 'nutrition.read',
    'branch_menu_item.sold_out.write', 'branch_menu_item.availability.write',
    'branch_menu_item.price.write', 'branch_menu_item.visibility.write',
    'branch.profile.display_name.write', 'branch_menu_item.display_name.write',
    'branch.hours.weekly.write', 'branch.hours.special.write',
    'branch.operational_closure.write', 'branch.profile.public_phone.write',
    'restaurant.profile.public_website.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;
insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'restaurant.profile.public_website.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'restaurant.profile.public_website.write'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner' and role.status = 'active';
  if v_count <> 1 then
    raise exception 'RA-2I-P1B: expected one active owner/restaurant public-website permission';
  end if;
end
$$;
alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

alter table public.restaurants
  add column public_website_url text,
  add column public_website_url_version bigint not null default 0,
  add constraint restaurants_public_website_url_canonical_check check (
    public_website_url is null or (
      public_website_url = pg_catalog.btrim(public_website_url)
      and pg_catalog.char_length(public_website_url) between 1 and 2048
      and public_website_url !~ '[\x00-\x1F\x7F-\x9F]'
      and public_website_url !~ '[[:space:]]'
      and public_website_url ~ '^https?://[^/@[:space:]]+([/?#]|$)'
    )
  ),
  add constraint restaurants_public_website_url_version_non_negative_check
    check (public_website_url_version >= 0);

create function public.bump_restaurant_public_website_url_version_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.public_website_url_version := old.public_website_url_version + 1;
  return new;
end;
$$;
create trigger restaurants_public_website_url_version_trigger
  before update of public_website_url on public.restaurants
  for each row
  when (old.public_website_url is distinct from new.public_website_url)
  execute function public.bump_restaurant_public_website_url_version_v1();

create role restaurant_owner_public_website_write_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_public_website_write_authority is
  'RA-2I-P1B sealed restaurant-global public-website writer. It may update restaurants.public_website_url only.';
grant restaurant_owner_public_website_write_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_public_website_write_authority;

create table restaurant_internal.restaurant_public_website_audit_log (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  action text not null check (action in ('SET', 'CLEAR')),
  previous_public_website_url text,
  next_public_website_url text,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint restaurant_public_website_audit_transition_check
    check (previous_public_website_url is distinct from next_public_website_url),
  constraint restaurant_public_website_audit_action_check
    check ((action = 'SET' and next_public_website_url is not null)
      or (action = 'CLEAR' and next_public_website_url is null)),
  constraint restaurant_public_website_audit_version_check
    check (previous_version >= 0 and next_version = previous_version + 1)
);
create index restaurant_public_website_audit_created_at_idx
  on restaurant_internal.restaurant_public_website_audit_log (created_at desc);
create index restaurant_public_website_audit_target_idx
  on restaurant_internal.restaurant_public_website_audit_log (restaurant_id, created_at desc);
alter table restaurant_internal.restaurant_public_website_audit_log enable row level security;
alter table restaurant_internal.restaurant_public_website_audit_log force row level security;
create policy restaurant_public_website_audit_writer_select
  on restaurant_internal.restaurant_public_website_audit_log
  for select to restaurant_owner_public_website_write_authority using (true);
create policy restaurant_public_website_audit_writer_insert
  on restaurant_internal.restaurant_public_website_audit_log
  for insert to restaurant_owner_public_website_write_authority with check (true);
revoke all on table restaurant_internal.restaurant_public_website_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.restaurant_public_website_audit_log
  to restaurant_owner_public_website_write_authority;

grant select (id, auth_user_id, login_status)
  on public.restaurant_users to restaurant_owner_public_website_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on public.restaurant_memberships to restaurant_owner_public_website_write_authority;
grant select (id, role_key, status)
  on public.restaurant_roles to restaurant_owner_public_website_write_authority;
grant select (role_id, permission_key, permission_scope)
  on public.role_permissions to restaurant_owner_public_website_write_authority;
grant select (id, public_website_url, public_website_url_version)
  on public.restaurants to restaurant_owner_public_website_write_authority;
grant update (public_website_url)
  on public.restaurants to restaurant_owner_public_website_write_authority;

create policy restaurant_users_owner_public_website_context_select
  on public.restaurant_users for select to restaurant_owner_public_website_write_authority using (true);
create policy restaurant_memberships_owner_public_website_context_select
  on public.restaurant_memberships for select to restaurant_owner_public_website_write_authority using (true);
create policy restaurant_roles_owner_public_website_context_select
  on public.restaurant_roles for select to restaurant_owner_public_website_write_authority using (true);
create policy role_permissions_owner_public_website_context_select
  on public.role_permissions for select to restaurant_owner_public_website_write_authority using (true);

create policy restaurants_owner_public_website_select
  on public.restaurants for select to restaurant_owner_public_website_write_authority using (true);
create policy restaurants_owner_public_website_update
  on public.restaurants for update to restaurant_owner_public_website_write_authority
  using (true)
  with check (
    public_website_url is null or (
      public_website_url = pg_catalog.btrim(public_website_url)
      and pg_catalog.char_length(public_website_url) between 1 and 2048
      and public_website_url !~ '[\x00-\x1F\x7F-\x9F]'
      and public_website_url !~ '[[:space:]]'
      and public_website_url ~ '^https?://[^/@[:space:]]+([/?#]|$)'
    )
  );
create policy restaurants_owner_public_website_tenant_select
  on public.restaurants as restrictive
  for select to restaurant_owner_public_website_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ));
create policy restaurants_owner_public_website_tenant_update
  on public.restaurants as restrictive
  for update to restaurant_owner_public_website_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ))
  with check (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub')
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ));

grant create on schema public to restaurant_owner_public_website_write_authority;
create function public.restaurant_owner_preview_public_website_v1(p_restaurant_id text)
returns jsonb language plpgsql stable security definer
set search_path = '' set row_security = 'on' as $$
declare v_actor uuid; v_target record;
begin
  begin
    v_actor := (coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'))::pg_catalog.uuid;
  exception when others then v_actor := null; end;
  if v_actor is null then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated'); end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  if not exists (
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles role on role.id = membership.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ) then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied'); end if;
  select restaurant.id, restaurant.public_website_url, restaurant.public_website_url_version
  into v_target
  from public.restaurants restaurant
  join public.restaurant_memberships membership
    on membership.restaurant_id = restaurant.id and membership.status = 'active'
  join public.restaurant_users caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
      and caller.login_status = 'enabled'
  join public.restaurant_roles role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions permission
    on permission.role_id = role.id
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  where restaurant.id = p_restaurant_id;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found'); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'state', 'ready',
    'restaurantId', v_target.id, 'publicWebsiteUrl', v_target.public_website_url,
    'publicWebsiteUrlVersion', v_target.public_website_url_version::text);
end;
$$;

create function public.restaurant_owner_set_public_website_v1(
  p_restaurant_id text, p_operation text, p_expected_public_website_url text,
  p_next_public_website_url text, p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare
  v_actor uuid; v_target record; v_next text; v_next_version bigint; v_audit_id uuid;
begin
  begin
    v_actor := (coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'))::pg_catalog.uuid;
  exception when others then v_actor := null; end;
  if v_actor is null then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated'); end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_operation is null or p_operation not in ('set', 'clear')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'set' and p_next_public_website_url is null)
    or (p_operation = 'clear' and p_next_public_website_url is not null)
  then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request'); end if;
  if not exists (
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles role on role.id = membership.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ) then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied'); end if;
  select restaurant.id, restaurant.public_website_url, restaurant.public_website_url_version,
    membership.id as membership_id
  into v_target
  from public.restaurants restaurant
  join public.restaurant_memberships membership
    on membership.restaurant_id = restaurant.id and membership.status = 'active'
  join public.restaurant_users caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
      and caller.login_status = 'enabled'
  join public.restaurant_roles role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions permission
    on permission.role_id = role.id
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  where restaurant.id = p_restaurant_id
  for update of restaurant;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found'); end if;
  if v_target.public_website_url is distinct from p_expected_public_website_url
    or v_target.public_website_url_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;
  v_next := case when p_operation = 'set' then pg_catalog.btrim(p_next_public_website_url) else null end;
  if p_operation = 'set' and (
    pg_catalog.char_length(v_next) < 1 or pg_catalog.char_length(v_next) > 2048
    or v_next ~ '[\x00-\x1F\x7F-\x9F]' or v_next ~ '[[:space:]]'
    or v_next !~ '^https?://[^/@[:space:]]+([/?#]|$)'
  ) then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request'); end if;
  if v_target.public_website_url is not distinct from v_next then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;
  update public.restaurants set public_website_url = v_next where id = v_target.id
  returning public_website_url_version into v_next_version;
  insert into restaurant_internal.restaurant_public_website_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, action,
      previous_public_website_url, next_public_website_url, previous_version, next_version)
  values (v_actor, v_target.membership_id, v_target.id,
    case when p_operation = 'set' then 'SET' else 'CLEAR' end,
    v_target.public_website_url, v_next, v_target.public_website_url_version, v_next_version)
  returning id into v_audit_id;
  return pg_catalog.jsonb_build_object('ok', true, 'state', 'applied',
    'restaurantId', v_target.id, 'publicWebsiteUrl', v_next,
    'publicWebsiteUrlVersion', v_next_version::text, 'auditId', v_audit_id);
end;
$$;

revoke all on function public.restaurant_owner_preview_public_website_v1(text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_public_website_v1(text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.bump_restaurant_public_website_url_version_v1()
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_preview_public_website_v1(text) to authenticated;
grant execute on function public.restaurant_owner_set_public_website_v1(text, text, text, text, bigint) to authenticated;
alter function public.restaurant_owner_preview_public_website_v1(text)
  owner to restaurant_owner_public_website_write_authority;
alter function public.restaurant_owner_set_public_website_v1(text, text, text, text, bigint)
  owner to restaurant_owner_public_website_write_authority;
revoke create on schema public from restaurant_owner_public_website_write_authority;
revoke restaurant_owner_public_website_write_authority from postgres granted by postgres;

-- Restaurant-level owner read successor.
grant select (public_website_url, public_website_url_version)
  on public.restaurants to restaurant_membership_context_reader;
grant restaurant_membership_context_reader to postgres
  with admin false, inherit false, set true;
grant create on schema public to restaurant_membership_context_reader;
create function public.restaurant_internal_restaurants_v2()
returns table (
  restaurant_id text, name text, city text, category text, status text,
  public_website_url text, public_website_url_version text
)
language sql stable security definer
set search_path = '' set row_security = 'on' as $$
  with authorized_scope as materialized (
    select access.restaurant_id
    from public.restaurant_current_access_context_v1() access
    where access.permission_key = 'access_context.read' and access.permission_scope = 'self'
  )
  select distinct restaurant.id, restaurant.name, restaurant.city, restaurant.category,
    restaurant.status, restaurant.public_website_url, restaurant.public_website_url_version::text
  from public.restaurants restaurant
  join authorized_scope scope on scope.restaurant_id = restaurant.id;
$$;
revoke all on function public.restaurant_internal_restaurants_v2()
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_internal_restaurants_v2() to authenticated;
alter function public.restaurant_internal_restaurants_v2() owner to restaurant_membership_context_reader;
revoke create on schema public from restaurant_membership_context_reader;
grant restaurant_membership_context_reader to postgres
  with admin false, inherit false, set false;

-- v3 semantics, with one restaurant-global nullable website column appended.
create view public.consumer_public_restaurant_catalog_v4
with (security_barrier = true) as
select
  r.id as restaurant_id,
  r.name as restaurant_name,
  r.city as restaurant_city,
  r.category as restaurant_category,
  r.tags as restaurant_tags,
  rb.id as branch_id,
  rb.name as branch_name,
  rb.district as branch_district,
  rb.address as branch_address,
  m.id as menu_id,
  m.name as menu_name,
  mc.id as menu_category_id,
  mc.name as menu_category_name,
  mc.sort_order as menu_category_sort_order,
  bmi.id as branch_menu_item_id,
  mi.id as menu_item_id,
  coalesce(bmi.branch_specific_name, mi.name) as menu_item_name,
  coalesce(bmi.branch_specific_description, mi.description) as menu_item_description,
  mi.image_url as menu_item_image_url,
  mi.tag_ids as menu_item_tags,
  mi.allergens as menu_item_allergens,
  bmi.price as branch_price,
  bmi.availability as branch_availability,
  n.calories,
  n.protein,
  n.carbohydrates,
  n.fat,
  n.fiber,
  n.sugar,
  n.sodium,
  n.saturated_fat,
  n.serving_size,
  n.nutrition_source_public,
  n.nutrition_updated_at,
  restaurant_internal.consumer_branch_current_temporal_state_v1(rb.id) as branch_temporal_state,
  rb.public_phone as branch_public_phone,
  r.public_website_url as restaurant_public_website_url
from public.restaurants as r
join public.restaurant_branches as rb
  on rb.restaurant_id = r.id and rb.status = 'active' and rb.is_active = true
join public.menus as m on m.restaurant_id = r.id and m.status = 'published'
join public.menu_categories as mc on mc.menu_id = m.id
join public.menu_items as mi
  on mi.restaurant_id = r.id and mi.menu_category_id = mc.id and mi.status = 'active'
join public.branch_menu_items as bmi
  on bmi.restaurant_id = r.id and bmi.branch_id = rb.id and bmi.menu_item_id = mi.id
  and bmi.availability in ('available', 'limited') and bmi.sold_out = false
  and bmi.branch_specific_status = 'available'
left join public.restaurant_public_published_nutrition_v1 as n
  on n.restaurant_id = r.id and n.menu_item_id = mi.id
where r.status = 'active';
revoke all on public.consumer_public_restaurant_catalog_v4 from public, anon, authenticated;
grant select on public.consumer_public_restaurant_catalog_v4 to anon, authenticated;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count from pg_catalog.pg_policy
  where polrelid = 'public.restaurants'::pg_catalog.regclass
    and polname in ('restaurants_owner_public_website_tenant_select',
      'restaurants_owner_public_website_tenant_update') and not polpermissive;
  if v_count <> 2 then raise exception 'RA-2I-P1B: tenant policies are not RESTRICTIVE'; end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.restaurants', 'UPDATE') then
    raise exception 'RA-2I-P1B: authenticated gained broad restaurants UPDATE';
  end if;
  if not pg_catalog.has_column_privilege('restaurant_owner_public_website_write_authority',
      'public.restaurants', 'public_website_url', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_public_website_write_authority',
      'public.restaurants', 'name', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_public_website_write_authority',
      'public.restaurants', 'city', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_public_website_write_authority',
      'public.restaurants', 'category', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_public_website_write_authority',
      'public.restaurants', 'tags', 'UPDATE') then
    raise exception 'RA-2I-P1B: sealed column privileges are not exact';
  end if;
  if pg_catalog.has_table_privilege('restaurant_owner_public_website_write_authority',
      'public.restaurant_branches', 'UPDATE') then
    raise exception 'RA-2I-P1B: website writer gained branch UPDATE';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'restaurant_owner_public_website_write_authority'
      and (rolcanlogin or rolinherit or rolbypassrls)) then
    raise exception 'RA-2I-P1B: sealed role flags are unsafe';
  end if;
end
$$;

commit;
