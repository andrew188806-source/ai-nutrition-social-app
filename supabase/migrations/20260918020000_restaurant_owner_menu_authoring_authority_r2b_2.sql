begin;

-- R2B-2: the governed Restaurant Owner Menu authoring authority (create, rename, lifecycle).
--
-- WHAT THIS IS. Restaurant self-service creation and maintenance of public.menus rows. Every new
-- menu starts status = 'draft': it is never Consumer-visible at creation, and only an explicit,
-- separate lifecycle transition can publish it. Name and status are governed independently -- two
-- separate concurrency tokens, two separate mutation RPCs -- exactly like every other RA-2 field
-- authority, and for the same reason: a pending rename request must not be invalidated by an
-- unrelated status change and vice versa.
--
-- LIFECYCLE. menus.status already supports draft/published/archived (no new enum values). The
-- accepted transitions are exactly: draft -> published, published -> archived, draft -> archived.
-- There is no archived -> * transition: this round does not resurrect archived records, because no
-- schema or product evidence supports that being safe (a resurrected menu could reintroduce stale
-- categories/items without re-review). A later round may add it with its own explicit justification.

-- ---------------------------------------------------------------------------------------------
-- 1. The permission vocabulary. One new key, on the existing canonical Owner role only. Every
-- prior round's permission_key value is preserved verbatim in the widened CHECK.
-- ---------------------------------------------------------------------------------------------
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
    'menu.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'menu.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'menu.write'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner' and role.status = 'active';
  if v_count <> 1 then
    raise exception 'R2B-2: expected exactly one active owner/restaurant menu.write permission row';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. Canonical name text shape. Single-line: outer ASCII-space trim only, 1-120 Unicode code
-- points, every C0/C1 control character forbidden (no LF exception -- a menu name is not prose).
-- A whitespace-only value trims to length 0 and is rejected by the length bound alone.
-- ---------------------------------------------------------------------------------------------
create function restaurant_internal.menu_name_allowed_v1(p_text text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_text = pg_catalog.btrim(p_text, ' ')
    and pg_catalog.char_length(p_text) between 1 and 120
    and p_text !~ '[\x00-\x1F\x7F-\x9F]';
$$;
revoke all on function restaurant_internal.menu_name_allowed_v1(text)
  from public, anon, authenticated, authenticator, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Two independent concurrency tokens: name_version and status_version. Each starts at 0 on
-- INSERT and advances only when its own governed field actually changes.
-- ---------------------------------------------------------------------------------------------
alter table public.menus
  add column name_version bigint not null default 0,
  add column status_version bigint not null default 0;

alter table public.menus
  add constraint menus_name_version_non_negative check (name_version >= 0),
  add constraint menus_status_version_non_negative check (status_version >= 0),
  add constraint menus_name_check check (restaurant_internal.menu_name_allowed_v1(name));

create function restaurant_internal.menu_name_version_maintain()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.name_version := 0;
    return new;
  end if;
  if new.name is distinct from old.name then
    new.name_version := old.name_version + 1;
  else
    new.name_version := old.name_version;
  end if;
  return new;
end;
$$;
create trigger menus_name_version_maintain
  before insert or update on public.menus
  for each row execute function restaurant_internal.menu_name_version_maintain();
revoke all on function restaurant_internal.menu_name_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

create function restaurant_internal.menu_status_version_maintain()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.status_version := 0;
    return new;
  end if;
  if new.status is distinct from old.status then
    new.status_version := old.status_version + 1;
  else
    new.status_version := old.status_version;
  end if;
  return new;
end;
$$;
create trigger menus_status_version_maintain
  before insert or update on public.menus
  for each row execute function restaurant_internal.menu_status_version_maintain();
revoke all on function restaurant_internal.menu_status_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. The sealed writer. Owns INSERT of new menu rows plus UPDATE of name/status only.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_menu_write_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_menu_write_authority is
  'R2B-2 sealed writer. Owns menus CREATE and name/status UPDATE RPCs. INSERT limited to (id, restaurant_id, name, status); UPDATE limited to (name, status). Granted to no client role.';
grant restaurant_owner_menu_write_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_menu_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Append-only audit coverage for CREATE, RENAME and STATUS_TRANSITION. Each action's shape is
-- pinned by its own CHECK so a malformed audit row can never be written even by a future bug.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.menu_authoring_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  menu_id text not null,
  action text not null check (action in ('CREATE', 'RENAME', 'STATUS_TRANSITION')),
  previous_name text,
  next_name text,
  previous_status text,
  next_status text,
  previous_name_version bigint,
  next_name_version bigint,
  previous_status_version bigint,
  next_status_version bigint,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint menu_authoring_audit_log_pkey primary key (id),
  constraint menu_authoring_audit_log_create_shape check (
    action <> 'CREATE' or (
      previous_name is null and next_name is not null
      and previous_status is null and next_status = 'draft'
      and previous_name_version is null and next_name_version = 0
      and previous_status_version is null and next_status_version = 0
    )
  ),
  constraint menu_authoring_audit_log_rename_shape check (
    action <> 'RENAME' or (
      previous_name is not null and next_name is not null and previous_name <> next_name
      and previous_status is null and next_status is null
      and previous_name_version is not null and next_name_version = previous_name_version + 1
      and previous_status_version is null and next_status_version is null
    )
  ),
  constraint menu_authoring_audit_log_transition_shape check (
    action <> 'STATUS_TRANSITION' or (
      previous_name is null and next_name is null
      and previous_status is not null and next_status is not null and previous_status <> next_status
      and previous_name_version is null and next_name_version is null
      and previous_status_version is not null and next_status_version = previous_status_version + 1
    )
  )
);
create index menu_authoring_audit_log_target_idx
  on restaurant_internal.menu_authoring_audit_log (menu_id, created_at desc);
