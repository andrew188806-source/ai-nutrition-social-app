-- RA-2E-P1: the governed Restaurant Owner branch display-name authority.
--
-- WHAT THIS IS. A NEW, INDEPENDENT Restaurant Owner write authority on public.restaurant_branches:
-- the public-facing display name of one existing branch (public.restaurant_branches.name). This is
-- presentation authority ONLY. It has nothing to do with restaurants.name, restaurants.legal_name,
-- branch address/district/GEO data, branch status, or any menu-item identity -- each of those is a
-- separate governed authority (RA-1C for branch status; the RA-2A/B/C/D family for branch-menu
-- items) or has no governed authority yet, and this round widens none of them.
--
-- A successful rename takes effect immediately: there is no review/moderation workflow in RA-2E.
-- Where every other publication predicate already permits a branch to be visible, a rename may
-- immediately change what the public sees. That is accepted product behaviour, proven below -- and
-- proven NOT to let a rename create eligibility a rename has no business creating.
--
-- STRUCTURAL INDEPENDENCE, BY CONSTRUCTION. public.restaurant_branches already carries two
-- column-scoped triggers: `restaurant_branches_geocode_invalidate` fires on
-- "BEFORE INSERT OR UPDATE OF address, district, restaurant_id", and
-- `restaurant_branches_status_version_trigger` fires on "BEFORE UPDATE OF status ... WHEN
-- (old.status IS DISTINCT FROM new.status)". PostgreSQL's "UPDATE OF <columns>" trigger firing rule
-- means a statement that never assigns those columns in its SET list never fires those triggers, no
-- matter what else the statement touches. This round's mutation RPC issues
-- `update restaurant_branches set name = ... where id = ...` -- it never assigns status, address,
-- district or restaurant_id -- so GEO invalidation and the status-version bump are structurally
-- unreachable from this authority, not merely avoided by convention. This round's own trigger is
-- built the identical way (`BEFORE UPDATE OF name`), which is why the reverse also holds: RA-1C's
-- status writer and the GEO writers, which never assign `name`, can never fire this round's version
-- trigger either. Both directions are additionally proven behaviourally on a real cluster below.

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
    'branch.profile.display_name.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'branch.profile.display_name.write', 'restaurant'
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
  where permission.permission_key = 'branch.profile.display_name.write';
  if v_total <> 1 then
    raise exception 'RA-2E-P1: expected exactly one display-name permission row, found %', v_total;
  end if;

  select pg_catalog.count(*) into v_owner
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'branch.profile.display_name.write'
    and role.role_key = 'owner'
    and role.status = 'active'
    and permission.permission_scope = 'restaurant';
  if v_owner <> 1 then
    raise exception 'RA-2E-P1: the display-name permission is not owner/restaurant scoped';
  end if;

  select pg_catalog.count(*) into v_predecessors
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key in
      ('branch_menu_item.sold_out.write', 'branch_menu_item.availability.write',
       'branch_menu_item.price.write', 'branch_menu_item.visibility.write')
    and role.role_key = 'owner'
    and permission.permission_scope = 'restaurant';
  if v_predecessors <> 4 then
    raise exception 'RA-2E-P1: a frozen predecessor permission row was disturbed';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

-- ---------------------------------------------------------------------------------------------
-- 2. The concurrency token, and the change-scoped canonical guard.
--
-- Follows THIS table's own existing convention (bump_restaurant_branch_status_version_v1 /
-- restaurant_branches_status_version_trigger) rather than the branch_menu_items convention used by
-- RA-2A..D: a plain "old + 1" function gated by a trigger that is itself scoped to
-- "BEFORE UPDATE OF name ... WHEN (old.name IS DISTINCT FROM new.name)". Insert-time seeding needs
-- no trigger branch because the column default handles it, exactly like status_version.
--
-- The canonical value contract -- 1..80 Unicode characters after outer trimming, no control code
-- points -- is enforced in the SAME trigger as defense-in-depth: this is a value-domain invariant
-- (what a canonical branch name IS), not an authorization rule, so it belongs here rather than in
-- the RPC alone, exactly as RA-2C-P1 enforced the canonical price range in its version trigger. It
-- fires only on an actual name change, so a legacy non-canonical name that is never touched, or is
-- touched by an unrelated write that leaves name alone, never has to become canonical.
-- ---------------------------------------------------------------------------------------------
alter table public.restaurant_branches
  add column display_name_version bigint not null default 0;

alter table public.restaurant_branches
  add constraint restaurant_branches_display_name_version_non_negative
  check (display_name_version >= 0);

