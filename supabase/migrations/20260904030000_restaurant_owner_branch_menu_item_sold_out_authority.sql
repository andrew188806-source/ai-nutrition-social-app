-- RA-2A-P1: the governed Restaurant Owner sold-out authority.
--
-- WHAT THIS IS. The first Restaurant Owner WRITE capability in this database. It grants exactly one
-- business mutation — marking one branch-menu offering sold out, or available again — and nothing
-- else. It is deliberately not "menu editing": price, availability, branch-specific naming, status,
-- nutrition, allergen and ingredient data all remain unwritable through this authority, enforced by
-- column-level UPDATE privilege rather than by convention.
--
-- WHAT AUTHORISES A CALL. Only the verified request subject. The function takes no actor, owner,
-- membership, role or permission parameter, so a caller can neither name somebody else nor assert an
-- authority they do not hold. A target id identifies a row; it never establishes authority.
--
-- WHY TENANT PROOF IS DOUBLED. The row-level policies below repeat the ownership chain that the
-- function also checks. That redundancy is deliberate: if the function's tenant logic were ever
-- wrong, row level security would still refuse to show or update another restaurant's row, so a
-- cross-tenant write needs two independent failures rather than one. It also makes "target does not
-- exist" and "target belongs to another restaurant" literally the same query result, so cross-tenant
-- probing cannot reveal that a row exists.
--
-- WHAT IT DELIBERATELY DOES NOT DO. No durable request receipt system (RA-1C's idempotency receipts
-- are a different architecture and stay separate), no Platform Admin capability, no read surface over
-- the private audit relation, no publication or visibility change of any restaurant or branch.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The permission vocabulary.
--
-- One new key, on the existing canonical Owner role only. Manager and staff are untouched, and the
-- CHECK below is widened by exactly one value so no other write capability can be expressed until a
-- later round widens it again deliberately.
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
    'branch_menu_item.sold_out.write'
  ));

-- Both tables carry FORCE row level security, and FORCE applies to the owner too. role_permissions
-- has no INSERT policy for any role, and restaurant_roles is readable only through a policy scoped
-- to the verified request subject — which a migration does not have, so the source SELECT returns
-- nothing. Their original rows were seeded before RLS was enabled. The seed below is therefore
-- bracketed by an explicit, same-transaction suspension rather than relying on the runner happening
-- to hold BYPASSRLS: that attribute is a platform detail of one environment, and a migration that
-- silently depends on it inserts nothing wherever it is absent. Both tables are restored below, and
-- the closing assertion refuses to commit if the row did not land.
alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch_menu_item.sold_out.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

-- Verified here, inside the same suspension, because these two tables are unreadable to an
-- unauthenticated principal once FORCE is restored: a check placed after the restore would count
-- zero rows for a reason that has nothing to do with whether the seed worked.
do $$
declare
  v_total integer;
  v_owner integer;
begin
  select pg_catalog.count(*) into v_total
  from public.role_permissions as permission
  where permission.permission_key = 'branch_menu_item.sold_out.write';
  if v_total <> 1 then
    raise exception 'RA-2A-P1: expected exactly one sold-out permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_owner
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.sold_out.write'
    and role.role_key = 'owner'
    and role.status = 'active'
    and permission.permission_scope = 'restaurant';
  if v_owner <> 1 then
    raise exception 'RA-2A-P1: the sold-out permission is not owner/restaurant scoped';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. The concurrency token.
--
-- A dedicated counter, not a timestamp: two writes inside the same clock tick must still be
-- distinguishable, and a stale request must stay stale after the boolean has returned to its
-- original value (the ABA case). Existing rows start at a deterministic 0.
-- ---------------------------------------------------------------------------------------------
alter table public.branch_menu_items
  add column sold_out_version bigint not null default 0;

alter table public.branch_menu_items
  add constraint branch_menu_items_sold_out_version_non_negative
  check (sold_out_version >= 0);

create schema restaurant_internal;

comment on schema restaurant_internal is
  'Server-only Restaurant write authority. Deliberately absent from the PostgREST exposed-schema list, so nothing in here is reachable through the Data API by any role. Never add this schema to the Data API configuration.';

-- The database owns this counter, not the caller. Whatever value a writer supplies is discarded, so
-- the token cannot be set, rolled back or reset from outside; and because the trigger is on the
-- table rather than inside the RPC, a future writer cannot change sold_out without advancing it.
-- Writes that do not touch sold_out carry the counter through unchanged.
create function restaurant_internal.branch_menu_item_sold_out_version_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.sold_out_version := 0;
    return new;
  end if;
  new.sold_out_version := old.sold_out_version
    + (case when new.sold_out is distinct from old.sold_out then 1 else 0 end);
  return new;
end;
$$;

create trigger branch_menu_items_sold_out_version_maintain
  before insert or update on public.branch_menu_items
  for each row execute function restaurant_internal.branch_menu_item_sold_out_version_maintain();

