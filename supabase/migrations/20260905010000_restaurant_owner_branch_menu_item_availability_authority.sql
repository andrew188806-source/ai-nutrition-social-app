-- RA-2B-P1: the governed Restaurant Owner branch-menu availability authority.
--
-- WHAT THIS IS. A second, INDEPENDENT Restaurant Owner write on public.branch_menu_items: the
-- operational availability of one offering, over the closed vocabulary available / limited /
-- unavailable. It is not an extension of RA-2A's sold-out authority and shares nothing writable
-- with it.
--
-- WHY A SECOND SEALED ROLE. Both operations target the same table, so the temptation is to widen
-- RA-2A's writer by one column grant. That is refused deliberately. `sold_out` answers "is this
-- finished for today"; `availability` answers "do we offer this at all". They are separate
-- operational dimensions with separate audit trails, and a single role holding both would mean a
-- defect in either operation could write the other's column. Operation-level least privilege costs
-- one role and buys a boundary that a migration cannot accidentally erase.
--
-- WHY THE TENANT POLICIES ARE RESTRICTIVE. `branch_menu_items` already carries a PERMISSIVE policy
-- granted to PUBLIC (`branch_items_public_read_dev`), and PostgreSQL OR's permissive policies
-- together. A permissive owner-scoped policy therefore narrows NOTHING on the read path — RA-2A-P1-R1
-- proved exactly that against a real cluster, where an owner of one restaurant could read another's
-- row. Restrictive policies are AND'ed with the permissive result, so the pair below
-- (permissive visibility + restrictive tenant) is what actually constrains this role.
--
-- Restrictive policies alone would grant nothing: with no permissive policy applicable, no row is
-- visible at all. Both are required, and both are asserted at the end of this migration.
--
-- EVEN SO, THE FUNCTIONS PROVE THE TENANT THEMSELVES. Row level security is defence in depth here,
-- not the authority: both RPCs join the caller's own membership chain, so a cross-tenant write needs
-- two independent failures.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The permission vocabulary.
--
-- One new key, on the existing canonical Owner role only. RA-2A's sold-out permission row is
-- preserved untouched, and the CHECK widens by exactly one value.
--
-- Both tables carry FORCE row level security, which applies to the owner too: role_permissions has
-- no INSERT policy for any role, and restaurant_roles is readable only through a policy scoped to
-- the verified request subject, which a migration does not have. Their original rows were seeded
-- before RLS was enabled. The seed is therefore bracketed by an explicit same-transaction
-- suspension and verified INSIDE it — relying on the runner happening to hold BYPASSRLS would make
-- this migration insert nothing wherever that attribute is absent.
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
    'branch_menu_item.availability.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch_menu_item.availability.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare
  v_total integer;
  v_owner integer;
  v_sold_out integer;
begin
  select pg_catalog.count(*) into v_total
  from public.role_permissions as permission
  where permission.permission_key = 'branch_menu_item.availability.write';
  if v_total <> 1 then
    raise exception 'RA-2B-P1: expected exactly one availability permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_owner
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.availability.write'
    and role.role_key = 'owner'
    and role.status = 'active'
    and permission.permission_scope = 'restaurant';
  if v_owner <> 1 then
    raise exception 'RA-2B-P1: the availability permission is not owner/restaurant scoped';
  end if;

  -- RA-2A's permission row must survive this round untouched.
  select pg_catalog.count(*) into v_sold_out
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.sold_out.write'
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_sold_out <> 1 then
    raise exception 'RA-2B-P1: the frozen sold-out permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. The concurrency token.
--
-- Its own counter, not a reuse of sold_out_version: two independent operations must not invalidate
-- each other's pending requests. Existing rows start at a deterministic 0.
--
-- The database owns it. Whatever value a writer supplies is discarded, so it cannot be set, rolled
-- back or reset from outside; and because the trigger lives on the table rather than inside the RPC,
-- a future writer cannot change availability without advancing it. Writes that do not touch
-- availability carry it through unchanged — including every RA-2A sold-out write.
-- ---------------------------------------------------------------------------------------------
alter table public.branch_menu_items
  add column availability_version bigint not null default 0;

alter table public.branch_menu_items
  add constraint branch_menu_items_availability_version_non_negative
  check (availability_version >= 0);

create function restaurant_internal.branch_menu_item_availability_version_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.availability_version := 0;
    return new;
  end if;
  new.availability_version := old.availability_version
    + (case when new.availability is distinct from old.availability then 1 else 0 end);
  return new;
