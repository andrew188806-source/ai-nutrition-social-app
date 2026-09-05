-- RA-2C-P1: the governed Restaurant Owner branch-menu price authority.
--
-- WHAT THIS IS. A third, INDEPENDENT Restaurant Owner write on public.branch_menu_items: the listed
-- menu price of one offering at one branch, in whole New Taiwan Dollars. It shares nothing writable
-- with RA-2A's sold-out authority or RA-2B's availability authority.
--
-- WHAT price MEANS HERE. The restaurant's listed menu price for that branch-menu item. It is not a
-- checkout total: service charges, optional add-ons, customisation surcharges and delivery fees are
-- outside this field's guarantee, and this migration adds no calculation for any of them. Pricing
-- authority is per branch-menu item, so two branches may legitimately price one menu item
-- differently. It has nothing to do with any TastKind subscription, plan or add-on price.
--
-- THE CANONICAL CONTRACT. A new governed price is a whole TWD amount from 1 through 999999
-- inclusive. Zero is not a canonical price: it does not mean free, unknown, unpublished or market
-- price, and a later product decision that needs any of those must give them their own semantics
-- rather than overload this column. Fractional amounts are refused rather than rounded.
--
-- WHY THERE IS NO TABLE CHECK CONSTRAINT. Development already holds a legacy row at price 0.00 that
-- predates this contract. A conventional CHECK (price >= 1 AND price = trunc(price)) would make
-- EVERY future write to that row fail, including RA-2A's sold-out mutation and RA-2B's availability
-- mutation, which never touch price at all. This round governs price CHANGES, not the shape of every
-- existing row. DB-level canonical enforcement therefore lives in a trigger that fires only when
-- OLD.price IS DISTINCT FROM NEW.price, so an unrelated write that preserves a legacy price stays
-- legal. That legacy row is left exactly as it is: not normalised, not reinterpreted, not deleted.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The permission vocabulary.
--
-- One new key, on the existing canonical Owner role only. RA-2A's and RA-2B's permission rows are
-- preserved untouched, and the CHECK widens by exactly one value.
--
-- Both tables carry FORCE row level security, which applies to the owner too: role_permissions has
-- no INSERT policy for any role, and restaurant_roles is readable only through a policy scoped to
-- the verified request subject, which a migration does not have. The seed is therefore bracketed by
-- an explicit same-transaction suspension and verified INSIDE it — relying on the runner happening
-- to hold BYPASSRLS would make this migration insert nothing wherever that attribute is absent.
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
    'branch_menu_item.price.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch_menu_item.price.write', 'restaurant'
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
  where permission.permission_key = 'branch_menu_item.price.write';
  if v_total <> 1 then
    raise exception 'RA-2C-P1: expected exactly one price permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_owner
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch_menu_item.price.write'
    and role.role_key = 'owner'
    and role.status = 'active'
    and permission.permission_scope = 'restaurant';
  if v_owner <> 1 then
    raise exception 'RA-2C-P1: the price permission is not owner/restaurant scoped';
  end if;

  -- RA-2A's and RA-2B's permission rows must survive this round untouched.
  select pg_catalog.count(*) into v_predecessors
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key in
      ('branch_menu_item.sold_out.write', 'branch_menu_item.availability.write')
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_predecessors <> 2 then
    raise exception 'RA-2C-P1: a frozen predecessor permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. The concurrency token and the change-scoped canonical guard.
--
-- Its own counter, not a reuse of sold_out_version or availability_version: three independent
-- operations must not invalidate each other's pending requests. Existing rows start at 0.
--
-- The same trigger carries the DB-level canonical guard, and both halves are deliberately scoped to
-- a real price change. A write that leaves price alone — every RA-2A and RA-2B mutation — neither
-- advances the counter nor is judged against the canonical range, so legacy rows stay writable.
-- INSERT is deliberately not judged: this round governs price changes, not row creation.
-- ---------------------------------------------------------------------------------------------
alter table public.branch_menu_items
  add column price_version bigint not null default 0;

alter table public.branch_menu_items
  add constraint branch_menu_items_price_version_non_negative
  check (price_version >= 0);

create function restaurant_internal.branch_menu_item_price_version_maintain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.price_version := 0;
    return new;
  end if;

  if new.price is distinct from old.price then
    -- Whole New Taiwan Dollars, 1 through 999999. Exact numeric comparison throughout: no float,
    -- no rounding, no truncation. Unreachable through the governed RPC, which refuses first.
    if new.price is null
      or new.price < 1::pg_catalog.numeric
      or new.price > 999999::pg_catalog.numeric
      or new.price <> pg_catalog.trunc(new.price) then
      raise exception 'RA-2C-P1: a branch-menu price change must be whole TWD between 1 and 999999';
    end if;
    new.price_version := old.price_version + 1;
  else
    new.price_version := old.price_version;
  end if;
  return new;
