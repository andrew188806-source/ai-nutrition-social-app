begin;

-- RA-2G-P1: one restaurant-global About text (店家介紹). NULL means unpublished.
-- Presentation prose only. Never authoritative for nutrition/allergen/ingredient/REC/Taste/GEO/
-- Meal Buddy/temporal/identity authority -- those remain governed exclusively by their own
-- dedicated, already-frozen authorities. No moderation/review lifecycle: SET publishes
-- immediately, CLEAR unpublishes immediately, exactly like P1B website and P2 social links.

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
    'restaurant.profile.public_website.write', 'restaurant.profile.public_social_links.write',
    'restaurant.profile.about.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'restaurant.profile.about.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'restaurant.profile.about.write'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner' and role.status = 'active';
  if v_count <> 1 then
    raise exception 'RA-2G-P1: expected one active owner/restaurant about permission';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- Text shape: outer ASCII-space (U+0020) trim ONLY -- interior spaces, LF line breaks and
-- multiple lines are preserved verbatim. All C0/C1 controls forbidden except LF (\x0A). A value
-- that is entirely spaces/newlines (even if non-empty after the outer-space trim, e.g. a bare
-- "\n") is rejected as whitespace-only, not accepted as CLEAR.
create function restaurant_internal.restaurant_about_text_allowed_v1(p_text text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_text = pg_catalog.btrim(p_text, ' ')
    and pg_catalog.char_length(p_text) between 1 and 800
    and p_text !~ '[\x00-\x09\x0B-\x1F\x7F-\x9F]'
    and p_text !~ '^[ \n]+$';
$$;
revoke all on function restaurant_internal.restaurant_about_text_allowed_v1(text)
  from public, anon, authenticated, authenticator, service_role;

alter table public.restaurants
  add column restaurant_about text,
  add column restaurant_about_source text,
  add column restaurant_about_version bigint not null default 0;

alter table public.restaurants
  add constraint restaurants_about_provenance_check check (
    (restaurant_about is null and restaurant_about_source is null)
    or (restaurant_about is not null and restaurant_about_source = 'RESTAURANT_PROVIDED')
  ),
  add constraint restaurants_about_source_enum_check
    check (restaurant_about_source is null or restaurant_about_source = 'RESTAURANT_PROVIDED'),
  add constraint restaurants_about_text_check
    check (restaurant_about is null or restaurant_internal.restaurant_about_text_allowed_v1(restaurant_about)),
  add constraint restaurants_about_version_non_negative_check
    check (restaurant_about_version >= 0);

create function public.bump_restaurant_about_version_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.restaurant_about_version := old.restaurant_about_version + 1;
  return new;
end;
$$;
create trigger restaurants_about_version_trigger
  before update of restaurant_about on public.restaurants
  for each row
  when (old.restaurant_about is distinct from new.restaurant_about)
  execute function public.bump_restaurant_about_version_v1();
revoke all on function public.bump_restaurant_about_version_v1()
  from public, anon, authenticated, authenticator, service_role;

create role restaurant_owner_about_write_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_about_write_authority is
  'RA-2G-P1 sealed restaurant About writer. It may update restaurants.restaurant_about (and its
   paired source column via trigger-independent direct UPDATE) only.';
grant restaurant_owner_about_write_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_about_write_authority;

create table restaurant_internal.restaurant_about_audit_log (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  action text not null check (action in ('SET', 'CLEAR')),
  previous_about text,
  next_about text,
  previous_source text,
  next_source text,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint restaurant_about_audit_transition_check
    check (previous_about is distinct from next_about),
  constraint restaurant_about_audit_action_check
    check ((action = 'SET' and next_about is not null and next_source = 'RESTAURANT_PROVIDED')
      or (action = 'CLEAR' and next_about is null and next_source is null)),
  constraint restaurant_about_audit_version_check
    check (previous_version >= 0 and next_version = previous_version + 1)
);
create index restaurant_about_audit_target_idx
  on restaurant_internal.restaurant_about_audit_log (restaurant_id, created_at desc);
alter table restaurant_internal.restaurant_about_audit_log enable row level security;
alter table restaurant_internal.restaurant_about_audit_log force row level security;
create policy restaurant_about_audit_writer_select
  on restaurant_internal.restaurant_about_audit_log
  for select to restaurant_owner_about_write_authority using (true);
