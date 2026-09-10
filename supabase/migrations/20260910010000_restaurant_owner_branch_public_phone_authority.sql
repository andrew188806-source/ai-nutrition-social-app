begin;

-- RA-2I-P1A: one branch-specific public display phone. NULL means unpublished.
-- This authority is independent of branch identity, lifecycle, address/GEO and temporal state.

alter table public.role_permissions drop constraint role_permissions_permission_key_check;
alter table public.role_permissions
  add constraint role_permissions_permission_key_check
  check (permission_key in (
    'access_context.read',
    'restaurant.read',
    'branch.read',
    'menu.read',
    'nutrition.read',
    'branch_menu_item.sold_out.write',
    'branch_menu_item.availability.write',
    'branch_menu_item.price.write',
    'branch_menu_item.visibility.write',
    'branch.profile.display_name.write',
    'branch_menu_item.display_name.write',
    'branch.hours.weekly.write',
    'branch.hours.special.write',
    'branch.operational_closure.write',
    'branch.profile.public_phone.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch.profile.public_phone.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare
  v_total integer;
  v_phone_permissions integer;
  v_predecessors integer;
begin
  select pg_catalog.count(*) into v_total
  from public.role_permissions as permission
  where permission.permission_key = 'branch.profile.public_phone.write';
  if v_total <> 1 then
    raise exception 'RA-2I-P1A: expected exactly one public-phone permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_phone_permissions
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch.profile.public_phone.write'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner'
    and role.status = 'active';
  if v_phone_permissions <> 1 then
    raise exception 'RA-2I-P1A: expected one active owner/restaurant public-phone permission';
  end if;

  select pg_catalog.count(*) into v_predecessors
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key in (
      'branch_menu_item.sold_out.write',
      'branch_menu_item.availability.write',
      'branch_menu_item.price.write',
      'branch_menu_item.visibility.write',
      'branch.profile.display_name.write',
      'branch_menu_item.display_name.write',
      'branch.hours.weekly.write',
      'branch.hours.special.write',
      'branch.operational_closure.write'
    )
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_predecessors <> 9 then
    raise exception 'RA-2I-P1A: a frozen RA-2A through RA-2H permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

alter table public.restaurant_branches
  add column public_phone text,
  add column public_phone_version bigint not null default 0;

alter table public.restaurant_branches
  add constraint restaurant_branches_public_phone_canonical_check
  check (
    public_phone is null
    or (
      public_phone = pg_catalog.btrim(public_phone)
      and pg_catalog.char_length(public_phone) between 1 and 32
      and public_phone !~ '[\x00-\x1F\x7F-\x9F]'
    )
  ),
  add constraint restaurant_branches_public_phone_version_non_negative_check
  check (public_phone_version >= 0);

create function public.bump_restaurant_branch_public_phone_version_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.public_phone_version := old.public_phone_version + 1;
  return new;
end;
$$;

create trigger restaurant_branches_public_phone_version_trigger
  before update of public_phone on public.restaurant_branches
  for each row
  when (old.public_phone is distinct from new.public_phone)
  execute function public.bump_restaurant_branch_public_phone_version_v1();

create role restaurant_owner_branch_public_phone_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_public_phone_write_authority is
  'RA-2I-P1A sealed branch public-phone writer. It may update restaurant_branches.public_phone only.';

grant restaurant_owner_branch_public_phone_write_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_branch_public_phone_write_authority;

create table restaurant_internal.branch_public_phone_audit_log (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  action text not null check (action in ('SET', 'CLEAR')),
  previous_public_phone text,
  next_public_phone text,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_public_phone_audit_transition_check
    check (previous_public_phone is distinct from next_public_phone),
  constraint branch_public_phone_audit_action_check
    check ((action = 'SET' and next_public_phone is not null)
      or (action = 'CLEAR' and next_public_phone is null)),
  constraint branch_public_phone_audit_version_check
    check (previous_version >= 0 and next_version = previous_version + 1)
);

create index branch_public_phone_audit_log_created_at_idx
  on restaurant_internal.branch_public_phone_audit_log (created_at desc);
create index branch_public_phone_audit_log_target_idx
  on restaurant_internal.branch_public_phone_audit_log (branch_id, created_at desc);

alter table restaurant_internal.branch_public_phone_audit_log enable row level security;
alter table restaurant_internal.branch_public_phone_audit_log force row level security;
create policy branch_public_phone_audit_log_writer_select
  on restaurant_internal.branch_public_phone_audit_log
  for select to restaurant_owner_branch_public_phone_write_authority using (true);
create policy branch_public_phone_audit_log_writer_insert
  on restaurant_internal.branch_public_phone_audit_log
  for insert to restaurant_owner_branch_public_phone_write_authority with check (true);
revoke all on table restaurant_internal.branch_public_phone_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_public_phone_audit_log
  to restaurant_owner_branch_public_phone_write_authority;

grant select (id, auth_user_id, login_status)
  on public.restaurant_users to restaurant_owner_branch_public_phone_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on public.restaurant_memberships to restaurant_owner_branch_public_phone_write_authority;
grant select (id, role_key, status)
  on public.restaurant_roles to restaurant_owner_branch_public_phone_write_authority;
grant select (role_id, permission_key, permission_scope)
  on public.role_permissions to restaurant_owner_branch_public_phone_write_authority;
grant select (id, restaurant_id, public_phone, public_phone_version)
  on public.restaurant_branches to restaurant_owner_branch_public_phone_write_authority;
grant update (public_phone)
  on public.restaurant_branches to restaurant_owner_branch_public_phone_write_authority;

create policy restaurant_branches_owner_public_phone_select
  on public.restaurant_branches
  for select to restaurant_owner_branch_public_phone_write_authority using (true);
create policy restaurant_branches_owner_public_phone_update
  on public.restaurant_branches
  for update to restaurant_owner_branch_public_phone_write_authority
  using (true)
  with check (
    public_phone is null
    or (
      public_phone = pg_catalog.btrim(public_phone)
      and pg_catalog.char_length(public_phone) between 1 and 32
      and public_phone !~ '[\x00-\x1F\x7F-\x9F]'
    )
  );

create policy restaurant_branches_owner_public_phone_tenant_select
  on public.restaurant_branches
  as restrictive
  for select to restaurant_owner_branch_public_phone_write_authority
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership
        on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      join public.role_permissions as permission on permission.role_id = role.id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch.profile.public_phone.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy restaurant_branches_owner_public_phone_tenant_update
  on public.restaurant_branches
  as restrictive
  for update to restaurant_owner_branch_public_phone_write_authority
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership
        on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      join public.role_permissions as permission on permission.role_id = role.id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch.profile.public_phone.write'
        and permission.permission_scope = 'restaurant'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership
        on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role on role.id = membership.role_id
      join public.role_permissions as permission on permission.role_id = role.id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch.profile.public_phone.write'
        and permission.permission_scope = 'restaurant'
    )
  );

