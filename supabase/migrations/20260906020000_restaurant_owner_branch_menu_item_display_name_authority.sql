-- RA-2F-P1: the governed Restaurant Owner branch-menu display-name OVERRIDE authority.
--
-- WHAT THIS IS. A fifth, INDEPENDENT Restaurant Owner write on public.branch_menu_items: an
-- OPTIONAL, presentation-only override of the public display label for one existing branch-menu
-- offering, stored in the existing public.branch_menu_items.branch_specific_name column. It has
-- nothing to do with canonical menu identity: menu_item_id never changes, public.menu_items.name
-- (the canonical dish name) is never written by this authority, and nutrition, allergen, taxonomy,
-- recommendation and Meal Buddy matching all key off menu_item_id and canonical structured data that
-- this round never touches.
--
-- THE FALLBACK. The public catalogue projection already reads
-- COALESCE(branch_menu_items.branch_specific_name, menu_items.name) -- this round adds NO new
-- publication SQL. NULL means "use the canonical name"; a non-NULL override means "show this text at
-- this branch instead". This round governs moving between those two states and nothing else.
--
-- SET vs CLEAR, not string-shaped guessing. The Owner-selectable operation vocabulary is exactly
-- {set, clear}, chosen explicitly by the caller. Whitespace-only or empty input to `set` is
-- `invalid_request` -- it is never silently reinterpreted as `clear`, and `clear` is never expressed
-- by sending an empty string. The only representation of "no override" is SQL NULL.
--
-- description IS OUT OF SCOPE. RA-2F reconnaissance found materially higher content-safety risk in
-- branch_specific_description (it can carry factual claims like "無花生"/"純素" without touching
-- structured allergen truth). This migration creates no authority over it whatsoever, and asserts
-- that fact in its own epilogue.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The permission vocabulary.
-- ---------------------------------------------------------------------------------------------
alter table public.role_permissions
  drop constraint role_permissions_permission_key_check;

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
    'branch_menu_item.display_name.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch_menu_item.display_name.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare
  v_total integer;
  v_owner integer;
  v_predecessors integer;
begin
  select pg_catalog.count(*) into v_total
  from public.role_permissions as permission
  where permission.permission_key = 'branch_menu_item.display_name.write';
  if v_total <> 1 then
    raise exception 'RA-2F-P1: expected exactly one display-name-override permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_owner
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.display_name.write'
    and role.role_key = 'owner'
    and role.status = 'active'
    and permission.permission_scope = 'restaurant';
  if v_owner <> 1 then
    raise exception 'RA-2F-P1: the display-name-override permission is not owner/restaurant scoped';
  end if;

  select pg_catalog.count(*) into v_predecessors
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key in
      ('branch_menu_item.sold_out.write', 'branch_menu_item.availability.write',
       'branch_menu_item.price.write', 'branch_menu_item.visibility.write',
       'branch.profile.display_name.write')
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_predecessors <> 5 then
    raise exception 'RA-2F-P1: a frozen predecessor permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. The concurrency token, and the change-scoped canonical guard.
--
-- Mirrors THIS table's own established convention (sold_out_version / availability_version /
-- price_version): a single BEFORE INSERT OR UPDATE trigger that seeds 0 on insert and checks
-- `IS DISTINCT FROM` internally, rather than restaurant_branches' newer "UPDATE OF column" scoping.
-- `IS DISTINCT FROM` already treats NULL correctly (NULL vs NULL is not distinct; NULL vs a string
-- is distinct), so no special-casing is needed for nullability.
--
-- Canonical validation runs ONLY when the new value is non-NULL: a CLEAR (new value NULL) always
-- passes, and a SET is validated against the same 1..80/outer-trim/no-control-character contract
-- RA-2E-P1 established for restaurant_branches.name.
-- ---------------------------------------------------------------------------------------------
alter table public.branch_menu_items
  add column branch_specific_name_version bigint not null default 0;

alter table public.branch_menu_items
  add constraint branch_menu_items_branch_specific_name_version_non_negative
  check (branch_specific_name_version >= 0);