create policy restaurant_about_audit_writer_insert
  on restaurant_internal.restaurant_about_audit_log
  for insert to restaurant_owner_about_write_authority with check (true);
revoke all on table restaurant_internal.restaurant_about_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.restaurant_about_audit_log
  to restaurant_owner_about_write_authority;

grant select (id, auth_user_id, login_status)
  on public.restaurant_users to restaurant_owner_about_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on public.restaurant_memberships to restaurant_owner_about_write_authority;
grant select (id, role_key, status)
  on public.restaurant_roles to restaurant_owner_about_write_authority;
grant select (role_id, permission_key, permission_scope)
  on public.role_permissions to restaurant_owner_about_write_authority;
grant select (id, restaurant_about, restaurant_about_source, restaurant_about_version)
  on public.restaurants to restaurant_owner_about_write_authority;
grant update (restaurant_about, restaurant_about_source)
  on public.restaurants to restaurant_owner_about_write_authority;

create policy restaurant_users_owner_about_context_select on public.restaurant_users
  for select to restaurant_owner_about_write_authority using (true);
create policy restaurant_memberships_owner_about_context_select on public.restaurant_memberships
  for select to restaurant_owner_about_write_authority using (true);
create policy restaurant_roles_owner_about_context_select on public.restaurant_roles
  for select to restaurant_owner_about_write_authority using (true);
create policy role_permissions_owner_about_context_select on public.role_permissions
  for select to restaurant_owner_about_write_authority using (true);

create policy restaurants_owner_about_select on public.restaurants
  for select to restaurant_owner_about_write_authority using (true);
create policy restaurants_owner_about_update on public.restaurants
  for update to restaurant_owner_about_write_authority
  using (true)
  with check (
    (restaurant_about is null and restaurant_about_source is null)
    or (restaurant_about is not null and restaurant_about_source = 'RESTAURANT_PROVIDED'
      and restaurant_internal.restaurant_about_text_allowed_v1(restaurant_about))
  );

create policy restaurants_owner_about_tenant_select on public.restaurants
  as restrictive
  for select to restaurant_owner_about_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.about.write'
      and permission.permission_scope = 'restaurant'
  ));

create policy restaurants_owner_about_tenant_update on public.restaurants
  as restrictive
  for update to restaurant_owner_about_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.about.write'
      and permission.permission_scope = 'restaurant'
  ))
  with check (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.about.write'
      and permission.permission_scope = 'restaurant'
  ));

grant execute on function restaurant_internal.restaurant_about_text_allowed_v1(text)
  to restaurant_owner_about_write_authority;

grant create on schema public to restaurant_owner_about_write_authority;

create function public.restaurant_owner_preview_about_v1(p_restaurant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;

  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor
      and caller.login_status = 'enabled'
      and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.about.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select restaurant.id, restaurant.restaurant_about, restaurant.restaurant_about_version
  into v_target
  from public.restaurants as restaurant
  join public.restaurant_memberships as membership
    on membership.restaurant_id = restaurant.id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'restaurant.profile.about.write'
   and permission.permission_scope = 'restaurant'
  where restaurant.id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'ready',
    'restaurantId', v_target.id,
    'restaurantAbout', v_target.restaurant_about,
    'restaurantAboutVersion', v_target.restaurant_about_version::text
  );
end;
$$;

