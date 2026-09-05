-- RA-2D-P1: the governed Restaurant Owner branch-menu offering visibility authority.
--
-- WHAT THIS IS. A fourth, INDEPENDENT Restaurant Owner write on public.branch_menu_items: temporary
-- Owner-controlled visibility over ONE existing stored value, public.branch_menu_items.
-- branch_specific_status, restricted to exactly two directions:
--
--   available -> hidden   Owner-facing copy: "暫時隱藏" (temporarily hide)
--   hidden -> available   Owner-facing copy: "恢復顯示" (restore display)
--
-- available means the offering is ALLOWED to participate in normal publication and recommendation
-- eligibility, subject to every other existing gate. hidden means the Owner has temporarily hidden
-- the offering from that eligibility while the offering itself, and every other fact about it,
-- is preserved untouched.
--
-- discontinued IS OUT OF SCOPE. It stays a valid stored value -- rows already holding it are neither
-- migrated nor reinterpreted -- but this round grants the Owner NO authority to move a row into or
-- out of it. Its future governance is deliberately left unresolved. See design note 2 below for
-- exactly where that boundary is enforced and why.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The permission vocabulary.
--
-- One new key, on the existing canonical Owner role only. Every predecessor permission row is
-- preserved untouched, and the CHECK widens by exactly one value.
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
    'branch_menu_item.visibility.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch_menu_item.visibility.write', 'restaurant'
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
  where permission.permission_key = 'branch_menu_item.visibility.write';
  if v_total <> 1 then
    raise exception 'RA-2D-P1: expected exactly one visibility permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_owner
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.visibility.write'
    and role.role_key = 'owner'
    and role.status = 'active'
    and permission.permission_scope = 'restaurant';
  if v_owner <> 1 then
    raise exception 'RA-2D-P1: the visibility permission is not owner/restaurant scoped';
  end if;

  select pg_catalog.count(*) into v_predecessors
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key in
      ('branch_menu_item.sold_out.write', 'branch_menu_item.availability.write',
       'branch_menu_item.price.write')
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_predecessors <> 3 then
    raise exception 'RA-2D-P1: a frozen predecessor permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. The concurrency token.
--
-- DESIGN NOTE: no trigger-level transition restriction. The version-maintenance trigger below is
-- pure bookkeeping -- it seeds 0 on insert and advances exactly once when branch_specific_status
-- actually changes -- with NO opinion on which values are legal to move between. That mirrors the
-- sold_out and availability triggers exactly: a table-wide invariant blocking any transition into or
-- out of 'discontinued' would need to be loosened by whichever future round is authorized to govern
-- discontinued, coupling this round to a decision that has not been made. Transition legality is an
-- AUTHORIZATION rule, not a value-domain rule, so it lives entirely in the mutation RPC below, scoped
-- to this round's own sealed writer, and nowhere else.
-- ---------------------------------------------------------------------------------------------
alter table public.branch_menu_items
  add column branch_specific_status_version bigint not null default 0;

alter table public.branch_menu_items
  add constraint branch_menu_items_branch_specific_status_version_non_negative
  check (branch_specific_status_version >= 0);

create function restaurant_internal.branch_menu_item_branch_specific_status_version_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.branch_specific_status_version := 0;
    return new;
  end if;

  if new.branch_specific_status is distinct from old.branch_specific_status then
    new.branch_specific_status_version := old.branch_specific_status_version + 1;
  else
    new.branch_specific_status_version := old.branch_specific_status_version;
  end if;
  return new;
end;
$$;

create trigger branch_menu_items_branch_specific_status_version_maintain
  before insert or update on public.branch_menu_items
  for each row execute function
    restaurant_internal.branch_menu_item_branch_specific_status_version_maintain();

