begin;

-- R2B-3: the governed Restaurant Owner Menu Category authoring authority (create, rename, reorder).
--
-- TENANT DERIVATION. menu_categories carries no restaurant_id column at all -- only menu_id. Every
-- RPC below derives the owning restaurant exclusively from menu_id -> menus.restaurant_id, and the
-- caller is NEVER permitted to supply a restaurant_id for category creation, exactly as required.
--
-- CONCURRENCY MODEL. menu_categories has no version column today. Rather than add broad per-field
-- version architecture merely for symmetry with the RA-2 UPDATE-only rounds (whose per-field
-- versioning exists because sold_out/availability/price/etc are INDEPENDENTLY GRANTABLE
-- capabilities that must not invalidate each other's pending requests), name and sort_order here
-- are both owned by the single menu_category.write permission and edited together through one
-- form -- so this round adds exactly ONE content_version column covering both fields, the smallest
-- model that still gives real optimistic concurrency without inventing unneeded architecture.
--
-- DELETE. Not implemented in this round. CATEGORY_DELETE_DEFERRED: destructive semantics are not
-- required for MVP catalog authoring, and menu_categories has no lifecycle/status column to make a
-- soft-delete meaningful; adding an archive column solely to support delete would be scope creep
-- this round explicitly avoids. Restaurant Owners can create/rename/reorder categories today.

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
    'menu.write', 'menu_category.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'menu_category.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'menu_category.write'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner' and role.status = 'active';
  if v_count <> 1 then
    raise exception 'R2B-3: expected exactly one active owner/restaurant menu_category.write permission row';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

create function restaurant_internal.menu_category_name_allowed_v1(p_text text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_text = pg_catalog.btrim(p_text, ' ')
    and pg_catalog.char_length(p_text) between 1 and 120
    and p_text !~ '[\x00-\x1F\x7F-\x9F]';
$$;
revoke all on function restaurant_internal.menu_category_name_allowed_v1(text)
  from public, anon, authenticated, authenticator, service_role;

alter table public.menu_categories
  add column content_version bigint not null default 0;
alter table public.menu_categories
  add constraint menu_categories_content_version_non_negative check (content_version >= 0),
  add constraint menu_categories_sort_order_non_negative check (sort_order >= 0),
  add constraint menu_categories_name_check check (restaurant_internal.menu_category_name_allowed_v1(name));

create function restaurant_internal.menu_category_content_version_maintain()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 0;
    return new;
  end if;
  if new.name is distinct from old.name or new.sort_order is distinct from old.sort_order then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$$;
create trigger menu_categories_content_version_maintain
  before insert or update on public.menu_categories
  for each row execute function restaurant_internal.menu_category_content_version_maintain();
revoke all on function restaurant_internal.menu_category_content_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

create role restaurant_owner_menu_category_write_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_menu_category_write_authority is
  'R2B-3 sealed writer. Owns menu_categories CREATE and name/sort_order UPDATE RPCs. INSERT limited to (id, menu_id, name, sort_order); UPDATE limited to (name, sort_order). Granted to no client role.';
grant restaurant_owner_menu_category_write_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_menu_category_write_authority;

create table restaurant_internal.menu_category_authoring_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  menu_id text not null,
  menu_category_id text not null,
  action text not null check (action in ('CREATE', 'CONTENT_EDIT')),
  previous_name text,
  next_name text,
  previous_sort_order integer,
  next_sort_order integer,
  previous_content_version bigint,
  next_content_version bigint,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint menu_category_authoring_audit_log_pkey primary key (id),
  constraint menu_category_authoring_audit_log_create_shape check (
    action <> 'CREATE' or (
      previous_name is null and next_name is not null
      and previous_sort_order is null and next_sort_order is not null
      and previous_content_version is null and next_content_version = 0
    )
  ),
  constraint menu_category_authoring_audit_log_edit_shape check (
    action <> 'CONTENT_EDIT' or (
      previous_name is not null and next_name is not null
      and previous_sort_order is not null and next_sort_order is not null
      and (previous_name <> next_name or previous_sort_order <> next_sort_order)
      and previous_content_version is not null
      and next_content_version = previous_content_version + 1
    )
  )
);
create index menu_category_authoring_audit_log_target_idx
  on restaurant_internal.menu_category_authoring_audit_log (menu_category_id, created_at desc);
alter table restaurant_internal.menu_category_authoring_audit_log enable row level security;
alter table restaurant_internal.menu_category_authoring_audit_log force row level security;
create policy menu_category_authoring_audit_log_writer_select
  on restaurant_internal.menu_category_authoring_audit_log
  for select to restaurant_owner_menu_category_write_authority using (true);
create policy menu_category_authoring_audit_log_writer_insert
  on restaurant_internal.menu_category_authoring_audit_log
  for insert to restaurant_owner_menu_category_write_authority with check (true);
revoke all on table restaurant_internal.menu_category_authoring_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.menu_category_authoring_audit_log
  to restaurant_owner_menu_category_write_authority;

grant select (id, auth_user_id, login_status)
  on table public.restaurant_users to restaurant_owner_menu_category_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships to restaurant_owner_menu_category_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles to restaurant_owner_menu_category_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions to restaurant_owner_menu_category_write_authority;
grant select (id, restaurant_id, name, status)
  on table public.menus to restaurant_owner_menu_category_write_authority;
grant select (id, menu_id, name, sort_order, content_version)
  on table public.menu_categories to restaurant_owner_menu_category_write_authority;
grant insert (id, menu_id, name, sort_order)
  on table public.menu_categories to restaurant_owner_menu_category_write_authority;
grant update (name, sort_order)
  on table public.menu_categories to restaurant_owner_menu_category_write_authority;

create policy menu_categories_owner_write_select
  on public.menu_categories for select to restaurant_owner_menu_category_write_authority using (true);
create policy menu_categories_owner_write_insert
  on public.menu_categories for insert to restaurant_owner_menu_category_write_authority
  with check (restaurant_internal.menu_category_name_allowed_v1(name) and sort_order >= 0);
create policy menu_categories_owner_write_update
  on public.menu_categories for update to restaurant_owner_menu_category_write_authority
  using (true)
  with check (restaurant_internal.menu_category_name_allowed_v1(name) and sort_order >= 0);

create policy menu_categories_owner_write_tenant_select
  on public.menu_categories as restrictive for select to restaurant_owner_menu_category_write_authority
  using (exists (
    select 1 from public.menus as menu
    join public.restaurant_memberships as membership on membership.restaurant_id = menu.restaurant_id
    join public.restaurant_users as caller on caller.id = membership.restaurant_user_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where menu.id = menu_categories.menu_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ));
create policy menu_categories_owner_write_tenant_insert
  on public.menu_categories as restrictive for insert to restaurant_owner_menu_category_write_authority
  with check (exists (
    select 1 from public.menus as menu
    join public.restaurant_memberships as membership on membership.restaurant_id = menu.restaurant_id
    join public.restaurant_users as caller on caller.id = membership.restaurant_user_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where menu.id = menu_categories.menu_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ));
create policy menu_categories_owner_write_tenant_update
  on public.menu_categories as restrictive for update to restaurant_owner_menu_category_write_authority
  using (exists (
    select 1 from public.menus as menu
    join public.restaurant_memberships as membership on membership.restaurant_id = menu.restaurant_id
    join public.restaurant_users as caller on caller.id = membership.restaurant_user_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where menu.id = menu_categories.menu_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ))
  with check (exists (
    select 1 from public.menus as menu
    join public.restaurant_memberships as membership on membership.restaurant_id = menu.restaurant_id
    join public.restaurant_users as caller on caller.id = membership.restaurant_user_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where menu.id = menu_categories.menu_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ));

grant execute on function restaurant_internal.menu_category_name_allowed_v1(text)
  to restaurant_owner_menu_category_write_authority;

-- This role also needs to read the PARENT menu for tenant derivation and archived-parent
-- rejection, regardless of the menu's own publication status. The baseline's menus_public_read_dev
-- policy only shows status='published' rows, which a fresh draft menu is not -- this permissive
-- addition only ADDS visibility (OR'd with existing permissive policies) and narrows nothing.
create policy menus_category_authoring_context_select
  on public.menus for select to restaurant_owner_menu_category_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where membership.restaurant_id = menus.restaurant_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ));