end;
$$;

create trigger branch_menu_items_availability_version_maintain
  before insert or update on public.branch_menu_items
  for each row execute function restaurant_internal.branch_menu_item_availability_version_maintain();

-- ---------------------------------------------------------------------------------------------
-- 3. The sealed availability writer.
--
-- NOLOGIN: it cannot authenticate. NOINHERIT: membership never leaks privilege implicitly.
-- NOBYPASSRLS: the policies below apply to it, including the restrictive ones. No SUPERUSER,
-- CREATEDB, CREATEROLE or REPLICATION is requested.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_branch_menu_item_availability_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_menu_item_availability_write_authority is
  'RA-2B-P1 sealed writer. Owns the availability preview and mutation RPCs. Column UPDATE on branch_menu_items.availability only; granted to no client role; cannot write sold_out or any version column.';

-- PostgreSQL 17 gives the creating role administration authority over a new role but no SET or
-- INHERIT path by default. This membership adds SET only for the ownership transfers below and is
-- revoked at the end of this migration. The platform's own creator row is left exactly as
-- RA-1C-R1 adjudicated it: member postgres, grantor supabase_admin, inherit false, set false.
grant restaurant_owner_branch_menu_item_availability_write_authority to postgres
  with admin false, inherit false, set true;

grant usage on schema restaurant_internal
  to restaurant_owner_branch_menu_item_availability_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. The audit relation.
--
-- Append-only by construction: no UPDATE and no DELETE policy exists for any role. Typed columns
-- only — no request blob, no caller-supplied actor, no free-text reason. Only applied transitions
-- are recorded; a refusal changes nothing and therefore has nothing to attest. RA-2A's sold-out
-- audit relation is not widened, extended or read by this round.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.branch_menu_item_availability_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  branch_menu_item_id text not null,
  previous_availability text not null,
  next_availability text not null,
  previous_availability_version bigint not null,
  next_availability_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_menu_item_availability_audit_log_pkey primary key (id),
  constraint branch_menu_item_availability_audit_log_previous_vocabulary_check
    check (previous_availability in ('available', 'limited', 'unavailable')),
  constraint branch_menu_item_availability_audit_log_next_vocabulary_check
    check (next_availability in ('available', 'limited', 'unavailable')),
  -- Only real transitions are auditable: a no-op can never be recorded as one.
  constraint branch_menu_item_availability_audit_log_transition_check
    check (previous_availability <> next_availability),
  constraint branch_menu_item_availability_audit_log_version_advance_check
    check (next_availability_version = previous_availability_version + 1),
  constraint branch_menu_item_availability_audit_log_version_non_negative_check
    check (previous_availability_version >= 0)
);

create index branch_menu_item_availability_audit_log_created_at_idx
  on restaurant_internal.branch_menu_item_availability_audit_log (created_at desc);

create index branch_menu_item_availability_audit_log_target_idx
  on restaurant_internal.branch_menu_item_availability_audit_log (branch_menu_item_id, created_at desc);

comment on table restaurant_internal.branch_menu_item_availability_audit_log is
  'RA-2B-P1 append-only availability transition audit. No UPDATE or DELETE policy exists for any role, and no client role holds any privilege on it.';

alter table restaurant_internal.branch_menu_item_availability_audit_log
  enable row level security;
alter table restaurant_internal.branch_menu_item_availability_audit_log
  force row level security;

create policy branch_menu_item_availability_audit_log_writer_select
  on restaurant_internal.branch_menu_item_availability_audit_log
  for select to restaurant_owner_branch_menu_item_availability_write_authority using (true);
create policy branch_menu_item_availability_audit_log_writer_insert
  on restaurant_internal.branch_menu_item_availability_audit_log
  for insert to restaurant_owner_branch_menu_item_availability_write_authority with check (true);

-- No UPDATE policy and no DELETE policy exist on this relation, for any role.

revoke all on table restaurant_internal.branch_menu_item_availability_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_menu_item_availability_audit_log
  to restaurant_owner_branch_menu_item_availability_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Minimum table privileges for the availability writer.
--
-- Column SELECT on exactly the authority chain the operation must walk, and column UPDATE on
-- exactly one business column. There is no table-level UPDATE anywhere below, so sold_out, both
-- version columns, price, branch-specific naming and status, and every identity column are
-- unwritable through this role even if a function were wrong.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users
  to restaurant_owner_branch_menu_item_availability_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships
  to restaurant_owner_branch_menu_item_availability_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles
  to restaurant_owner_branch_menu_item_availability_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions
  to restaurant_owner_branch_menu_item_availability_write_authority;