create function restaurant_internal.branch_menu_item_display_name_version_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.branch_specific_name_version := 0;
    return new;
  end if;

  if new.branch_specific_name is distinct from old.branch_specific_name then
    if new.branch_specific_name is not null then
      if pg_catalog.char_length(new.branch_specific_name) < 1
        or pg_catalog.char_length(new.branch_specific_name) > 80 then
        raise exception 'RA-2F-P1: a branch-menu display-name override must be 1 to 80 characters';
      end if;
      if new.branch_specific_name <> pg_catalog.btrim(new.branch_specific_name) then
        raise exception 'RA-2F-P1: a branch-menu display-name override must not carry leading or trailing whitespace';
      end if;
      if new.branch_specific_name ~ '[\x00-\x1F\x7F-\x9F]' then
        raise exception 'RA-2F-P1: a branch-menu display-name override must not contain control characters';
      end if;
    end if;
    new.branch_specific_name_version := old.branch_specific_name_version + 1;
  else
    new.branch_specific_name_version := old.branch_specific_name_version;
  end if;
  return new;
end;
$$;

create trigger branch_menu_items_display_name_version_maintain
  before insert or update on public.branch_menu_items
  for each row execute function
    restaurant_internal.branch_menu_item_display_name_version_maintain();

comment on function restaurant_internal.branch_menu_item_display_name_version_maintain() is
  'RA-2F-P1. Change-scoped canonical guard (skipped for CLEAR/NULL) plus DB-maintained version bump for branch_menu_items.branch_specific_name. Independent of sold_out_version/availability_version/price_version/branch_specific_status_version.';

-- ---------------------------------------------------------------------------------------------
-- 3. The sealed display-name-override writer.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_branch_menu_item_display_name_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_menu_item_display_name_write_authority is
  'RA-2F-P1 sealed writer. Owns the branch-menu display-name-override preview and mutation RPCs. Column UPDATE on branch_menu_items.branch_specific_name only; granted to no client role; cannot write branch_specific_description, sold_out, availability, price, branch_specific_status or any of their version columns.';

grant restaurant_owner_branch_menu_item_display_name_write_authority to postgres
  with admin false, inherit false, set true;

grant usage on schema restaurant_internal
  to restaurant_owner_branch_menu_item_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. The audit relation.
--
-- previous_display_name and next_display_name are NULLABLE: a CLEAR audits a transition INTO NULL,
-- and a SET on a previously-clear item audits a transition FROM NULL. Only the two Owner-governed
-- operations (set, clear) ever reach it; preview, invalid input, permission denial, a missing
-- target, a stale precondition and a no-change request never do.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.branch_menu_item_display_name_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  branch_menu_item_id text not null,
  menu_item_id text not null,
  previous_display_name text,
  next_display_name text,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_menu_item_display_name_audit_log_pkey primary key (id),
  constraint branch_menu_item_display_name_audit_log_transition_check
    check (previous_display_name is distinct from next_display_name),
  -- A non-NULL destination is always canonical; NULL (a CLEAR) is always valid.
  constraint branch_menu_item_display_name_audit_log_next_canonical_check
    check (next_display_name is null or (
      pg_catalog.char_length(next_display_name) >= 1
      and pg_catalog.char_length(next_display_name) <= 80
      and next_display_name = pg_catalog.btrim(next_display_name)
      and next_display_name !~ '[\x00-\x1F\x7F-\x9F]'
    )),
  constraint branch_menu_item_display_name_audit_log_version_advance_check
    check (next_version = previous_version + 1),
  constraint branch_menu_item_display_name_audit_log_version_non_negative_check
    check (previous_version >= 0)
);

create index branch_menu_item_display_name_audit_log_created_at_idx
  on restaurant_internal.branch_menu_item_display_name_audit_log (created_at desc);

create index branch_menu_item_display_name_audit_log_target_idx
  on restaurant_internal.branch_menu_item_display_name_audit_log (branch_menu_item_id, created_at desc);

comment on table restaurant_internal.branch_menu_item_display_name_audit_log is
  'RA-2F-P1 append-only branch-menu display-name-override audit. previous/next are nullable. No UPDATE or DELETE policy exists for any role, and no client role holds any privilege on it.';

alter table restaurant_internal.branch_menu_item_display_name_audit_log
  enable row level security;
