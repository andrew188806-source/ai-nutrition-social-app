begin;

-- R2B-5: the governed Restaurant Owner Branch Menu Item LINKAGE CREATE authority. This is a new,
-- separate sealed role from every existing branch_menu_items field-write role (sold_out,
-- availability, price, visibility, display_name) -- row creation is a different privilege than
-- editing an existing row, and this migration widens none of those five predecessors.
--
-- After linkage, all field edits (price, availability, sold_out, branch_specific_status,
-- branch_specific_name/description) remain exclusively the existing frozen RA-2 authorities. This
-- migration creates the row; it never updates one.

alter table public.role_permissions
  drop constraint role_permissions_permission_key_check;
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
    'restaurant.profile.about.write',
    'menu.write', 'menu_category.write', 'menu_item.write', 'branch_menu_item.create'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch_menu_item.create', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.create'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner' and role.status = 'active';
  if v_count <> 1 then
    raise exception 'R2B-5: expected exactly one active owner/restaurant branch_menu_item.create permission row';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

create role restaurant_owner_branch_menu_item_creation_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_branch_menu_item_creation_authority is
  'R2B-5 sealed writer. Owns branch_menu_items row CREATE only (id, restaurant_id, branch_id, menu_item_id, price, availability). Never UPDATEs an existing row -- field edits remain the five existing RA-2 sealed writers, untouched by this migration. Granted to no client role.';
grant restaurant_owner_branch_menu_item_creation_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_branch_menu_item_creation_authority;

create table restaurant_internal.branch_menu_item_creation_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  menu_item_id text not null,
  branch_menu_item_id text not null,
  initial_price numeric(10, 2) not null,
  initial_availability text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_menu_item_creation_audit_log_pkey primary key (id),
  constraint branch_menu_item_creation_audit_log_price_check
    check (initial_price >= 1 and initial_price <= 999999 and initial_price = pg_catalog.trunc(initial_price)),
  constraint branch_menu_item_creation_audit_log_availability_check
    check (initial_availability in ('available', 'limited', 'unavailable'))
);
create index branch_menu_item_creation_audit_log_target_idx
  on restaurant_internal.branch_menu_item_creation_audit_log (branch_menu_item_id, created_at desc);
alter table restaurant_internal.branch_menu_item_creation_audit_log enable row level security;
alter table restaurant_internal.branch_menu_item_creation_audit_log force row level security;
create policy branch_menu_item_creation_audit_log_writer_select
  on restaurant_internal.branch_menu_item_creation_audit_log
  for select to restaurant_owner_branch_menu_item_creation_authority using (true);
create policy branch_menu_item_creation_audit_log_writer_insert
  on restaurant_internal.branch_menu_item_creation_audit_log
  for insert to restaurant_owner_branch_menu_item_creation_authority with check (true);
revoke all on table restaurant_internal.branch_menu_item_creation_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_menu_item_creation_audit_log
  to restaurant_owner_branch_menu_item_creation_authority;

grant select (id, auth_user_id, login_status)
  on table public.restaurant_users to restaurant_owner_branch_menu_item_creation_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships to restaurant_owner_branch_menu_item_creation_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles to restaurant_owner_branch_menu_item_creation_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions to restaurant_owner_branch_menu_item_creation_authority;
grant select (id, restaurant_id, status)
  on table public.restaurant_branches to restaurant_owner_branch_menu_item_creation_authority;
grant select (id, restaurant_id, status)
  on table public.menu_items to restaurant_owner_branch_menu_item_creation_authority;
grant select (id, branch_id, menu_item_id)
  on table public.branch_menu_items to restaurant_owner_branch_menu_item_creation_authority;
-- INSERT is scoped to exactly six columns. sold_out (default false), branch_specific_name (default
-- null), branch_specific_description (default null), branch_specific_status (default 'available')
-- and every *_version column keep their table DEFAULT because they are absent from both this grant
-- and the RPC's own explicit column list -- there is no INSERT privilege on any of them at all.
grant insert (id, restaurant_id, branch_id, menu_item_id, price, availability)
  on table public.branch_menu_items to restaurant_owner_branch_menu_item_creation_authority;

create policy branch_menu_items_owner_create_select
  on public.branch_menu_items for select to restaurant_owner_branch_menu_item_creation_authority
  using (true);
create policy branch_menu_items_owner_create_insert
  on public.branch_menu_items for insert to restaurant_owner_branch_menu_item_creation_authority
  with check (
    price >= 1 and price <= 999999 and price = pg_catalog.trunc(price)
    and availability in ('available', 'limited', 'unavailable')
  );

create policy branch_menu_items_owner_create_tenant_select
  on public.branch_menu_items as restrictive
  for select to restaurant_owner_branch_menu_item_creation_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id
     and membership.restaurant_id = branch_menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.create' and permission.permission_scope = 'restaurant'
  ));
create policy branch_menu_items_owner_create_tenant_insert
  on public.branch_menu_items as restrictive
  for insert to restaurant_owner_branch_menu_item_creation_authority
  with check (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id
     and membership.restaurant_id = branch_menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.create' and permission.permission_scope = 'restaurant'
  ));

-- This role also needs to read restaurant_branches and menu_items regardless of their own public
-- visibility status (an archived branch/item must still be resolvable so this RPC can reject it
-- with parent_unavailable rather than a misleading target_not_found), scoped by tenant membership.
-- Permissive-only, narrows nothing.
create policy restaurant_branches_linkage_context_select
  on public.restaurant_branches for select to restaurant_owner_branch_menu_item_creation_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where membership.restaurant_id = restaurant_branches.restaurant_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.create' and permission.permission_scope = 'restaurant'
  ));