grant create on schema public to restaurant_owner_menu_category_write_authority;

create function public.restaurant_owner_create_menu_category_v1(
  p_menu_id text,
  p_name text,
  p_sort_order integer default null
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_menu record;
  v_name text;
  v_sort_order integer;
  v_id text;
  v_content_version bigint;
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
  if p_menu_id is null or pg_catalog.length(p_menu_id) = 0 or p_name is null
    or (p_sort_order is not null and p_sort_order < 0) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_name := pg_catalog.btrim(p_name, ' ');
  if not restaurant_internal.menu_category_name_allowed_v1(v_name) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  -- Coarse gate: does the caller hold menu_category.write anywhere at all.
  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  -- restaurant_id is derived exclusively from menu_id here -- the caller never supplies it. This
  -- join simultaneously (a) resolves the parent menu, (b) verifies the caller's authority for THAT
  -- SPECIFIC restaurant, and (c) captures membership_id for the audit row. A menu that does not
  -- exist and a menu that belongs to a restaurant the caller has no access to are indistinguishable
  -- outcomes here (both target_not_found), so cross-tenant probing learns nothing.
  select menu.id, menu.restaurant_id, menu.status, membership.id as membership_id
  into v_menu
  from public.menus as menu
  join public.restaurant_memberships as membership
    on membership.restaurant_id = menu.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  where menu.id = p_menu_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  if v_menu.status = 'archived' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'parent_unavailable');
  end if;

  if p_sort_order is not null then
    v_sort_order := p_sort_order;
  else
    select coalesce(pg_catalog.max(category.sort_order), -1) + 1
    into v_sort_order
    from public.menu_categories as category
    where category.menu_id = v_menu.id;
  end if;

  v_id := pg_catalog.gen_random_uuid()::text;

  insert into public.menu_categories (id, menu_id, name, sort_order)
  values (v_id, v_menu.id, v_name, v_sort_order)
  returning content_version into v_content_version;

  insert into restaurant_internal.menu_category_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_id, menu_category_id, action,
     next_name, next_sort_order, next_content_version)
  values (v_actor, v_menu.membership_id, v_menu.restaurant_id, v_menu.id, v_id, 'CREATE',
     v_name, v_sort_order, v_content_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'created',
    'menuCategoryId', v_id, 'menuId', v_menu.id, 'restaurantId', v_menu.restaurant_id,
    'name', v_name, 'sortOrder', v_sort_order, 'contentVersion', v_content_version::text,
    'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_create_menu_category_v1(text, text, integer) is
  'R2B-3. Creates a new category under an existing menu. restaurant_id is always derived from menu_id -- never accepted as a caller-supplied argument.';

create function public.restaurant_owner_preview_menu_category_v1(
  p_restaurant_id text,
  p_menu_category_id text
)
returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = 'on'
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
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_menu_category_id is null or pg_catalog.length(p_menu_category_id) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select category.id, category.menu_id, menu.restaurant_id, category.name, category.sort_order,
         category.content_version
  into v_target
  from public.menu_categories as category
  join public.menus as menu on menu.id = category.menu_id
  join public.restaurant_memberships as membership
    on membership.restaurant_id = menu.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  where category.id = p_menu_category_id and menu.restaurant_id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'ready',
    'menuCategoryId', v_target.id, 'menuId', v_target.menu_id, 'restaurantId', v_target.restaurant_id,
    'name', v_target.name, 'sortOrder', v_target.sort_order,
    'contentVersion', v_target.content_version::text
  );