end;
$$;

create trigger branch_menu_items_price_version_maintain
  before insert or update on public.branch_menu_items
  for each row execute function restaurant_internal.branch_menu_item_price_version_maintain();

-- ---------------------------------------------------------------------------------------------
-- 3. The sealed price writer.
--
-- A third sealed role, not a widening of either predecessor. Different governed business authority
-- means a different least-privilege writer: one role holding price, sold_out and availability would
-- mean a defect in any one operation could write the others' columns.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_branch_menu_item_price_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_menu_item_price_write_authority is
  'RA-2C-P1 sealed writer. Owns the branch-menu price preview and mutation RPCs. Column UPDATE on branch_menu_items.price only; granted to no client role; cannot write sold_out, availability or any version column.';

-- PostgreSQL 17 gives the creating role administration authority over a new role but no SET or
-- INHERIT path by default. This membership adds SET only for the ownership transfers below and is
-- revoked at the end of this migration. The platform's own creator row is left exactly as
-- RA-1C-R1 adjudicated it: member postgres, grantor supabase_admin, inherit false, set false.
grant restaurant_owner_branch_menu_item_price_write_authority to postgres
  with admin false, inherit false, set true;

grant usage on schema restaurant_internal
  to restaurant_owner_branch_menu_item_price_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. The audit relation.
--
-- Append-only by construction: no UPDATE and no DELETE policy exists for any role. Typed columns
-- only — no JSON payload, no free text, no caller-supplied actor. Only applied mutations are
-- recorded. RA-2A's and RA-2B's audit relations are neither widened nor written by this round.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.branch_menu_item_price_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  branch_menu_item_id text not null,
  menu_item_id text not null,
  previous_price numeric(10, 2) not null,
  next_price numeric(10, 2) not null,
  previous_price_version bigint not null,
  next_price_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_menu_item_price_audit_log_pkey primary key (id),
  -- Only real changes are auditable: a no-op can never be recorded as one.
  constraint branch_menu_item_price_audit_log_transition_check
    check (previous_price <> next_price),
  -- The recorded destination is always canonical, even when the origin was a legacy value.
  constraint branch_menu_item_price_audit_log_next_canonical_check
    check (next_price >= 1 and next_price <= 999999 and next_price = pg_catalog.trunc(next_price)),
  constraint branch_menu_item_price_audit_log_previous_non_negative_check
    check (previous_price >= 0),
  constraint branch_menu_item_price_audit_log_version_advance_check
    check (next_price_version = previous_price_version + 1),
  constraint branch_menu_item_price_audit_log_version_non_negative_check
    check (previous_price_version >= 0)
);

create index branch_menu_item_price_audit_log_created_at_idx
  on restaurant_internal.branch_menu_item_price_audit_log (created_at desc);

create index branch_menu_item_price_audit_log_target_idx
  on restaurant_internal.branch_menu_item_price_audit_log (branch_menu_item_id, created_at desc);

comment on table restaurant_internal.branch_menu_item_price_audit_log is
  'RA-2C-P1 append-only branch-menu price audit. No UPDATE or DELETE policy exists for any role, and no client role holds any privilege on it.';

alter table restaurant_internal.branch_menu_item_price_audit_log
  enable row level security;
alter table restaurant_internal.branch_menu_item_price_audit_log
  force row level security;

create policy branch_menu_item_price_audit_log_writer_select
  on restaurant_internal.branch_menu_item_price_audit_log
  for select to restaurant_owner_branch_menu_item_price_write_authority using (true);
create policy branch_menu_item_price_audit_log_writer_insert
  on restaurant_internal.branch_menu_item_price_audit_log
  for insert to restaurant_owner_branch_menu_item_price_write_authority with check (true);

-- No UPDATE policy and no DELETE policy exist on this relation, for any role.

revoke all on table restaurant_internal.branch_menu_item_price_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_menu_item_price_audit_log
  to restaurant_owner_branch_menu_item_price_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Minimum table privileges for the price writer.
--
-- Column SELECT on exactly the authority chain the operation must walk, and column UPDATE on
-- exactly one business column. There is no table-level UPDATE anywhere below, so sold_out,
-- availability, all three version columns, branch-specific naming and status, and every identity
-- column are unwritable through this role even if a function were wrong.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users
  to restaurant_owner_branch_menu_item_price_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships
  to restaurant_owner_branch_menu_item_price_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles
  to restaurant_owner_branch_menu_item_price_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions
  to restaurant_owner_branch_menu_item_price_write_authority;