alter table restaurant_internal.branch_menu_item_display_name_audit_log
  force row level security;

create policy branch_menu_item_display_name_audit_log_writer_select
  on restaurant_internal.branch_menu_item_display_name_audit_log
  for select to restaurant_owner_branch_menu_item_display_name_write_authority using (true);
create policy branch_menu_item_display_name_audit_log_writer_insert
  on restaurant_internal.branch_menu_item_display_name_audit_log
  for insert to restaurant_owner_branch_menu_item_display_name_write_authority with check (true);

revoke all on table restaurant_internal.branch_menu_item_display_name_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_menu_item_display_name_audit_log
  to restaurant_owner_branch_menu_item_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Minimum table privileges for the display-name-override writer.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users
  to restaurant_owner_branch_menu_item_display_name_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships
  to restaurant_owner_branch_menu_item_display_name_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles
  to restaurant_owner_branch_menu_item_display_name_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions
  to restaurant_owner_branch_menu_item_display_name_write_authority;
grant select (id, restaurant_id, branch_id, menu_item_id, branch_specific_name,
    branch_specific_name_version)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_display_name_write_authority;
grant update (branch_specific_name)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_display_name_write_authority;
-- The preview independently reports the current canonical menu_items.name alongside the override.
grant select (id, name)
  on table public.menu_items
  to restaurant_owner_branch_menu_item_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Row level security: permissive pair that grants, restrictive pair that narrows.
-- ---------------------------------------------------------------------------------------------
create policy branch_menu_items_owner_display_name_select
  on public.branch_menu_items
  for select to restaurant_owner_branch_menu_item_display_name_write_authority
  using (true);

create policy branch_menu_items_owner_display_name_update
  on public.branch_menu_items
  for update to restaurant_owner_branch_menu_item_display_name_write_authority
  using (true)
  with check (
    branch_specific_name is null or (
      pg_catalog.char_length(branch_specific_name) >= 1
      and pg_catalog.char_length(branch_specific_name) <= 80
      and branch_specific_name = pg_catalog.btrim(branch_specific_name)
      and branch_specific_name !~ '[\x00-\x1F\x7F-\x9F]'
    )
  );

create policy branch_menu_items_owner_display_name_tenant_select
  on public.branch_menu_items
  as restrictive
  for select to restaurant_owner_branch_menu_item_display_name_write_authority
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership
        on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role
        on role.id = membership.role_id
      join public.role_permissions as permission
        on permission.role_id = role.id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (
              nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
                ::pg_catalog.jsonb ->> 'sub'
            )
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = branch_menu_items.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch_menu_item.display_name.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy branch_menu_items_owner_display_name_tenant_update
  on public.branch_menu_items
  as restrictive
  for update to restaurant_owner_branch_menu_item_display_name_write_authority
  using (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership
        on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role
        on role.id = membership.role_id
      join public.role_permissions as permission
        on permission.role_id = role.id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (
              nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
                ::pg_catalog.jsonb ->> 'sub'
            )
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = branch_menu_items.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch_menu_item.display_name.write'
        and permission.permission_scope = 'restaurant'
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_users as caller
      join public.restaurant_memberships as membership
        on membership.restaurant_user_id = caller.id
      join public.restaurant_roles as role
        on role.id = membership.role_id
      join public.role_permissions as permission
        on permission.role_id = role.id
      where caller.auth_user_id = (
          coalesce(
            nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
            (
              nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
                ::pg_catalog.jsonb ->> 'sub'
            )
          )
        )::pg_catalog.uuid
        and caller.login_status = 'enabled'
        and membership.status = 'active'
        and membership.restaurant_id = branch_menu_items.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch_menu_item.display_name.write'
        and permission.permission_scope = 'restaurant'
    )
  );

grant create on schema public
  to restaurant_owner_branch_menu_item_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. The canonical preview.