-- ---------------------------------------------------------------------------------------------
-- 3. The sealed visibility writer.
--
-- A fourth sealed role, not a widening of any predecessor. sold_out, availability, price and
-- visibility are four independent operational dimensions with four independent audit trails; one
-- role holding more than one would let a defect in any single operation write another's column.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_branch_menu_item_visibility_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_menu_item_visibility_write_authority is
  'RA-2D-P1 sealed writer. Owns the branch-menu visibility preview and mutation RPCs. Column UPDATE on branch_menu_items.branch_specific_status only, restricted by RPC logic to the available<->hidden transition; granted to no client role; cannot write sold_out, availability, price or any of their version columns.';

grant restaurant_owner_branch_menu_item_visibility_write_authority to postgres
  with admin false, inherit false, set true;

grant usage on schema restaurant_internal
  to restaurant_owner_branch_menu_item_visibility_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. The audit relation.
--
-- Append-only by construction. Only applied available<->hidden transitions are recorded; no-change,
-- invalid-transition, stale, permission-denied, target-not-found and invalid-request outcomes never
-- reach it. No free-text reason field and no JSON payload in this round.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.branch_menu_item_visibility_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  branch_menu_item_id text not null,
  menu_item_id text not null,
  previous_status text not null,
  next_status text not null,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_menu_item_visibility_audit_log_pkey primary key (id),
  constraint branch_menu_item_visibility_audit_log_transition_check
    check (previous_status <> next_status),
  -- Only the two Owner-governed values may ever appear here, on either side of the transition.
  -- discontinued can never be recorded, because the RPC never applies a write that touches it.
  constraint branch_menu_item_visibility_audit_log_previous_canonical_check
    check (previous_status in ('available', 'hidden')),
  constraint branch_menu_item_visibility_audit_log_next_canonical_check
    check (next_status in ('available', 'hidden')),
  constraint branch_menu_item_visibility_audit_log_version_advance_check
    check (next_version = previous_version + 1),
  constraint branch_menu_item_visibility_audit_log_version_non_negative_check
    check (previous_version >= 0)
);

create index branch_menu_item_visibility_audit_log_created_at_idx
  on restaurant_internal.branch_menu_item_visibility_audit_log (created_at desc);

create index branch_menu_item_visibility_audit_log_target_idx
  on restaurant_internal.branch_menu_item_visibility_audit_log (branch_menu_item_id, created_at desc);

comment on table restaurant_internal.branch_menu_item_visibility_audit_log is
  'RA-2D-P1 append-only branch-menu visibility audit. No UPDATE or DELETE policy exists for any role, and no client role holds any privilege on it.';

alter table restaurant_internal.branch_menu_item_visibility_audit_log
  enable row level security;
alter table restaurant_internal.branch_menu_item_visibility_audit_log
  force row level security;

create policy branch_menu_item_visibility_audit_log_writer_select
  on restaurant_internal.branch_menu_item_visibility_audit_log
  for select to restaurant_owner_branch_menu_item_visibility_write_authority using (true);
create policy branch_menu_item_visibility_audit_log_writer_insert
  on restaurant_internal.branch_menu_item_visibility_audit_log
  for insert to restaurant_owner_branch_menu_item_visibility_write_authority with check (true);

revoke all on table restaurant_internal.branch_menu_item_visibility_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_menu_item_visibility_audit_log
  to restaurant_owner_branch_menu_item_visibility_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Minimum table privileges for the visibility writer.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users
  to restaurant_owner_branch_menu_item_visibility_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships
  to restaurant_owner_branch_menu_item_visibility_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles
  to restaurant_owner_branch_menu_item_visibility_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions
  to restaurant_owner_branch_menu_item_visibility_write_authority;
grant select (id, restaurant_id, branch_id, menu_item_id, branch_specific_status,
    branch_specific_status_version)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_visibility_write_authority;
grant update (branch_specific_status)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_visibility_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Row level security: permissive pair that grants, restrictive pair that narrows.
-- ---------------------------------------------------------------------------------------------
create policy branch_menu_items_owner_visibility_select
  on public.branch_menu_items
  for select to restaurant_owner_branch_menu_item_visibility_write_authority
  using (true);