grant select (id, restaurant_id, branch_id, menu_item_id, price, price_version)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_price_write_authority;
grant update (price)
  on table public.branch_menu_items
  to restaurant_owner_branch_menu_item_price_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Row level security: a permissive pair that grants, and a restrictive pair that narrows.
--
-- public.branch_menu_items carries a PERMISSIVE policy granted to PUBLIC, and PostgreSQL ORs
-- permissive policies together — so a permissive owner-scoped policy narrows NOTHING on the read
-- path. RA-2A-P1-R1 proved exactly that against a real cluster. RESTRICTIVE policies are AND'ed with
-- the permissive result and carry the tenant predicate; restrictive policies alone would grant
-- nothing, so both halves are required and both are asserted before this migration commits.
-- ---------------------------------------------------------------------------------------------
create policy branch_menu_items_owner_price_select
  on public.branch_menu_items
  for select to restaurant_owner_branch_menu_item_price_write_authority
  using (true);

create policy branch_menu_items_owner_price_update
  on public.branch_menu_items
  for update to restaurant_owner_branch_menu_item_price_write_authority
  using (true)
  with check (price >= 1 and price <= 999999 and price = pg_catalog.trunc(price));

create policy branch_menu_items_owner_price_tenant_select
  on public.branch_menu_items
  as restrictive
  for select to restaurant_owner_branch_menu_item_price_write_authority
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
        and permission.permission_key = 'branch_menu_item.price.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy branch_menu_items_owner_price_tenant_update
  on public.branch_menu_items
  as restrictive
  for update to restaurant_owner_branch_menu_item_price_write_authority
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
        and permission.permission_key = 'branch_menu_item.price.write'
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
        and permission.permission_key = 'branch_menu_item.price.write'
        and permission.permission_scope = 'restaurant'
    )
  );

-- PostgreSQL requires a prospective function owner to hold CREATE on the schema. The privilege
-- exists only while ownership is assigned and is revoked at the end of this migration.
grant create on schema public
  to restaurant_owner_branch_menu_item_price_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. The canonical preview.
--
-- Read-only and STABLE, so PostgreSQL itself refuses any write inside it. The three parameters are
-- SELECTORS, never authority: the caller's own membership chain is joined, so a row under another
-- restaurant produces no join row — the same result as a row that does not exist. Both return
-- target_not_found, and cross-tenant probing therefore learns nothing.
--
-- price is projected as the exact stored decimal text, so a legacy 0.00 is reported as "0.00" rather
-- than normalised, hidden or reinterpreted.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_preview_branch_menu_item_price_v1(
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
      and permission.permission_key = 'branch_menu_item.price.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.branch_id, item.menu_item_id, item.price, item.price_version
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
   and permission.permission_key = 'branch_menu_item.price.write'
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
    'price', v_target.price::text,
    'priceVersion', v_target.price_version::text
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text) is
  'RA-2C-P1. Returns the current listed price and concurrency token of one branch-menu offering to an active Restaurant Owner holding branch_menu_item.price.write. Read-only and STABLE. Takes no actor argument.';