--
-- Distinguishes the OVERRIDE (branchSpecificDisplayName, nullable) from the read-only
-- CANONICAL menu_items.name (canonicalDisplayName) so a future application layer can truthfully
-- render "currently showing the canonical name" without materializing the fallback into the
-- override field itself.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_preview_branch_menu_item_display_name_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_branch_menu_item_id text
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
        (
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
            ::pg_catalog.jsonb ->> 'sub'
        )
      )
    )::pg_catalog.uuid;
  exception
    when invalid_text_representation then v_actor := null;
    when others then v_actor := null;
  end;

  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_branch_menu_item_id is null or pg_catalog.length(p_branch_menu_item_id) = 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role
      on role.id = membership.role_id
    join public.role_permissions as permission
      on permission.role_id = role.id
    where caller.auth_user_id = v_actor
      and caller.login_status = 'enabled'
      and membership.status = 'active'
      and role.status = 'active'
      and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.display_name.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.branch_id, item.menu_item_id, item.branch_specific_name,
         item.branch_specific_name_version, menu_item.name as canonical_name
  into v_target
  from public.branch_menu_items as item
  join public.menu_items as menu_item
    on menu_item.id = item.menu_item_id
  join public.restaurant_memberships as membership
    on membership.restaurant_id = item.restaurant_id
   and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id
   and role.status = 'active'
   and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'branch_menu_item.display_name.write'
   and permission.permission_scope = 'restaurant'
  where item.id = p_branch_menu_item_id
    and item.restaurant_id = p_restaurant_id
    and item.branch_id = p_branch_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'ready',
    'branchMenuItemId', v_target.id,
    'branchId', v_target.branch_id,
    'menuItemId', v_target.menu_item_id,
    'branchSpecificDisplayName', v_target.branch_specific_name,
    'branchSpecificDisplayNameVersion', v_target.branch_specific_name_version::text,
    'canonicalDisplayName', v_target.canonical_name
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text) is
  'RA-2F-P1. Returns the current display-name override (nullable) and canonical menu name of one branch-menu offering to an active Restaurant Owner holding branch_menu_item.display_name.write. Read-only and STABLE. Takes no actor argument.';

-- ---------------------------------------------------------------------------------------------
-- 8. The canonical mutation.
--
--   p_operation                exactly 'set' or 'clear'.
--   p_expected_display_name    nullable concurrency evidence: NULL means "I believe there is
--                              currently no override"; a string names the exact stored override.
--                              Never conflated with an empty string.
--   p_next_display_name        for 'set', the proposed override (canonicalized by outer-trim before
--                              validation); for 'clear', MUST be NULL -- supplying a string with
--                              'clear' is invalid_request, not an override of the operation.
--   p_expected_version         concurrency evidence for branch_specific_name_version.
--
-- Nullable equality is checked with IS NOT DISTINCT FROM throughout, which is exactly the operator
-- PostgreSQL provides for "equal, treating two NULLs as equal" -- never `=`, which is NULL vs
-- anything and would break every NULL-current concurrency check silently.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_set_branch_menu_item_display_name_v1(
  p_branch_menu_item_id text,
  p_operation text,
  p_expected_display_name text,
  p_next_display_name text,
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
        (
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
            ::pg_catalog.jsonb ->> 'sub'
        )
      )
    )::pg_catalog.uuid;
  exception
    when invalid_text_representation then v_actor := null;
    when others then v_actor := null;
  end;

  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_branch_menu_item_id is null
    or pg_catalog.length(p_branch_menu_item_id) = 0
    or p_operation is null
    or p_operation not in ('set', 'clear')
    or p_expected_version is null
    or p_expected_version < 0
    or (p_operation = 'clear' and p_next_display_name is not null)
    or (p_operation = 'set' and p_next_display_name is null)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role
      on role.id = membership.role_id
    join public.role_permissions as permission
      on permission.role_id = role.id
    where caller.auth_user_id = v_actor
      and caller.login_status = 'enabled'
      and membership.status = 'active'
      and role.status = 'active'
      and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.display_name.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.restaurant_id, item.branch_id, item.menu_item_id,
         item.branch_specific_name, item.branch_specific_name_version,
         membership.id as membership_id
  into v_target
  from public.branch_menu_items as item
  join public.restaurant_memberships as membership
    on membership.restaurant_id = item.restaurant_id
   and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id
   and role.status = 'active'
   and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'branch_menu_item.display_name.write'
   and permission.permission_scope = 'restaurant'
  where item.id = p_branch_menu_item_id
  for update of item;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  -- Nullable-safe concurrency comparison. `=` would never match a NULL current override even when
  -- the caller correctly named it; IS NOT DISTINCT FROM treats two NULLs as equal, as required.
  if v_target.branch_specific_name is distinct from p_expected_display_name
    or v_target.branch_specific_name_version <> p_expected_version
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if p_operation = 'clear' then
    v_canonical_next := null;
  else
    -- SET: canonicalize (outer-trim only) BEFORE validation and BEFORE the no-change comparison, so
    -- outer whitespace alone is never a business change. Whitespace-only/empty input trims to an
    -- empty string, which fails the length floor below as invalid_request -- never reinterpreted as
    -- clear, and never treated as no_change.
    v_canonical_next := pg_catalog.btrim(p_next_display_name);
    if pg_catalog.char_length(v_canonical_next) < 1 or pg_catalog.char_length(v_canonical_next) > 80
      or v_canonical_next ~ '[\x00-\x1F\x7F-\x9F]'
    then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
  end if;

  if v_canonical_next is not distinct from v_target.branch_specific_name then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.branch_menu_items as item
  set branch_specific_name = v_canonical_next
  where item.id = v_target.id
  returning item.branch_specific_name_version into v_next_version;

  insert into restaurant_internal.branch_menu_item_display_name_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id, menu_item_id,
     previous_display_name, next_display_name, previous_version, next_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,
     v_target.menu_item_id, v_target.branch_specific_name, v_canonical_next,
     v_target.branch_specific_name_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'applied',
    'branchMenuItemId', v_target.id,
    'branchSpecificDisplayName', v_canonical_next,
    'branchSpecificDisplayNameVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint) is
  'RA-2F-P1. Applies an explicit set/clear operation on one branch-menu offering''s display-name override, for an active Restaurant Owner holding branch_menu_item.display_name.write. Never writes branch_specific_description, sold_out, availability, price, branch_specific_status or any of their version columns, and never writes menu_items.name.';