-- ---------------------------------------------------------------------------------------------
-- 3. The sealed writer.
--
-- NOLOGIN: it cannot authenticate. NOINHERIT: membership never leaks privilege implicitly.
-- NOBYPASSRLS: the policies below apply to it. No SUPERUSER, CREATEDB, CREATEROLE or REPLICATION is
-- requested. It is a new role rather than a reuse of restaurant_membership_context_reader, which is
-- a read authority and must not acquire a write path.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_branch_menu_item_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_menu_item_write_authority is
  'RA-2A-P1 sealed writer. Owns the single sold-out mutation RPC. Column UPDATE on branch_menu_items.sold_out only; granted to no client role.';

-- PostgreSQL 17 gives the creating role administration authority over a new role but no SET or
-- INHERIT path by default. This membership adds SET only for the ownership transfer below and is
-- revoked at the end of this migration. The platform's own creator row is left exactly as
-- RA-1C-R1 adjudicated it: member postgres, grantor supabase_admin, inherit false, set false.
grant restaurant_owner_branch_menu_item_write_authority to postgres
  with admin false, inherit false, set true;

grant usage on schema restaurant_internal to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. The audit relation.
--
-- Append-only by construction: no UPDATE and no DELETE policy exists for any role, so an applied
-- transition can be recorded but never rewritten or erased. Typed columns only — no request blob, no
-- caller-supplied actor, no free-text reason. Only applied transitions are recorded; a refusal
-- changes nothing and therefore has nothing to attest.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.branch_menu_item_sold_out_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  branch_menu_item_id text not null,
  previous_sold_out boolean not null,
  next_sold_out boolean not null,
  previous_sold_out_version bigint not null,
  next_sold_out_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_menu_item_sold_out_audit_log_pkey primary key (id),
  -- Only real transitions are auditable: a no-op can never be recorded as one.
  constraint branch_menu_item_sold_out_audit_log_transition_check
    check (previous_sold_out <> next_sold_out),
  constraint branch_menu_item_sold_out_audit_log_version_advance_check
    check (next_sold_out_version = previous_sold_out_version + 1),
  constraint branch_menu_item_sold_out_audit_log_version_non_negative_check
    check (previous_sold_out_version >= 0)
);

create index branch_menu_item_sold_out_audit_log_created_at_idx
  on restaurant_internal.branch_menu_item_sold_out_audit_log (created_at desc);

create index branch_menu_item_sold_out_audit_log_target_idx
  on restaurant_internal.branch_menu_item_sold_out_audit_log (branch_menu_item_id, created_at desc);

comment on table restaurant_internal.branch_menu_item_sold_out_audit_log is
  'RA-2A-P1 append-only sold-out transition audit. No UPDATE or DELETE policy exists for any role, and no client role holds any privilege on it.';

alter table restaurant_internal.branch_menu_item_sold_out_audit_log enable row level security;
alter table restaurant_internal.branch_menu_item_sold_out_audit_log force row level security;

create policy branch_menu_item_sold_out_audit_log_writer_select
  on restaurant_internal.branch_menu_item_sold_out_audit_log
  for select to restaurant_owner_branch_menu_item_write_authority using (true);
create policy branch_menu_item_sold_out_audit_log_writer_insert
  on restaurant_internal.branch_menu_item_sold_out_audit_log
  for insert to restaurant_owner_branch_menu_item_write_authority with check (true);

-- No UPDATE policy and no DELETE policy exist on this relation, for any role.

revoke all on schema restaurant_internal from public;
revoke all on table restaurant_internal.branch_menu_item_sold_out_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_menu_item_sold_out_audit_log
  to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Minimum table privileges for the sealed writer.
--
-- Column SELECT on exactly the authority chain the mutation must walk, and column UPDATE on exactly
-- one business column. There is no table-level UPDATE anywhere below, so price, availability,
-- branch-specific naming, status and every identity column are unwritable through this role even if
-- the function were wrong. sold_out_version is deliberately NOT granted for UPDATE: the trigger
-- maintains it, so no writer — this one included — can set it directly.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users to restaurant_owner_branch_menu_item_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships to restaurant_owner_branch_menu_item_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles to restaurant_owner_branch_menu_item_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions to restaurant_owner_branch_menu_item_write_authority;
grant select (id, restaurant_id, branch_id, menu_item_id, sold_out, sold_out_version)
  on table public.branch_menu_items to restaurant_owner_branch_menu_item_write_authority;
grant update (sold_out)
  on table public.branch_menu_items to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Row level security on the target, scoped to the verified caller's own ownership.
--
-- These policies repeat the ownership chain the function checks. A row is visible to the sealed
-- writer, and updatable by it, only while the VERIFIED CALLER is an enabled user holding an active
-- owner membership of that row's restaurant with this exact permission. The WITH CHECK clause is the
-- same expression, so a row can never be moved out of the caller's tenant by the update itself.
-- ---------------------------------------------------------------------------------------------
create policy branch_menu_items_owner_sold_out_select
  on public.branch_menu_items
  for select to restaurant_owner_branch_menu_item_write_authority
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
        and permission.permission_key = 'branch_menu_item.sold_out.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy branch_menu_items_owner_sold_out_update
  on public.branch_menu_items
  for update to restaurant_owner_branch_menu_item_write_authority
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
        and permission.permission_key = 'branch_menu_item.sold_out.write'
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
        and permission.permission_key = 'branch_menu_item.sold_out.write'
        and permission.permission_scope = 'restaurant'
    )
  );