alter table restaurant_internal.menu_authoring_audit_log enable row level security;
alter table restaurant_internal.menu_authoring_audit_log force row level security;
create policy menu_authoring_audit_log_writer_select
  on restaurant_internal.menu_authoring_audit_log
  for select to restaurant_owner_menu_write_authority using (true);
create policy menu_authoring_audit_log_writer_insert
  on restaurant_internal.menu_authoring_audit_log
  for insert to restaurant_owner_menu_write_authority with check (true);
-- No UPDATE policy and no DELETE policy exist on this relation, for any role.
revoke all on table restaurant_internal.menu_authoring_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.menu_authoring_audit_log
  to restaurant_owner_menu_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Minimum table privileges. INSERT is column-scoped exactly like UPDATE: an explicit column
-- list naming (id, restaurant_id, name, status) means Postgres checks INSERT privilege only on
-- those four columns, and name_version/status_version always take their DEFAULT 0 -- there is no
-- INSERT privilege on them at all, so no RPC bug could ever set either version column directly.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users to restaurant_owner_menu_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships to restaurant_owner_menu_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles to restaurant_owner_menu_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions to restaurant_owner_menu_write_authority;
grant select (id, restaurant_id, name, name_version, status, status_version)
  on table public.menus to restaurant_owner_menu_write_authority;
grant insert (id, restaurant_id, name, status)
  on table public.menus to restaurant_owner_menu_write_authority;
grant update (name, status)
  on table public.menus to restaurant_owner_menu_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. Row level security. Permissive pair grants; restrictive pair narrows to the caller's own
-- tenant, exactly the RA-2 double-policy shape (kept for INSERT too, for defensive consistency,
-- even though the baseline carries no pre-existing permissive INSERT/ALL policy that could OR-defeat
-- a bare restrictive INSERT policy here).
-- ---------------------------------------------------------------------------------------------
create policy menus_owner_write_select
  on public.menus for select to restaurant_owner_menu_write_authority using (true);
create policy menus_owner_write_insert
  on public.menus for insert to restaurant_owner_menu_write_authority
  with check (status = 'draft' and restaurant_internal.menu_name_allowed_v1(name));
create policy menus_owner_write_update
  on public.menus for update to restaurant_owner_menu_write_authority
  using (true)
  with check (
    restaurant_internal.menu_name_allowed_v1(name)
    and status in ('draft', 'published', 'archived')
  );

create policy menus_owner_write_tenant_select
  on public.menus as restrictive for select to restaurant_owner_menu_write_authority
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
      and membership.restaurant_id = menus.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  ));
create policy menus_owner_write_tenant_insert
  on public.menus as restrictive for insert to restaurant_owner_menu_write_authority
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
      and membership.restaurant_id = menus.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  ));
create policy menus_owner_write_tenant_update
  on public.menus as restrictive for update to restaurant_owner_menu_write_authority
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
      and membership.restaurant_id = menus.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
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
      and membership.restaurant_id = menus.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  ));

grant execute on function restaurant_internal.menu_name_allowed_v1(text)
  to restaurant_owner_menu_write_authority;