-- ---------------------------------------------------------------------------------------------
-- 8. The canonical mutation.
--
-- Prices cross the boundary as exact decimal TEXT and are compared with PostgreSQL numeric
-- semantics. Nothing is ever cast to float, double precision or real, and no input is rounded or
-- truncated into validity.
--
--   p_expected_price  the exact stored value the caller believes it is replacing, e.g. "0.00" or
--                     "150.00". A legacy zero may legitimately appear here.
--   p_next_price      the canonical destination, whole TWD 1..999999, e.g. "150".
--
-- Canonical validation of the destination happens BEFORE the no-change comparison, so a caller
-- sitting on a legacy 0.00 who submits "0" receives invalid_request rather than no_change: zero is
-- never a canonical price, even when it is the current one.
--
-- Bounded result vocabulary, and no raw PostgreSQL condition ever reaches a caller:
--   unauthenticated / permission_denied / target_not_found / stale_state / no_change / invalid_request
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_set_branch_menu_item_price_v1(
  p_branch_menu_item_id text,
  p_expected_price text,
  p_next_price text,
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
  v_expected numeric(10, 2);
  v_next numeric(10, 2);
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

  -- Lexical validation first. The expected value accepts any exact decimal the column can hold, so
  -- a legacy 0.00 can be named; the destination accepts only canonical whole TWD 1..999999. Both
  -- forms are anchored, so scientific notation, signs, whitespace and NaN-like input never parse.
  if p_branch_menu_item_id is null
    or pg_catalog.length(p_branch_menu_item_id) = 0
    or p_expected_price is null
    or p_next_price is null
    or p_expected_version is null
    or p_expected_version < 0
    or p_expected_price !~ '^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$'
    or p_next_price !~ '^[1-9][0-9]{0,5}$'
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_expected := p_expected_price::pg_catalog.numeric;
  v_next := p_next_price::pg_catalog.numeric;

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
      and permission.permission_key = 'branch_menu_item.price.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  -- The tenant predicate is joined, not delegated to row level security. The restrictive policies
  -- above are a second, independent gate; neither alone is the authority.
  select item.id, item.restaurant_id, item.branch_id, item.menu_item_id, item.price,
         item.price_version, membership.id as membership_id
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
   and permission.permission_key = 'branch_menu_item.price.write'
   and permission.permission_scope = 'restaurant'
  where item.id = p_branch_menu_item_id
  for update of item;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  -- Exact numeric comparison on both concurrency facts.
  if v_target.price <> v_expected
    or v_target.price_version <> p_expected_version
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if v_next = v_target.price then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.branch_menu_items as item
  set price = v_next
  where item.id = v_target.id
  returning item.price_version into v_next_version;

  -- The audit row is written in the same transaction as the update, so a changed price without its
  -- record is not a state this schema can reach: if the insert fails, the update rolls back with it.
  insert into restaurant_internal.branch_menu_item_price_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id, branch_menu_item_id, menu_item_id,
     previous_price, next_price, previous_price_version, next_price_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.branch_id, v_target.id,
     v_target.menu_item_id, v_target.price, v_next, v_target.price_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'branchMenuItemId', v_target.id,
    'price', v_next::text,
    'priceVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint) is
  'RA-2C-P1. Sets the listed menu price of one branch-menu offering, in whole TWD 1..999999, for an active Restaurant Owner holding branch_menu_item.price.write. Takes no actor argument. Never writes sold_out, availability or any version column.';

-- ---------------------------------------------------------------------------------------------
-- 9. Function privileges, settled BEFORE ownership moves.
--
-- The ordering is load-bearing. Once ownership has moved to a sealed role this migration cannot SET
-- ROLE to, a REVOKE by the previous owner silently changes nothing and leaves the PUBLIC EXECUTE
-- default in place. ALTER FUNCTION ... OWNER TO rewrites the grantor of each surviving ACL entry
-- rather than resetting the ACL, so the privileges set here survive the transfer intact.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function restaurant_internal.branch_menu_item_price_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)
  to authenticated;
grant execute on function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)
  to authenticated;

alter function public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)
  owner to restaurant_owner_branch_menu_item_price_write_authority;
alter function public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)
  owner to restaurant_owner_branch_menu_item_price_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public
  from restaurant_owner_branch_menu_item_price_write_authority;
revoke restaurant_owner_branch_menu_item_price_write_authority
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
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_price_tenant_select',
                           'branch_menu_items_owner_price_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2C-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and policy.polname in ('branch_menu_items_owner_price_select',
                           'branch_menu_items_owner_price_update')
    and policy.polpermissive = true;
  if v_count <> 2 then
    raise exception 'RA-2C-P1: the permissive price policies are missing (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2C-P1: the seed suspension did not restore FORCE row level security';
  end if;

  -- The three writers must remain independent in every direction.
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'sold_out', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'sold_out_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'availability', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'availability_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'price_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'branch_specific_status', 'UPDATE') then
    raise exception 'RA-2C-P1: the price writer can write a column it must never write';
  end if;
  if pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority',
       'public.branch_menu_items', 'price', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'price', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority',
       'public.branch_menu_items', 'price_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_availability_write_authority',
       'public.branch_menu_items', 'price_version', 'UPDATE') then
    raise exception 'RA-2C-P1: a frozen predecessor writer was widened to price';
  end if;
  if pg_catalog.has_table_privilege('restaurant_owner_branch_menu_item_price_write_authority',
       'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2C-P1: the price writer holds broad table UPDATE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_price_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2C-P1: a client role holds membership of the price writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE')
    or pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'SELECT') then
    raise exception 'RA-2C-P1: a client role gained direct table access to branch_menu_items';
  end if;

  -- No table CHECK may constrain price itself: that would break unrelated writes on legacy rows.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and constraint_row.contype = 'c'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%price%'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) not like '%price_version%';
  if v_count <> 0 then
    raise exception 'RA-2C-P1: a table CHECK on price would break legacy rows (found %)', v_count;
  end if;
end
$$;

commit;