-- PostgreSQL requires a prospective function owner to hold CREATE on the schema. The privilege
-- exists only while ownership is assigned and is revoked at the end of this migration.
grant create on schema public to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. The single client-callable mutation.
--
-- Bounded result vocabulary, and no raw PostgreSQL condition ever reaches a caller:
--   unauthenticated   no verified request subject
--   permission_denied verified, but not an active owner holding this exact permission anywhere
--   target_not_found  authorised, but no such row INSIDE the caller's authorised scope. A row that
--                     exists under another restaurant is indistinguishable from one that does not
--                     exist at all, because row level security removes both before the function can
--                     see either. Cross-tenant probing therefore learns nothing.
--   stale_state       expected sold_out or expected version does not match the locked row
--   no_change         the requested state already holds; nothing is written and nothing is audited
--   invalid_request   a malformed typed request that never reaches target resolution
--
-- The version crosses the boundary as a decimal string in the result: bigint exceeds the range that
-- JSON consumers represent exactly, and this contract must not silently round a concurrency token.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_set_branch_menu_item_sold_out_v1(
  p_branch_menu_item_id text,
  p_expected_sold_out boolean,
  p_next_sold_out boolean,
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
    or p_expected_sold_out is null
    or p_next_sold_out is null
    or p_expected_version is null
    or p_expected_version < 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  -- Authorised scope first: being an active owner holding this exact permission somewhere is what
  -- separates "you may not do this at all" from "that row is not yours".
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
      and permission.permission_key = 'branch_menu_item.sold_out.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  -- Row level security has already narrowed this table to rows the verified caller owns.
  select item.id, item.restaurant_id, item.branch_id, item.sold_out, item.sold_out_version
  into v_target
  from public.branch_menu_items as item
  where item.id = p_branch_menu_item_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.sold_out <> p_expected_sold_out
    or v_target.sold_out_version <> p_expected_version
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if p_next_sold_out = v_target.sold_out then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  select membership.id into v_membership_id
  from public.restaurant_users as caller
  join public.restaurant_memberships as membership
    on membership.restaurant_user_id = caller.id
  join public.restaurant_roles as role
    on role.id = membership.role_id
  where caller.auth_user_id = v_actor
    and caller.login_status = 'enabled'
    and membership.status = 'active'
    and membership.restaurant_id = v_target.restaurant_id
    and role.status = 'active'
    and role.role_key = 'owner';

  if v_membership_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  update public.branch_menu_items as item
  set sold_out = p_next_sold_out
  where item.id = v_target.id
  returning item.sold_out_version into v_next_version;

  -- The audit row is written in the same transaction as the update, so a changed offering without
  -- its transition record is not a state this schema can reach: if the insert fails, the update
  -- rolls back with it.
  insert into restaurant_internal.branch_menu_item_sold_out_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id,
     previous_sold_out, next_sold_out, previous_sold_out_version, next_sold_out_version)
  values (v_actor, v_membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,
     v_target.sold_out, p_next_sold_out, v_target.sold_out_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'branchMenuItemId', v_target.id,
    'soldOut', p_next_sold_out,
    'soldOutVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint) is
  'RA-2A-P1. Marks one branch-menu offering sold out or available again for an active Restaurant Owner holding branch_menu_item.sold_out.write. Takes no actor argument: the actor can only be the verified request subject.';

-- ---------------------------------------------------------------------------------------------
-- 8. Function privileges, settled BEFORE ownership moves.
--
-- The ordering is load-bearing. REVOKE and GRANT must be issued while the principal running this
-- migration still owns the function: once ownership has moved to a sealed role this migration
-- cannot SET ROLE to, a REVOKE by the previous owner silently changes nothing and leaves the PUBLIC
-- EXECUTE default in place. ALTER FUNCTION ... OWNER TO rewrites the grantor of each surviving ACL
-- entry rather than resetting the ACL, so the privileges set here survive the transfer intact.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.branch_menu_item_sold_out_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

-- A signed-in caller is the entire client-executable surface. anon, authenticator and service_role
-- receive nothing: a signed-out caller cannot reach it at all, and the function performs complete
-- internal authorisation, so direct PostgREST invocation is exactly as safe as a server call.
grant execute on function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)
  to authenticated;

alter function public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)
  owner to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 9. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public from restaurant_owner_branch_menu_item_write_authority;
revoke restaurant_owner_branch_menu_item_write_authority from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------
-- 10. Fail closed on anything this migration did not positively achieve.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2A-P1: the seed suspension did not restore FORCE row level security';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2A-P1: a client role holds membership of the sealed writer';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2A-P1: authenticated holds table UPDATE on branch_menu_items';
  end if;
end
$$;

commit;