create function public.restaurant_owner_set_about_v1(
  p_restaurant_id text,
  p_operation text,
  p_expected_restaurant_about text,
  p_next_restaurant_about text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
  v_next text;
  v_next_source text;
  v_next_version bigint;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then
    v_actor := null;
  end;

  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_operation is null or p_operation not in ('set', 'clear')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'set' and p_next_restaurant_about is null)
    or (p_operation = 'clear' and p_next_restaurant_about is not null)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_next := case when p_operation = 'set' then pg_catalog.btrim(p_next_restaurant_about, ' ') else null end;
  if p_operation = 'set' and not restaurant_internal.restaurant_about_text_allowed_v1(v_next) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select restaurant.id, restaurant.restaurant_about, restaurant.restaurant_about_source,
         restaurant.restaurant_about_version, membership.id as membership_id
  into v_target
  from public.restaurants as restaurant
  join public.restaurant_memberships as membership
    on membership.restaurant_id = restaurant.id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'restaurant.profile.about.write'
   and permission.permission_scope = 'restaurant'
  where restaurant.id = p_restaurant_id
  for update of restaurant;

  if not found then
    if exists (select 1 from public.restaurant_users where auth_user_id = v_actor and login_status = 'enabled')
      then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
      else return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
    end if;
  end if;

  if v_target.restaurant_about is distinct from p_expected_restaurant_about
    or v_target.restaurant_about_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  v_next_source := case when p_operation = 'set' then 'RESTAURANT_PROVIDED' else null end;
  if v_target.restaurant_about is not distinct from v_next then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.restaurants
  set restaurant_about = v_next, restaurant_about_source = v_next_source
  where id = v_target.id
  returning restaurant_about_version into v_next_version;

  insert into restaurant_internal.restaurant_about_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, action,
      previous_about, next_about, previous_source, next_source, previous_version, next_version)
  values (v_actor, v_target.membership_id, v_target.id,
    case when p_operation = 'set' then 'SET' else 'CLEAR' end,
    v_target.restaurant_about, v_next, v_target.restaurant_about_source, v_next_source,
    v_target.restaurant_about_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'applied',
    'restaurantId', v_target.id, 'restaurantAbout', v_next,
    'restaurantAboutVersion', v_next_version::text, 'auditId', v_audit_id
  );
end;
$$;

revoke all on function public.restaurant_owner_preview_about_v1(text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_about_v1(text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_preview_about_v1(text) to authenticated;
grant execute on function public.restaurant_owner_set_about_v1(text, text, text, text, bigint) to authenticated;
alter function public.restaurant_owner_preview_about_v1(text)
  owner to restaurant_owner_about_write_authority;
alter function public.restaurant_owner_set_about_v1(text, text, text, text, bigint)
  owner to restaurant_owner_about_write_authority;
revoke create on schema public from restaurant_owner_about_write_authority;
revoke restaurant_owner_about_write_authority from postgres granted by postgres;

-- Restaurant-global public About projection. Reuses the exact same public-visibility universe as
-- the existing catalogue (r.status = 'active') so About never exposes a restaurant that is not
-- already publicly discoverable, and never widens visibility beyond it.
create view public.consumer_public_restaurant_about_v1
with (security_barrier = true) as
select r.id as restaurant_id, r.restaurant_about
from public.restaurants as r
where r.status = 'active' and r.restaurant_about is not null;

revoke all on public.consumer_public_restaurant_about_v1 from public, anon, authenticated;
grant select on public.consumer_public_restaurant_about_v1 to anon, authenticated;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.restaurants'::pg_catalog.regclass
    and policy.polname in ('restaurants_owner_about_tenant_select', 'restaurants_owner_about_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2G-P1: the tenant policies are not RESTRICTIVE';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.restaurants', 'UPDATE') then
    raise exception 'RA-2G-P1: authenticated gained direct restaurants UPDATE';
  end if;
  if not pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'restaurant_about', 'UPDATE')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'restaurant_about_source', 'UPDATE')
    then raise exception 'RA-2G-P1: sealed writer lacks the exact governed column UPDATE';
  end if;
  if pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'name', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'city', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'category', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'status', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'public_website_url', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurants', 'restaurant_about_version', 'UPDATE')
    then raise exception 'RA-2G-P1: sealed writer gained forbidden column UPDATE';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurant_branches', 'UPDATE')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_about_write_authority', 'public.restaurant_public_social_links', 'UPDATE')
    then raise exception 'RA-2G-P1: about writer gained unrelated table authority';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_about_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2G-P1: a client role holds membership of the sealed writer';
  end if;

  if restaurant_internal.restaurant_about_text_allowed_v1('  ' || pg_catalog.chr(10) || '  ') then
    raise exception 'RA-2G-P1: whitespace-only (space+LF) text incorrectly accepted';
  end if;
  if not restaurant_internal.restaurant_about_text_allowed_v1('A' || pg_catalog.chr(10) || 'B') then
    raise exception 'RA-2G-P1: LF-containing text incorrectly rejected';
  end if;
  if restaurant_internal.restaurant_about_text_allowed_v1('A' || pg_catalog.chr(9) || 'B') then
    raise exception 'RA-2G-P1: TAB-containing text incorrectly accepted';
  end if;
end
$$;

commit;