create function public.bump_restaurant_branch_display_name_version_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Change-scoped canonical guard: whole TWD-style discipline for text. Evaluated only because the
  -- trigger's own WHEN clause already proved new.name IS DISTINCT FROM old.name.
  if pg_catalog.char_length(new.name) < 1 or pg_catalog.char_length(new.name) > 80 then
    raise exception 'RA-2E-P1: a branch display-name change must be 1 to 80 characters';
  end if;
  if new.name <> pg_catalog.btrim(new.name) then
    raise exception 'RA-2E-P1: a branch display-name change must not carry leading or trailing whitespace';
  end if;
  if new.name ~ '[\x00-\x1F\x7F-\x9F]' then
    raise exception 'RA-2E-P1: a branch display-name change must not contain control characters';
  end if;

  new.display_name_version := old.display_name_version + 1;
  return new;
end;
$$;

create trigger restaurant_branches_display_name_version_trigger
  before update of name on public.restaurant_branches
  for each row
  when (old.name is distinct from new.name)
  execute function public.bump_restaurant_branch_display_name_version_v1();

comment on function public.bump_restaurant_branch_display_name_version_v1() is
  'RA-2E-P1. Change-scoped canonical guard plus DB-maintained version bump for restaurant_branches.name. Fires only when name actually changes (see the owning trigger''s WHEN clause), so legacy non-canonical names and unrelated writes are never affected.';

-- ---------------------------------------------------------------------------------------------
-- 3. The sealed display-name writer.
-- ---------------------------------------------------------------------------------------------
create role restaurant_owner_branch_display_name_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role restaurant_owner_branch_display_name_write_authority is
  'RA-2E-P1 sealed writer. Owns the branch display-name preview and mutation RPCs. Column UPDATE on restaurant_branches.name only; granted to no client role; cannot write status, status_version, address, district, GEO fields or display_name_version.';

grant restaurant_owner_branch_display_name_write_authority to postgres
  with admin false, inherit false, set true;

grant usage on schema restaurant_internal
  to restaurant_owner_branch_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. The audit relation.
-- ---------------------------------------------------------------------------------------------
create table restaurant_internal.branch_display_name_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  previous_display_name text not null,
  next_display_name text not null,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint branch_display_name_audit_log_pkey primary key (id),
  constraint branch_display_name_audit_log_transition_check
    check (previous_display_name <> next_display_name),
  -- The recorded destination is always canonical, even when the origin was legacy/non-canonical.
  constraint branch_display_name_audit_log_next_canonical_check
    check (pg_catalog.char_length(next_display_name) >= 1
      and pg_catalog.char_length(next_display_name) <= 80
      and next_display_name = pg_catalog.btrim(next_display_name)
      and next_display_name !~ '[\x00-\x1F\x7F-\x9F]'),
  constraint branch_display_name_audit_log_version_advance_check
    check (next_version = previous_version + 1),
  constraint branch_display_name_audit_log_version_non_negative_check
    check (previous_version >= 0)
);

create index branch_display_name_audit_log_created_at_idx
  on restaurant_internal.branch_display_name_audit_log (created_at desc);

create index branch_display_name_audit_log_target_idx
  on restaurant_internal.branch_display_name_audit_log (branch_id, created_at desc);

comment on table restaurant_internal.branch_display_name_audit_log is
  'RA-2E-P1 append-only branch display-name audit. No UPDATE or DELETE policy exists for any role, and no client role holds any privilege on it.';

alter table restaurant_internal.branch_display_name_audit_log
  enable row level security;
alter table restaurant_internal.branch_display_name_audit_log
  force row level security;

create policy branch_display_name_audit_log_writer_select
  on restaurant_internal.branch_display_name_audit_log
  for select to restaurant_owner_branch_display_name_write_authority using (true);
create policy branch_display_name_audit_log_writer_insert
  on restaurant_internal.branch_display_name_audit_log
  for insert to restaurant_owner_branch_display_name_write_authority with check (true);

revoke all on table restaurant_internal.branch_display_name_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.branch_display_name_audit_log
  to restaurant_owner_branch_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 5. Minimum table privileges for the display-name writer.
-- ---------------------------------------------------------------------------------------------
grant select (id, auth_user_id, login_status)
  on table public.restaurant_users
  to restaurant_owner_branch_display_name_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships
  to restaurant_owner_branch_display_name_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles
  to restaurant_owner_branch_display_name_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions
  to restaurant_owner_branch_display_name_write_authority;
grant select (id, restaurant_id, name, display_name_version)
  on table public.restaurant_branches
  to restaurant_owner_branch_display_name_write_authority;
grant update (name)
  on table public.restaurant_branches
  to restaurant_owner_branch_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 6. Row level security: permissive pair that grants, restrictive pair that narrows.