end;
$$;
comment on function public.restaurant_owner_preview_menu_category_v1(text, text) is
  'R2B-3. Returns the current name, sort_order and content_version of one menu category. Read-only and STABLE.';

create function public.restaurant_owner_set_menu_category_content_v1(
  p_menu_category_id text,
  p_expected_name text,
  p_next_name text,
  p_expected_sort_order integer,
  p_next_sort_order integer,
  p_expected_version bigint
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
  v_next_name text;
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
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_menu_category_id is null or pg_catalog.length(p_menu_category_id) = 0
    or p_next_name is null or p_next_sort_order is null or p_next_sort_order < 0
    or p_expected_sort_order is null or p_expected_sort_order < 0
    or p_expected_version is null or p_expected_version < 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_next_name := pg_catalog.btrim(p_next_name, ' ');
  if not restaurant_internal.menu_category_name_allowed_v1(v_next_name) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select category.id, category.menu_id, menu.restaurant_id, category.name, category.sort_order,
         category.content_version, membership.id as membership_id
  into v_target
  from public.menu_categories as category
  join public.menus as menu on menu.id = category.menu_id
  join public.restaurant_memberships as membership
    on membership.restaurant_id = menu.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_category.write' and permission.permission_scope = 'restaurant'
  where category.id = p_menu_category_id
  for update of category;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.name is distinct from p_expected_name
    or v_target.sort_order is distinct from p_expected_sort_order
    or v_target.content_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;
  if v_target.name = v_next_name and v_target.sort_order = p_next_sort_order then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.menu_categories set name = v_next_name, sort_order = p_next_sort_order
  where id = v_target.id
  returning content_version into v_next_version;

  insert into restaurant_internal.menu_category_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_id, menu_category_id, action,
     previous_name, next_name, previous_sort_order, next_sort_order,
     previous_content_version, next_content_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.menu_id, v_target.id,
     'CONTENT_EDIT', v_target.name, v_next_name, v_target.sort_order, p_next_sort_order,
     v_target.content_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'menuCategoryId', v_target.id, 'name', v_next_name, 'sortOrder', p_next_sort_order,
    'contentVersion', v_next_version::text, 'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_set_menu_category_content_v1(text, text, text, integer, integer, bigint) is
  'R2B-3. Renames and/or reorders one menu category via a single content_version. Category delete is not implemented (CATEGORY_DELETE_DEFERRED).';

revoke all on function public.restaurant_owner_create_menu_category_v1(text, text, integer)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_preview_menu_category_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_menu_category_content_v1(text, text, text, integer, integer, bigint)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_create_menu_category_v1(text, text, integer) to authenticated;
grant execute on function public.restaurant_owner_preview_menu_category_v1(text, text) to authenticated;
grant execute on function public.restaurant_owner_set_menu_category_content_v1(text, text, text, integer, integer, bigint) to authenticated;

alter function public.restaurant_owner_create_menu_category_v1(text, text, integer)
  owner to restaurant_owner_menu_category_write_authority;
alter function public.restaurant_owner_preview_menu_category_v1(text, text)
  owner to restaurant_owner_menu_category_write_authority;
alter function public.restaurant_owner_set_menu_category_content_v1(text, text, text, integer, integer, bigint)
  owner to restaurant_owner_menu_category_write_authority;

revoke create on schema public from restaurant_owner_menu_category_write_authority;
revoke restaurant_owner_menu_category_write_authority from postgres granted by postgres;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.menu_categories'::pg_catalog.regclass
    and policy.polname in ('menu_categories_owner_write_tenant_select', 'menu_categories_owner_write_tenant_insert',
                            'menu_categories_owner_write_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 3 then
    raise exception 'R2B-3: the tenant policies are not RESTRICTIVE (found % of 3)', v_count;
  end if;

  if not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'menu_id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'name', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'sort_order', 'INSERT') then
    raise exception 'R2B-3: the category writer lacks a required INSERT column privilege';
  end if;
  if pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'content_version', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'content_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'menu_id', 'UPDATE') then
    raise exception 'R2B-3: the category writer can write a column it must never write';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_categories', 'DELETE') then
    raise exception 'R2B-3: the category writer holds DELETE (CATEGORY_DELETE_DEFERRED)';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menus', 'INSERT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menus', 'UPDATE') then
    raise exception 'R2B-3: the category writer gained unrelated menus authority';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_menu_category_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'R2B-3: a client role holds membership of the category writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.menu_categories', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.menu_categories', 'UPDATE') then
    raise exception 'R2B-3: a client role gained direct table access to menu_categories';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_menu_write_authority', 'public.menu_categories', 'INSERT') then
    raise exception 'R2B-3: a frozen predecessor writer (R2B-2 menu authority) was widened to menu_categories';
  end if;
end
$$;

commit;