create policy branch_menu_items_owner_visibility_update
  on public.branch_menu_items
  for update to restaurant_owner_branch_menu_item_visibility_write_authority
  using (true)
  with check (branch_specific_status in ('available', 'hidden'));

create policy branch_menu_items_owner_visibility_tenant_select
  on public.branch_menu_items
  as restrictive
  for select to restaurant_owner_branch_menu_item_visibility_write_authority
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
        and permission.permission_key = 'branch_menu_item.visibility.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy branch_menu_items_owner_visibility_tenant_update
  on public.branch_menu_items
  as restrictive
  for update to restaurant_owner_branch_menu_item_visibility_write_authority
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
        and permission.permission_key = 'branch_menu_item.visibility.write'
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
        and permission.permission_key = 'branch_menu_item.visibility.write'
        and permission.permission_scope = 'restaurant'
    )
  );

grant create on schema public
  to restaurant_owner_branch_menu_item_visibility_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. The canonical preview.
--
-- Read-only and STABLE. The three parameters are SELECTORS, never authority: the caller's own
-- membership chain is joined, so a row under another restaurant produces no join row -- the same
-- result as a row that does not exist. branchSpecificStatus may truthfully report 'discontinued',
-- because preview describes stored state; that visibility grants no mutation authority over it.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_preview_branch_menu_item_visibility_v1(
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
      and permission.permission_key = 'branch_menu_item.visibility.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.branch_id, item.menu_item_id, item.branch_specific_status,
         item.branch_specific_status_version
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
   and permission.permission_key = 'branch_menu_item.visibility.write'
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
    'branchSpecificStatus', v_target.branch_specific_status,
    'branchSpecificStatusVersion', v_target.branch_specific_status_version::text
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text) is
  'RA-2D-P1. Returns the current visibility status and concurrency token of one branch-menu offering to an active Restaurant Owner holding branch_menu_item.visibility.write. May truthfully report discontinued; grants no mutation authority over it. Read-only and STABLE. Takes no actor argument.';

-- ---------------------------------------------------------------------------------------------
-- 8. The canonical mutation.
--
--   p_expected_status   the current value the caller believes it is replacing: 'available',
--                       'hidden', or 'discontinued' (the last is legitimate input, needed to prove
--                       concurrency against a row that is genuinely discontinued -- it always
--                       results in invalid_transition, never a write).
--   p_next_status       the Owner-selectable destination. Vocabulary is exactly 'available' and
--                       'hidden'; 'discontinued' is not a member of this vocabulary at all, so
--                       naming it here is invalid_request, not invalid_transition.
--
-- Validation order: auth -> lexical vocabulary (both parameters) -> transition legality
-- (expected='discontinued' is refused before any row is touched) -> permission -> tenant/target
-- lock -> expected status + version -> no_change -> update -> audit. This mirrors RA-2C-P1's
-- ordering discipline: a bounded-vocabulary check happens before the permission check, so an
-- authorization boundary is never used to help distinguish malformed input from a real target.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_set_branch_menu_item_visibility_v1(
  p_branch_menu_item_id text,
  p_expected_status text,
  p_next_status text,
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
    or p_expected_status is null
    or p_expected_status not in ('available', 'hidden', 'discontinued')
    or p_next_status is null
    or p_next_status not in ('available', 'hidden')
    or p_expected_version is null
    or p_expected_version < 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  -- discontinued is out of scope for this authority in EITHER direction. p_next_status can never be
  -- 'discontinued' (rejected above as invalid_request, out of vocabulary), so the only remaining way
  -- a discontinued row could be touched is a caller correctly naming it as the expected current
  -- state -- which this authority is not permitted to move anywhere.
  if p_expected_status = 'discontinued' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_transition');
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
      and permission.permission_key = 'branch_menu_item.visibility.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.restaurant_id, item.branch_id, item.menu_item_id,
         item.branch_specific_status, item.branch_specific_status_version,
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
   and permission.permission_key = 'branch_menu_item.visibility.write'
   and permission.permission_scope = 'restaurant'
  where item.id = p_branch_menu_item_id
  for update of item;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  -- A row that is genuinely discontinued, but whose caller supplied a stale/incorrect expected
  -- value that happens to be 'available' or 'hidden', is refused here as stale_state -- the same
  -- treatment any other concurrency mismatch gets. This authority never discovers a row is
  -- discontinued and silently reinterprets the caller's request; it just tells them their
  -- precondition does not hold.
  if v_target.branch_specific_status <> p_expected_status
    or v_target.branch_specific_status_version <> p_expected_version
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if p_next_status = v_target.branch_specific_status then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.branch_menu_items as item
  set branch_specific_status = p_next_status
  where item.id = v_target.id
  returning item.branch_specific_status_version into v_next_version;

  insert into restaurant_internal.branch_menu_item_visibility_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id, menu_item_id,
     previous_status, next_status, previous_version, next_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,
     v_target.menu_item_id, v_target.branch_specific_status, p_next_status,
     v_target.branch_specific_status_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'applied',
    'branchMenuItemId', v_target.id,
    'branchSpecificStatus', p_next_status,
    'branchSpecificStatusVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint) is
  'RA-2D-P1. Applies the available<->hidden transition on one branch-menu offering for an active Restaurant Owner holding branch_menu_item.visibility.write. Any request naming or targeting discontinued is refused as invalid_request or invalid_transition and never applied. Takes no actor argument. Never writes sold_out, availability, price or any of their version columns.';

-- ---------------------------------------------------------------------------------------------
-- 9. Function privileges, settled BEFORE ownership moves.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function
    restaurant_internal.branch_menu_item_branch_specific_status_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)
  to authenticated;