--
-- branches_public_read_dev is a PERMISSIVE PUBLIC read policy on this table (using status='active'),
-- so exactly the RA-2A-P1-R1 lesson applies: a permissive owner-scoped policy alone would narrow
-- nothing on the read path. Both RPCs additionally join the caller's membership chain themselves.
-- ---------------------------------------------------------------------------------------------
create policy restaurant_branches_owner_display_name_select
  on public.restaurant_branches
  for select to restaurant_owner_branch_display_name_write_authority
  using (true);

create policy restaurant_branches_owner_display_name_update
  on public.restaurant_branches
  for update to restaurant_owner_branch_display_name_write_authority
  using (true)
  with check (
    pg_catalog.char_length(name) >= 1 and pg_catalog.char_length(name) <= 80
    and name = pg_catalog.btrim(name)
    and name !~ '[\x00-\x1F\x7F-\x9F]'
  );

create policy restaurant_branches_owner_display_name_tenant_select
  on public.restaurant_branches
  as restrictive
  for select to restaurant_owner_branch_display_name_write_authority
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
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch.profile.display_name.write'
        and permission.permission_scope = 'restaurant'
    )
  );

create policy restaurant_branches_owner_display_name_tenant_update
  on public.restaurant_branches
  as restrictive
  for update to restaurant_owner_branch_display_name_write_authority
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
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch.profile.display_name.write'
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
        and membership.restaurant_id = restaurant_branches.restaurant_id
        and role.status = 'active'
        and role.role_key = 'owner'
        and permission.permission_key = 'branch.profile.display_name.write'
        and permission.permission_scope = 'restaurant'
    )
  );

grant create on schema public
  to restaurant_owner_branch_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 7. The canonical preview.
--
-- restaurant_branches has no third hierarchy level below branch, so the selector is exactly
-- (restaurant, branch) rather than the (restaurant, branch, item) shape RA-2A..D use for
-- branch_menu_items.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_preview_branch_display_name_v1(
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
      and permission.permission_key = 'branch.profile.display_name.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select branch.id, branch.restaurant_id, branch.name, branch.display_name_version
  into v_target
  from public.restaurant_branches as branch
  join public.restaurant_memberships as membership
    on membership.restaurant_id = branch.restaurant_id
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
   and permission.permission_key = 'branch.profile.display_name.write'
   and permission.permission_scope = 'restaurant'
  where branch.id = p_branch_id
    and branch.restaurant_id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'ready',
    'branchId', v_target.id,
    'restaurantId', v_target.restaurant_id,
    'displayName', v_target.name,
    'displayNameVersion', v_target.display_name_version::text
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_display_name_v1(text, text) is
  'RA-2E-P1. Returns the current display name and concurrency token of one branch to an active Restaurant Owner holding branch.profile.display_name.write. Read-only and STABLE. Takes no actor argument.';

-- ---------------------------------------------------------------------------------------------
-- 8. The canonical mutation.
--
--   p_expected_display_name  the exact stored current name the caller believes it is replacing.
--                            Compared with exact equality, never trimmed or otherwise normalized --
--                            it must be able to match a legacy, non-canonical stored value exactly.
--   p_next_display_name      the proposed destination. Canonicalized (outer-trimmed) BEFORE
--                            validation and BEFORE the no-change comparison, so outer whitespace
--                            alone is never treated as a business change.
--
-- Validation order mirrors RA-2C-P1/RA-2D-P1: auth -> lexical presence -> permission -> tenant/
-- target lock -> expected name + version (stale) -> canonicalize next -> validate canonical next ->
-- no_change -> update -> audit. Canonical validation happens AFTER the tenant/target lookup here
-- (unlike price's before-permission ordering) because, unlike a numeric price format, text validity
-- carries no risk of leaking tenant information through its own error shape, and validating against
-- the real current name lets no_change be computed correctly in one pass.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_set_branch_display_name_v1(
  p_branch_id text,
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

  if p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_expected_display_name is null
    or p_next_display_name is null
    or p_expected_version is null
    or p_expected_version < 0
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
      and permission.permission_key = 'branch.profile.display_name.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select branch.id, branch.restaurant_id, branch.name, branch.display_name_version,
         membership.id as membership_id
  into v_target
  from public.restaurant_branches as branch
  join public.restaurant_memberships as membership
    on membership.restaurant_id = branch.restaurant_id
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
   and permission.permission_key = 'branch.profile.display_name.write'
   and permission.permission_scope = 'restaurant'
  where branch.id = p_branch_id
  for update of branch;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  -- expectedDisplayName is compared EXACTLY: it must be able to name a legacy, non-canonical stored
  -- value precisely, so it is never trimmed or otherwise normalized before this comparison.
  if v_target.name <> p_expected_display_name
    or v_target.display_name_version <> p_expected_version
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  -- nextDisplayName is canonicalized (outer-trimmed only -- interior whitespace and case are
  -- preserved, and no Unicode normalization is applied) BEFORE validation and BEFORE the no-change
  -- comparison, so outer whitespace alone is never treated as a business change.
  v_canonical_next := pg_catalog.btrim(p_next_display_name);

  if pg_catalog.char_length(v_canonical_next) < 1 or pg_catalog.char_length(v_canonical_next) > 80
    or v_canonical_next ~ '[\x00-\x1F\x7F-\x9F]'
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if v_canonical_next = v_target.name then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  update public.restaurant_branches as branch
  set name = v_canonical_next
  where branch.id = v_target.id
  returning branch.display_name_version into v_next_version;

  insert into restaurant_internal.branch_display_name_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, branch_id,
     previous_display_name, next_display_name, previous_version, next_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.id,
     v_target.name, v_canonical_next, v_target.display_name_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'applied',
    'branchId', v_target.id,
    'displayName', v_canonical_next,
    'displayNameVersion', v_next_version::text,
    'auditId', v_audit_id
  );
end;
$$;

comment on function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint) is
  'RA-2E-P1. Renames one branch''s public display name for an active Restaurant Owner holding branch.profile.display_name.write. Canonicalizes the destination (outer trim only) before validating and comparing. Takes no actor argument. Never writes status, status_version, address, district or any GEO column.';

-- ---------------------------------------------------------------------------------------------
-- 9. Function privileges, settled BEFORE ownership moves.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_preview_branch_display_name_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.bump_restaurant_branch_display_name_version_v1()
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_preview_branch_display_name_v1(text, text)
  to authenticated;
grant execute on function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)
  to authenticated;