grant select (id, restaurant_id, branch_id, menu_item_id, availability, availability_version)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_availability_write_authority;
grant update (availability)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_availability_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Row level security: a permissive pair that grants, and a restrictive pair that narrows.
--
-- The permissive policies make rows visible and updatable to this role at all. The RESTRICTIVE
-- policies are AND'ed on top of every permissive policy that applies — including the PUBLIC one —
-- and carry the tenant predicate, so a row outside the verified caller's own owned restaurants is
-- neither readable nor writable by this role no matter what any permissive policy admits.
--
-- These policies name only this role, so RA-2A's sold-out writer and the membership context reader
-- are entirely unaffected by them.
-- ---------------------------------------------------------------------------------------------
create policy branch_menu_items_owner_availability_select
  on public.branch_menu_items
  for select to restaurant_owner_branch_menu_item_availability_write_authority
  using (true);

create policy branch_menu_items_owner_availability_update
  on public.branch_menu_items
  for update to restaurant_owner_branch_menu_item_availability_write_authority
  using (true)
  with check (availability in ('available', 'limited', 'unavailable'));

create policy branch_menu_items_owner_availability_tenant_select
  on public.branch_menu_items
  as restrictive
  for select to restaurant_owner_branch_menu_item_availability_write_authority
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
        and permission.permission_key = 'branch_menu_item.availability.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy branch_menu_items_owner_availability_tenant_update
  on public.branch_menu_items
  as restrictive
  for update to restaurant_owner_branch_menu_item_availability_write_authority
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
        and permission.permission_key = 'branch_menu_item.availability.write'
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
        and permission.permission_key = 'branch_menu_item.availability.write'
        and permission.permission_scope = 'restaurant'
    )
  );

-- PostgreSQL requires a prospective function owner to hold CREATE on the schema. The privilege
-- exists only while ownership is assigned and is revoked at the end of this migration.
grant create on schema public
  to restaurant_owner_branch_menu_item_availability_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. The canonical preview.