grant create on schema public to restaurant_owner_branch_public_phone_write_authority;

create function public.restaurant_owner_preview_branch_public_phone_v1(
  p_restaurant_id text,
  p_branch_id text
)
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
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_branch_id is null or pg_catalog.length(p_branch_id) = 0 then
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
      and role.status = 'active'
      and role.role_key = 'owner'
      and permission.permission_key = 'branch.profile.public_phone.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select branch.id, branch.restaurant_id, branch.public_phone, branch.public_phone_version
  into v_target
  from public.restaurant_branches as branch
  join public.restaurant_memberships as membership
    on membership.restaurant_id = branch.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'branch.profile.public_phone.write'
   and permission.permission_scope = 'restaurant'
  where branch.id = p_branch_id and branch.restaurant_id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'ready',
    'restaurantId', v_target.restaurant_id,
    'branchId', v_target.id,
    'publicPhone', v_target.public_phone,
    'publicPhoneVersion', v_target.public_phone_version::text
  );
end;
$$;

create function public.restaurant_owner_set_branch_public_phone_v1(
  p_branch_id text,
  p_operation text,
  p_expected_public_phone text,
  p_next_public_phone text,
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
  v_canonical_next text;
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
  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_operation is null or p_operation not in ('set', 'clear')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'set' and p_next_public_phone is null)
    or (p_operation = 'clear' and p_next_public_phone is not null)
  then
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
      and role.status = 'active'
      and role.role_key = 'owner'
      and permission.permission_key = 'branch.profile.public_phone.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select branch.id, branch.restaurant_id, branch.public_phone, branch.public_phone_version,
         membership.id as membership_id
  into v_target
  from public.restaurant_branches as branch
  join public.restaurant_memberships as membership
    on membership.restaurant_id = branch.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'branch.profile.public_phone.write'
   and permission.permission_scope = 'restaurant'
  where branch.id = p_branch_id
  for update of branch;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  if v_target.public_phone is distinct from p_expected_public_phone
    or v_target.public_phone_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  v_canonical_next := case when p_operation = 'set'
    then pg_catalog.btrim(p_next_public_phone) else null end;
  if p_operation = 'set' and (
    pg_catalog.char_length(v_canonical_next) < 1
    or pg_catalog.char_length(v_canonical_next) > 32
    or v_canonical_next ~ '[\x00-\x1F\x7F-\x9F]'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  if v_target.public_phone is not distinct from v_canonical_next then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.restaurant_branches as branch
  set public_phone = v_canonical_next
  where branch.id = v_target.id
  returning branch.public_phone_version into v_next_version;

  insert into restaurant_internal.branch_public_phone_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, action,
     previous_public_phone, next_public_phone, previous_version, next_version)
  values
    (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.id,
     case when p_operation = 'set' then 'SET' else 'CLEAR' end,
     v_target.public_phone, v_canonical_next, v_target.public_phone_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'applied',
    'branchId', v_target.id,
    'publicPhone', v_canonical_next,
    'publicPhoneVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

revoke all on function public.restaurant_owner_preview_branch_public_phone_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_branch_public_phone_v1(text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.bump_restaurant_branch_public_phone_version_v1()
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_preview_branch_public_phone_v1(text, text)
  to authenticated;
grant execute on function public.restaurant_owner_set_branch_public_phone_v1(text, text, text, text, bigint)
  to authenticated;
alter function public.restaurant_owner_preview_branch_public_phone_v1(text, text)
  owner to restaurant_owner_branch_public_phone_write_authority;
alter function public.restaurant_owner_set_branch_public_phone_v1(text, text, text, text, bigint)
  owner to restaurant_owner_branch_public_phone_write_authority;
revoke create on schema public from restaurant_owner_branch_public_phone_write_authority;
revoke restaurant_owner_branch_public_phone_write_authority from postgres granted by postgres;

-- Additive successor for the existing tenant-safe owner branch read.
grant select (public_phone, public_phone_version)
  on public.restaurant_branches to restaurant_membership_context_reader;
grant restaurant_membership_context_reader to postgres
  with admin false, inherit false, set true;
grant create on schema public to restaurant_membership_context_reader;

create function public.restaurant_internal_branches_v2(p_restaurant_id text)
returns table (
  branch_id text,
  restaurant_id text,
  name text,
  district text,
  address text,
  status text,
  public_phone text,
  public_phone_version text
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  with authorized_scope as materialized (
    select access.permission_scope, access.branch_id
    from public.restaurant_current_access_context_v1() as access
    where access.restaurant_id = p_restaurant_id
      and access.permission_key = 'branch.read'
      and access.permission_scope in ('restaurant', 'branch')
  )
  select distinct
    branch.id,
    branch.restaurant_id,
    branch.name,
    branch.district,
    branch.address,
    branch.status,
    branch.public_phone,
    branch.public_phone_version::text
  from public.restaurant_branches as branch
  join authorized_scope as scope
    on scope.permission_scope = 'restaurant'
    or (scope.permission_scope = 'branch' and scope.branch_id = branch.id)
  where branch.restaurant_id = p_restaurant_id;
$$;

revoke all on function public.restaurant_internal_branches_v2(text)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_internal_branches_v2(text) to authenticated;
alter function public.restaurant_internal_branches_v2(text)
  owner to restaurant_membership_context_reader;
revoke create on schema public from restaurant_membership_context_reader;
grant restaurant_membership_context_reader to postgres
  with admin false, inherit false, set false;

-- Public catalogue successor: v2 semantics plus one nullable branch phone column.
create view public.consumer_public_restaurant_catalog_v3
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
  rb.public_phone as branch_public_phone
from public.restaurants as r
join public.restaurant_branches as rb
  on rb.restaurant_id = r.id
  and rb.status = 'active'
  and rb.is_active = true
join public.menus as m
  on m.restaurant_id = r.id
  and m.status = 'published'
join public.menu_categories as mc on mc.menu_id = m.id
join public.menu_items as mi
  on mi.restaurant_id = r.id
  and mi.menu_category_id = mc.id
  and mi.status = 'active'
join public.branch_menu_items as bmi
  on bmi.restaurant_id = r.id
  and bmi.branch_id = rb.id
  and bmi.menu_item_id = mi.id
  and bmi.availability in ('available', 'limited')
  and bmi.sold_out = false
  and bmi.branch_specific_status = 'available'
left join public.restaurant_public_published_nutrition_v1 as n
  on n.restaurant_id = r.id
  and n.menu_item_id = mi.id
where r.status = 'active';

revoke all on public.consumer_public_restaurant_catalog_v3 from public;
revoke all on public.consumer_public_restaurant_catalog_v3 from anon;
revoke all on public.consumer_public_restaurant_catalog_v3 from authenticated;
grant select on public.consumer_public_restaurant_catalog_v3 to anon;
grant select on public.consumer_public_restaurant_catalog_v3 to authenticated;

-- Fail closed if a client or the sealed writer obtained broader mutation authority.
do $$
declare
  v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.restaurant_branches'::pg_catalog.regclass
    and policy.polname in (
      'restaurant_branches_owner_public_phone_tenant_select',
      'restaurant_branches_owner_public_phone_tenant_update'
    )
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2I-P1A: the tenant policies are not RESTRICTIVE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.restaurant_branches'::pg_catalog.regclass
    and policy.polname in (
      'restaurant_branches_owner_public_phone_select',
      'restaurant_branches_owner_public_phone_update'
    )
    and policy.polpermissive = true;
  if v_count <> 2 then
    raise exception 'RA-2I-P1A: the permissive public-phone policies are missing';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2I-P1A: permission seeding did not restore FORCE ROW LEVEL SECURITY';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.restaurant_branches', 'UPDATE') then
    raise exception 'RA-2I-P1A: authenticated gained direct restaurant_branches UPDATE';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'UPDATE') then
    raise exception 'RA-2I-P1A: sealed writer holds broad restaurant_branches UPDATE';
  end if;
  if not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'public_phone', 'UPDATE') then
    raise exception 'RA-2I-P1A: sealed writer lacks public_phone UPDATE';
  end if;
  if pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'name', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'address', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'status', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'status_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'timezone_name', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'public_phone_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'district', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'restaurant_id', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'latitude', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'longitude', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_status', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_provider', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_provider_ref', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_normalized_address', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_address_fingerprint', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_resolved_at', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_attempts', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_last_error', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_public_phone_write_authority',
      'public.restaurant_branches', 'geocode_last_attempt_at', 'UPDATE') then
    raise exception 'RA-2I-P1A: sealed writer gained forbidden branch-column UPDATE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_public_phone_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2I-P1A: a client role holds membership of the sealed writer';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = 'public.restaurant_branches'::pg_catalog.regclass
    and trigger_row.tgname = 'restaurant_branches_public_phone_version_trigger'
    and not trigger_row.tgisinternal
    and pg_catalog.pg_get_triggerdef(trigger_row.oid) like '%UPDATE OF public_phone%';
  if v_count <> 1 then
    raise exception 'RA-2I-P1A: public-phone version trigger is not scoped to UPDATE OF public_phone';
  end if;
end
$$;

commit;