alter function public.restaurant_owner_preview_branch_display_name_v1(text, text)
  owner to restaurant_owner_branch_display_name_write_authority;
alter function public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)
  owner to restaurant_owner_branch_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public
  from restaurant_owner_branch_display_name_write_authority;
revoke restaurant_owner_branch_display_name_write_authority
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
  where policy.polrelid = 'public.restaurant_branches'::pg_catalog.regclass
    and policy.polname in ('restaurant_branches_owner_display_name_tenant_select',
                           'restaurant_branches_owner_display_name_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 2 then
    raise exception 'RA-2E-P1: the tenant policies are not RESTRICTIVE (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.restaurant_branches'::pg_catalog.regclass
    and policy.polname in ('restaurant_branches_owner_display_name_select',
                           'restaurant_branches_owner_display_name_update')
    and policy.polpermissive = true;
  if v_count <> 2 then
    raise exception 'RA-2E-P1: the permissive display-name policies are missing (found % of 2)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as space on space.oid = relation.relnamespace
  where space.nspname = 'public'
    and relation.relname in ('role_permissions', 'restaurant_roles')
    and relation.relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'RA-2E-P1: the seed suspension did not restore FORCE row level security';
  end if;

  if pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'status', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'status_version', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'address', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'district', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'latitude', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'longitude', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'geocode_status', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'geocode_address_fingerprint', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'restaurant_id', 'UPDATE')
    or pg_catalog.has_column_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'display_name_version', 'UPDATE') then
    raise exception 'RA-2E-P1: the display-name writer can write a column it must never write';
  end if;
  if pg_catalog.has_column_privilege('platform_admin_branch_status_authority',
       'public.restaurant_branches', 'name', 'UPDATE')
    or pg_catalog.has_column_privilege('geo_geocode_authority',
       'public.restaurant_branches', 'name', 'UPDATE') then
    raise exception 'RA-2E-P1: a frozen predecessor writer was widened to name';
  end if;
  if pg_catalog.has_table_privilege('restaurant_owner_branch_display_name_write_authority',
       'public.restaurant_branches', 'UPDATE') then
    raise exception 'RA-2E-P1: the display-name writer holds broad table UPDATE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_display_name_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2E-P1: a client role holds membership of the display-name writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.restaurant_branches', 'UPDATE') then
    raise exception 'RA-2E-P1: a client role gained direct UPDATE access to restaurant_branches';
  end if;

  -- The trigger that maintains display_name_version must be scoped to name changes only, which is
  -- what keeps RA-1C's status writer and both GEO writers from ever advancing it.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = 'public.restaurant_branches'::pg_catalog.regclass
    and trigger_row.tgname = 'restaurant_branches_display_name_version_trigger'
    and not trigger_row.tgisinternal
    and pg_catalog.pg_get_triggerdef(trigger_row.oid) like '%UPDATE OF name%';
  if v_count <> 1 then
    raise exception 'RA-2E-P1: the display-name version trigger is not scoped to UPDATE OF name';
  end if;
end
$$;

commit;