grant create on schema public to restaurant_owner_menu_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 8. RPCs. R2A flagged public.restaurant_has_restaurant_permission as a reusable candidate; it is
-- NOT called here because it is SECURITY DEFINER owned by restaurant_membership_context_reader,
-- and that role's membership was deliberately revoked from postgres at the end of its own
-- migration (RA-2B-P0) -- granting EXECUTE on it to a new sealed role would require re-acquiring
-- administrative authority over a frozen predecessor role, which this round does not do. Every
-- gate below instead uses the same explicit owner+active-membership+permission predicate as every
-- existing RA-2 RPC, which R2A already verified is semantically identical.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_create_menu_v1(
  p_restaurant_id text,
  p_name text
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_name text;
  v_id text;
  v_name_version bigint;
  v_status_version bigint;
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

  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0 or p_name is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_name := pg_catalog.btrim(p_name, ' ');
  if not restaurant_internal.menu_name_allowed_v1(v_name) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  -- The single gate: an active owner membership in p_restaurant_id holding menu.write. If the
  -- caller's restaurant_id no longer resolves to a live restaurant, restaurant_memberships' own FK
  -- to restaurants(id) guarantees this finds nothing -- so a nonexistent restaurant_id is
  -- indistinguishable from permission_denied, and a caller with no real membership learns nothing
  -- about whether the id exists.
  select membership.id into v_membership_id
  from public.restaurant_users as caller
  join public.restaurant_memberships as membership
    on membership.restaurant_user_id = caller.id
   and membership.status = 'active' and membership.restaurant_id = p_restaurant_id
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
  limit 1;

  if v_membership_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  v_id := pg_catalog.gen_random_uuid()::text;

  insert into public.menus (id, restaurant_id, name, status)
  values (v_id, p_restaurant_id, v_name, 'draft')
  returning name_version, status_version into v_name_version, v_status_version;

  insert into restaurant_internal.menu_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_id, action,
     next_name, next_status, next_name_version, next_status_version)
  values (v_actor, v_membership_id, p_restaurant_id, v_id, 'CREATE',
     v_name, 'draft', v_name_version, v_status_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'created',
    'menuId', v_id, 'restaurantId', p_restaurant_id,
    'name', v_name, 'nameVersion', v_name_version::text,
    'status', 'draft', 'statusVersion', v_status_version::text,
    'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_create_menu_v1(text, text) is
  'R2B-2. Creates a new draft menu under the caller''s own restaurant. Status is always draft at creation; never accepts a status argument.';

create function public.restaurant_owner_preview_menu_v1(
  p_restaurant_id text,
  p_menu_id text
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
    or p_menu_id is null or pg_catalog.length(p_menu_id) = 0 then
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
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select menu.id, menu.restaurant_id, menu.name, menu.name_version, menu.status, menu.status_version
  into v_target
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
   and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  where menu.id = p_menu_id and menu.restaurant_id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'ready',
    'menuId', v_target.id, 'restaurantId', v_target.restaurant_id,
    'name', v_target.name, 'nameVersion', v_target.name_version::text,
    'status', v_target.status, 'statusVersion', v_target.status_version::text
  );
end;
$$;
comment on function public.restaurant_owner_preview_menu_v1(text, text) is
  'R2B-2. Returns the current name, status and both concurrency tokens of one menu to an active Restaurant Owner holding menu.write. Read-only and STABLE.';

create function public.restaurant_owner_set_menu_name_v1(
  p_menu_id text,
  p_expected_name text,
  p_next_name text,
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
  if p_menu_id is null or pg_catalog.length(p_menu_id) = 0
    or p_next_name is null or p_expected_version is null or p_expected_version < 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_next_name := pg_catalog.btrim(p_next_name, ' ');
  if not restaurant_internal.menu_name_allowed_v1(v_next_name) then
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
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select menu.id, menu.restaurant_id, menu.name, menu.name_version, membership.id as membership_id
  into v_target
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
   and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  where menu.id = p_menu_id
  for update of menu;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.name is distinct from p_expected_name or v_target.name_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;
  if v_target.name = v_next_name then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.menus set name = v_next_name where id = v_target.id
  returning name_version into v_next_version;

  insert into restaurant_internal.menu_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_id, action,
     previous_name, next_name, previous_name_version, next_name_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.id, 'RENAME',
     v_target.name, v_next_name, v_target.name_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'menuId', v_target.id, 'name', v_next_name,
    'nameVersion', v_next_version::text, 'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_set_menu_name_v1(text, text, text, bigint) is
  'R2B-2. Renames one menu. Never writes status or status_version. Takes no actor argument.';

create function public.restaurant_owner_transition_menu_status_v1(
  p_menu_id text,
  p_expected_status text,
  p_next_status text,
  p_expected_version bigint
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
  v_next_version bigint;
  v_audit_id uuid;
  v_allowed boolean;
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
  if p_menu_id is null or pg_catalog.length(p_menu_id) = 0
    or p_expected_status is null or p_next_status is null
    or p_expected_status not in ('draft', 'published', 'archived')
    or p_next_status not in ('draft', 'published', 'archived')
    or p_expected_version is null or p_expected_version < 0 then
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
      and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select menu.id, menu.restaurant_id, menu.status, menu.status_version, membership.id as membership_id
  into v_target
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
   and permission.permission_key = 'menu.write' and permission.permission_scope = 'restaurant'
  where menu.id = p_menu_id
  for update of menu;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.status is distinct from p_expected_status or v_target.status_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;
  if v_target.status = p_next_status then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  -- Exactly the three accepted transitions. No archived -> * transition exists.
  v_allowed := (v_target.status = 'draft' and p_next_status = 'published')
    or (v_target.status = 'published' and p_next_status = 'archived')
    or (v_target.status = 'draft' and p_next_status = 'archived');
  if not v_allowed then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_transition');
  end if;

  update public.menus set status = p_next_status where id = v_target.id
  returning status_version into v_next_version;

  insert into restaurant_internal.menu_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_id, action,
     previous_status, next_status, previous_status_version, next_status_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.id, 'STATUS_TRANSITION',
     v_target.status, p_next_status, v_target.status_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'menuId', v_target.id, 'status', p_next_status,
    'statusVersion', v_next_version::text, 'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_transition_menu_status_v1(text, text, text, bigint) is
  'R2B-2. Transitions one menu''s status. Accepted transitions only: draft->published, published->archived, draft->archived. Never writes name or name_version.';

-- ---------------------------------------------------------------------------------------------
-- 9. Function privileges, settled BEFORE ownership moves (load-bearing ordering, per RA-2C-P1).
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_create_menu_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_preview_menu_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_menu_name_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_transition_menu_status_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_create_menu_v1(text, text) to authenticated;
grant execute on function public.restaurant_owner_preview_menu_v1(text, text) to authenticated;
grant execute on function public.restaurant_owner_set_menu_name_v1(text, text, text, bigint) to authenticated;
grant execute on function public.restaurant_owner_transition_menu_status_v1(text, text, text, bigint) to authenticated;

alter function public.restaurant_owner_create_menu_v1(text, text)
  owner to restaurant_owner_menu_write_authority;
alter function public.restaurant_owner_preview_menu_v1(text, text)
  owner to restaurant_owner_menu_write_authority;
alter function public.restaurant_owner_set_menu_name_v1(text, text, text, bigint)
  owner to restaurant_owner_menu_write_authority;
alter function public.restaurant_owner_transition_menu_status_v1(text, text, text, bigint)
  owner to restaurant_owner_menu_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public from restaurant_owner_menu_write_authority;
revoke restaurant_owner_menu_write_authority from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------
-- 11. Fail closed on anything this migration did not positively achieve.
-- ---------------------------------------------------------------------------------------------
do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.menus'::pg_catalog.regclass
    and policy.polname in ('menus_owner_write_tenant_select', 'menus_owner_write_tenant_insert',
                            'menus_owner_write_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 3 then
    raise exception 'R2B-2: the tenant policies are not RESTRICTIVE (found % of 3)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.menus'::pg_catalog.regclass
    and policy.polname in ('menus_owner_write_select', 'menus_owner_write_insert', 'menus_owner_write_update')
    and policy.polpermissive = true;
  if v_count <> 3 then
    raise exception 'R2B-2: the permissive menu policies are missing (found % of 3)', v_count;
  end if;

  if not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'restaurant_id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'name', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'status', 'INSERT') then
    raise exception 'R2B-2: the menu writer lacks a required INSERT column privilege';
  end if;
  if pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'name_version', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'status_version', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'name_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'status_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'restaurant_id', 'UPDATE') then
    raise exception 'R2B-2: the menu writer can write a column it must never write';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_menu_write_authority', 'public.menus', 'DELETE') then
    raise exception 'R2B-2: the menu writer holds DELETE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_menu_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'R2B-2: a client role holds membership of the menu writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.menus', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.menus', 'UPDATE') then
    raise exception 'R2B-2: a client role gained direct table access to menus';
  end if;

  -- No predecessor (existing RA-2 sealed roles) was widened to touch menus at all.
  if pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_price_write_authority', 'public.menus', 'INSERT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_about_write_authority', 'public.menus', 'INSERT') then
    raise exception 'R2B-2: a frozen predecessor writer was widened to menus';
  end if;
end
$$;

commit;