create policy menu_items_linkage_context_select
  on public.menu_items for select to restaurant_owner_branch_menu_item_creation_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id and membership.restaurant_id = menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.create' and permission.permission_scope = 'restaurant'
  ));

grant create on schema public to restaurant_owner_branch_menu_item_creation_authority;

create function public.restaurant_owner_link_menu_item_to_branch_v1(
  p_branch_id text,
  p_menu_item_id text,
  p_price text,
  p_availability text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_branch record;
  v_item record;
  v_membership_id uuid;
  v_price numeric(10, 2);
  v_availability text;
  v_id text;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  -- Lexical validation first, reusing RA-2C-P1's exact canonical price shape: whole TWD 1..999999.
  -- Availability defaults to 'available' when omitted -- the same value the column itself would
  -- default to, made explicit here because availability has no column DEFAULT and NOT NULL.
  v_availability := coalesce(p_availability, 'available');
  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_menu_item_id is null or pg_catalog.length(p_menu_item_id) = 0
    or p_price is null
    or p_price !~ '^[1-9][0-9]{0,5}$'
    or v_availability not in ('available', 'limited', 'unavailable') then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  v_price := p_price::pg_catalog.numeric;

  -- Coarse gate: does the caller hold branch_menu_item.create anywhere at all.
  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.create' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  -- Resolve the branch AND independently verify caller authority for its restaurant.
  select branch.id, branch.restaurant_id, branch.status, membership.id as membership_id
  into v_branch
  from public.restaurant_branches as branch
  join public.restaurant_memberships as membership
    on membership.restaurant_id = branch.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'branch_menu_item.create' and permission.permission_scope = 'restaurant'
  where branch.id = p_branch_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  if v_branch.status = 'archived' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'parent_unavailable');
  end if;

  -- Resolve the menu item and REQUIRE it belongs to the SAME restaurant as the branch. Neither side
  -- is trusted alone: an owner of restaurant A cannot link restaurant B's item to restaurant A's
  -- branch, nor restaurant A's item to restaurant B's branch -- both fail this join.
  select item.id, item.restaurant_id, item.status
  into v_item
  from public.menu_items as item
  where item.id = p_menu_item_id and item.restaurant_id = v_branch.restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  if v_item.status = 'archived' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'parent_unavailable');
  end if;

  v_membership_id := v_branch.membership_id;
  v_id := pg_catalog.gen_random_uuid()::text;

  begin
    -- sold_out, branch_specific_name, branch_specific_description, branch_specific_status and
    -- every *_version column all take their table DEFAULT; the R2B-1 trigger independently
    -- re-verifies restaurant_id against both the branch and the item chain at INSERT time.
    insert into public.branch_menu_items
      (id, restaurant_id, branch_id, menu_item_id, price, availability)
    values (v_id, v_branch.restaurant_id, v_branch.id, v_item.id, v_price, v_availability);
  exception when unique_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'already_linked');
  end;

  insert into restaurant_internal.branch_menu_item_creation_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, menu_item_id,
     branch_menu_item_id, initial_price, initial_availability)
  values (v_actor, v_membership_id, v_branch.restaurant_id, v_branch.id, v_item.id,
     v_id, v_price, v_availability)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'created',
    'branchMenuItemId', v_id, 'restaurantId', v_branch.restaurant_id,
    'branchId', v_branch.id, 'menuItemId', v_item.id,
    'price', v_price::text, 'availability', v_availability,
    'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_link_menu_item_to_branch_v1(text, text, text, text) is
  'R2B-5. Creates a new branch_menu_items row linking an existing menu item to an existing branch within the same restaurant. branch_specific_name/description always start NULL -- the RA-2F frozen contract is untouched. Duplicate (branch_id, menu_item_id) reports already_linked, never a raw constraint error.';

revoke all on function public.restaurant_owner_link_menu_item_to_branch_v1(text, text, text, text)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_link_menu_item_to_branch_v1(text, text, text, text)
  to authenticated;
alter function public.restaurant_owner_link_menu_item_to_branch_v1(text, text, text, text)
  owner to restaurant_owner_branch_menu_item_creation_authority;

revoke create on schema public from restaurant_owner_branch_menu_item_creation_authority;
revoke restaurant_owner_branch_menu_item_creation_authority from postgres granted by postgres;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_create_tenant_select',
                            'branch_menu_items_owner_create_tenant_insert')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'R2B-5: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;
  end if;

  if not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'branch_id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'menu_item_id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'price', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'availability', 'INSERT') then
    raise exception 'R2B-5: the linkage writer lacks a required INSERT column privilege';
  end if;

  if pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'sold_out', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'branch_specific_name', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'branch_specific_description', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'branch_specific_status', 'INSERT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'UPDATE')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_creation_authority', 'public.branch_menu_items', 'DELETE') then
    raise exception 'R2B-5: the linkage writer can write a column or command it must never touch';
  end if;

  -- None of the five existing RA-2 field-write roles was widened to INSERT.
  if pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_price_write_authority', 'public.branch_menu_items', 'INSERT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_write_authority', 'public.branch_menu_items', 'INSERT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_availability_write_authority', 'public.branch_menu_items', 'INSERT') then
    raise exception 'R2B-5: a frozen predecessor field-write role was widened to INSERT';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_creation_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'R2B-5: a client role holds membership of the linkage writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'INSERT') then
    raise exception 'R2B-5: a client role gained direct table INSERT on branch_menu_items';
  end if;
end
$$;

commit;