grant execute on function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)
  to authenticated;

alter function public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)
  owner to restaurant_owner_branch_menu_item_visibility_write_authority;
alter function public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)
  owner to restaurant_owner_branch_menu_item_visibility_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public
  from restaurant_owner_branch_menu_item_visibility_write_authority;
revoke restaurant_owner_branch_menu_item_visibility_write_authority
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
    and policy.polname in ('branch_menu_items_owner_visibility_tenant_select',
                           'branch_menu_items_owner_visibility_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2D-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_visibility_select',
                           'branch_menu_items_owner_visibility_update')
    and policy.polpermissive = true;
  if v_count <> 2 then
    raise exception 'RA-2D-P1: the permissive visibility policies are missing (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2D-P1: the seed suspension did not restore FORCE row level security';
  end if;

  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'sold_out', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'sold_out_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'availability', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'availability_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'price', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'price_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'branch_specific_status_version', 'UPDATE') then
    raise exception 'RA-2D-P1: the visibility writer can write a column it must never write';
  end if;
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority',
       'public.branch_menu_items', 'branch_specific_status', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'branch_specific_status', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'branch_specific_status', 'UPDATE') then
    raise exception 'RA-2D-P1: a frozen predecessor writer was widened to branch_specific_status';
  end if;
  if pg_catalog.has_table_privilege('restaurant_owner_branch_menu_item_visibility_write_authority',
       'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2D-P1: the visibility writer holds broad table UPDATE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_visibility_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2D-P1: a client role holds membership of the visibility writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'SELECT') then
    raise exception 'RA-2D-P1: a client role gained direct table access to branch_menu_items';
  end if;

  -- discontinued rows must remain fully valid: this round adds no CHECK that reads
  -- branch_specific_status beyond the pre-existing enum CHECK, so it cannot make an unrelated write
  -- on a discontinued row fail.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and constraint_row.contype = 'c'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%branch_specific_status%'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%branch_specific_status_version%';
  if v_count <> 1 then
    raise exception 'RA-2D-P1: an unexpected constraint on branch_specific_status was added (found %, expected the pre-existing enum CHECK only)', v_count;
  end if;
end
$$;

commit;