--
-- Read-only and STABLE, so PostgreSQL itself refuses any write inside it. The three parameters are
-- SELECTORS, never authority: the caller's own membership chain is joined, so a row under another
-- restaurant produces no join row — the same result as a row that does not exist. Both return
-- target_not_found, and cross-tenant probing therefore learns nothing.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_preview_branch_menu_item_availability_v1(
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
      and permission.permission_key = 'branch_menu_item.availability.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.branch_id, item.menu_item_id, item.availability, item.availability_version
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
   and permission.permission_key = 'branch_menu_item.availability.write'
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
    'availability', v_target.availability,
    'availabilityVersion', v_target.availability_version::text
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_menu_item_availability_v1(text, text, text) is
  'RA-2B-P1. Returns the current availability and concurrency token of one branch-menu offering to an active Restaurant Owner holding branch_menu_item.availability.write. Read-only and STABLE. Takes no actor argument.';

-- ---------------------------------------------------------------------------------------------
-- 8. The canonical mutation.
--
-- Bounded result vocabulary, and no raw PostgreSQL condition ever reaches a caller:
--   unauthenticated   no verified request subject
--   permission_denied verified, but not an active owner holding this exact permission anywhere
--   target_not_found  authorised, but no such row inside the caller's authorised scope
--   stale_state       expected availability or expected version does not match the locked row
--   no_change         the requested value already holds; nothing is written and nothing is audited
--   invalid_request   a malformed typed request that never reaches target resolution
--
-- The version crosses the boundary as a decimal string: bigint exceeds the range JSON consumers
-- represent exactly, and a silently rounded concurrency token is worse than no token.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_set_branch_menu_item_availability_v1(
  p_branch_menu_item_id text,
  p_expected_availability text,
  p_next_availability text,
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
  v_membership_id uuid;
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
    or p_expected_availability is null
    or p_next_availability is null
    or p_expected_version is null
    or p_expected_version < 0
    or p_expected_availability not in ('available', 'limited', 'unavailable')
    or p_next_availability not in ('available', 'limited', 'unavailable')
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
      and permission.permission_key = 'branch_menu_item.availability.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  -- The tenant predicate is joined, not delegated to row level security. The restrictive policies
  -- above are a second, independent gate; neither alone is the authority.
  select item.id, item.restaurant_id, item.branch_id, item.availability, item.availability_version,
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
   and permission.permission_key = 'branch_menu_item.availability.write'
   and permission.permission_scope = 'restaurant'
  where item.id = p_branch_menu_item_id
  for update of item;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.availability <> p_expected_availability
    or v_target.availability_version <> p_expected_version
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if p_next_availability = v_target.availability then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  v_membership_id := v_target.membership_id;

  update public.branch_menu_items as item
  set availability = p_next_availability
  where item.id = v_target.id
  returning item.availability_version into v_next_version;

  -- The audit row is written in the same transaction as the update, so a changed offering without
  -- its transition record is not a state this schema can reach: if the insert fails, the update
  -- rolls back with it.
  insert into restaurant_internal.branch_menu_item_availability_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id,
     previous_availability, next_availability, previous_availability_version,
     next_availability_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,
     v_target.availability, p_next_availability, v_target.availability_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'branchMenuItemId', v_target.id,
    'availability', p_next_availability,
    'availabilityVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_menu_item_availability_v1(text, text, text, bigint) is
  'RA-2B-P1. Sets the operational availability of one branch-menu offering for an active Restaurant Owner holding branch_menu_item.availability.write. Takes no actor argument: the actor can only be the verified request subject. Never writes sold_out or any version column.';

-- ---------------------------------------------------------------------------------------------
-- 9. Function privileges, settled BEFORE ownership moves.
--
-- The ordering is load-bearing. Once ownership has moved to a sealed role this migration cannot SET
-- ROLE to, a REVOKE by the previous owner silently changes nothing and leaves the PUBLIC EXECUTE
-- default in place. ALTER FUNCTION ... OWNER TO rewrites the grantor of each surviving ACL entry
-- rather than resetting the ACL, so the privileges set here survive the transfer intact.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_preview_branch_menu_item_availability_v1(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_branch_menu_item_availability_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.branch_menu_item_availability_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_preview_branch_menu_item_availability_v1(text, text, text)
  to authenticated;
grant execute on function public.restaurant_owner_set_branch_menu_item_availability_v1(text, text, text, bigint)
  to authenticated;

alter function public.restaurant_owner_preview_branch_menu_item_availability_v1(text, text, text)
  owner to restaurant_owner_branch_menu_item_availability_write_authority;
alter function public.restaurant_owner_set_branch_menu_item_availability_v1(text, text, text, bigint)
  owner to restaurant_owner_branch_menu_item_availability_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public
  from restaurant_owner_branch_menu_item_availability_write_authority;
revoke restaurant_owner_branch_menu_item_availability_write_authority
  from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------
-- 11. Fail closed on anything this migration did not positively achieve. Every assertion reads
-- pg_catalog only: the Restaurant authority tables run under FORCE row level security with
-- subject-scoped policies, so a migration principal counts zero rows in them for reasons that have
-- nothing to do with whether this round succeeded.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- The restrictive tenant policies must actually be restrictive: a permissive one would be
  -- OR'ed with the PUBLIC policy and would narrow nothing at all.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_availability_tenant_select',
                           'branch_menu_items_owner_availability_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2B-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;
  end if;

  -- Restrictive policies alone grant nothing; the permissive pair must exist too.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_availability_select',
                           'branch_menu_items_owner_availability_update')
    and policy.polpermissive = true;
  if v_count <> 2 then
    raise exception 'RA-2B-P1: the permissive availability policies are missing (found % of 2)', v_count;
  end if;

  -- FORCE row level security must be back on both seeded tables.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2B-P1: the seed suspension did not restore FORCE row level security';
  end if;

  -- The two writers must remain independent in both directions.
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'sold_out', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'sold_out_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'availability_version', 'UPDATE') then
    raise exception 'RA-2B-P1: the availability writer can write a column it must never write';
  end if;
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority',
       'public.branch_menu_items', 'availability', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority',
       'public.branch_menu_items', 'availability_version', 'UPDATE') then
    raise exception 'RA-2B-P1: the frozen sold-out writer was widened to availability';
  end if;
  if pg_catalog.has_table_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2B-P1: the availability writer holds broad table UPDATE';
  end if;

  -- No client or runtime role gains anything.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_availability_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2B-P1: a client role holds membership of the availability writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'SELECT') then
    raise exception 'RA-2B-P1: a client role gained direct table access to branch_menu_items';
  end if;
end
$$;

commit;