-- ---------------------------------------------------------------------------------------------
-- 9. Function privileges, settled BEFORE ownership moves.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function
    restaurant_internal.branch_menu_item_display_name_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)
  to authenticated;
grant execute on function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)
  to authenticated;

alter function public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)
  owner to restaurant_owner_branch_menu_item_display_name_write_authority;
alter function public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)
  owner to restaurant_owner_branch_menu_item_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public
  from restaurant_owner_branch_menu_item_display_name_write_authority;
revoke restaurant_owner_branch_menu_item_display_name_write_authority
  from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------
-- 11. Fail closed on anything this migration did not positively achieve.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_display_name_tenant_select',
                           'branch_menu_items_owner_display_name_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2F-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_display_name_select',
                           'branch_menu_items_owner_display_name_update')
    and policy.polpermissive = true;
  if v_count <> 2 then
    raise exception 'RA-2F-P1: the permissive display-name policies are missing (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2F-P1: the seed suspension did not restore FORCE row level security';
  end if;

  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'branch_specific_description', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'branch_specific_name_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'sold_out', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'sold_out_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'availability', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'availability_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'price', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'price_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'branch_specific_status', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'branch_specific_status_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'menu_item_id', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.menu_items', 'name', 'UPDATE') then
    raise exception 'RA-2F-P1: the display-name-override writer can write a column it must never write';
  end if;
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority',
       'public.branch_menu_items', 'branch_specific_name', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'branch_specific_name', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'branch_specific_name', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'branch_specific_name', 'UPDATE') then
    raise exception 'RA-2F-P1: a frozen predecessor writer was widened to branch_specific_name';
  end if;
  if pg_catalog.has_table_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2F-P1: the display-name-override writer holds broad table UPDATE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_display_name_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2F-P1: a client role holds membership of the display-name-override writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2F-P1: a client role gained direct UPDATE access to branch_menu_items';
  end if;

  -- description independence is asserted structurally: the writer has no privilege on it at all.
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'branch_specific_description', 'SELECT')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_display_name_write_authority',
       'public.branch_menu_items', 'branch_specific_description', 'UPDATE') then
    raise exception 'RA-2F-P1: the writer has any privilege at all on branch_specific_description';
  end if;
end
$$;

commit;
