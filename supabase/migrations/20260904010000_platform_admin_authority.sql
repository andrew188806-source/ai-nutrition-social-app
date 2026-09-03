-- RA-1A: the Platform Admin authorization foundation.
--
-- WHAT THIS IS. The identity, membership, permission and audit authority that a future Admin console
-- must pass through. It creates NO console capability: no restaurant approval, no catalog write, no
-- user support surface, no private-data projection. It answers exactly one question — "is the
-- currently authenticated caller a Platform Admin, and which Platform Admin permissions do they
-- hold" — and records every grant or revocation of that status.
--
-- WHY A PRIVATE SCHEMA. Restaurant membership (Phase 2V-B) lives in `public` because a restaurant
-- member legitimately reads their own membership row through the Data API. Platform Admin membership
-- is different: the SET of platform administrators is itself sensitive, and no client has any
-- legitimate reason to read the table directly, not even its own row. `admin_internal` is therefore
-- server-only and deliberately absent from the PostgREST exposed-schema list, exactly like
-- `social_internal` and `geo_internal`. The only client surface is the three bounded functions in
-- `public` at the bottom of this migration.
--
-- WHAT PLATFORM ADMIN IS NOT.
--   * NOT a Restaurant Owner. Restaurant authority is per-restaurant and lives in
--     public.restaurant_memberships; this authority is platform-wide and shares nothing with it.
--   * NOT a Consumer. No consumer capability is granted, removed or implied here.
--   * NOT a future Nutritionist. That is a separate professional role with its own scope; the
--     role_key CHECK below admits 'platform_admin' and nothing else precisely so a later round has
--     to make that decision explicitly rather than inherit it.
--   * NOT a break-glass or highest-privilege management authority. There is no superuser path, no
--     BYPASSRLS, and no blanket private-data access anywhere in this migration.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It grants no read over meal records, meal photos, chat, Social
-- evidence, Taste, restriction settings, coordinates or push tokens. RA-1A adds no capability whose
-- privacy policy has not been decided; the permission vocabulary is a closed two-value list.

begin;

create schema admin_internal;

comment on schema admin_internal is
  'Server-only Platform Admin authority. Deliberately absent from the PostgREST exposed-schema list, so nothing in here is reachable through the Data API by any role. Never add this schema to the Data API configuration.';

-- ---------------------------------------------------------------------------------------------
-- Sealed roles.
--
-- Two, not one. The context reader owns the functions every signed-in client may call, so it must
-- hold the narrowest possible privilege: column SELECT and nothing else. The write authority owns
-- the tables and the provisioning functions and is never granted to any client role. Collapsing
-- them would put table ownership behind a function that `authenticated` can execute.
--
-- NOLOGIN: neither role can authenticate. NOINHERIT: membership never leaks privilege implicitly.
-- NOBYPASSRLS: row level security applies to both, including on tables they own (FORCE below).
-- No SUPERUSER, CREATEDB, CREATEROLE or REPLICATION is requested anywhere.
-- ---------------------------------------------------------------------------------------------
create role platform_admin_context_reader
  nologin
  noinherit
  nobypassrls;

create role platform_admin_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role platform_admin_context_reader is
  'RA-1A sealed reader. Owns the three public Platform Admin read functions. Holds column SELECT only; never owns a table and never writes.';
comment on role platform_admin_write_authority is
  'RA-1A sealed writer. Owns admin_internal and its provisioning functions. Granted to no client role: reaching it requires an explicit, deliberate operator membership grant.';

-- PostgreSQL 17 gives the creating role administration authority over a new role but no SET or
-- INHERIT path by default. These memberships add SET only for the ownership transfers below and are
-- revoked at the end of this migration.
grant platform_admin_context_reader to postgres with admin false, inherit false, set true;
grant platform_admin_write_authority to postgres with admin false, inherit false, set true;

grant usage on schema admin_internal to platform_admin_context_reader;
grant usage on schema admin_internal to platform_admin_write_authority;

-- ---------------------------------------------------------------------------------------------
-- Catalogue: which platform roles exist, and what each may do.
-- ---------------------------------------------------------------------------------------------
create table admin_internal.platform_admin_roles (
  id uuid not null,
  role_key text not null,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint platform_admin_roles_pkey primary key (id),
  constraint platform_admin_roles_role_key_key unique (role_key),
  -- One value on purpose. A future Nutritionist, support agent or break-glass authority is a
  -- separate product decision and must extend this list explicitly, in its own reviewed round.
  constraint platform_admin_roles_role_key_check
    check (role_key = 'platform_admin'),
  constraint platform_admin_roles_status_check
    check (status in ('active', 'inactive'))
);

create table admin_internal.platform_admin_role_permissions (
  role_id uuid not null,
  permission_key text not null,
  permission_scope text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint platform_admin_role_permissions_pkey
    primary key (role_id, permission_key, permission_scope),
  constraint platform_admin_role_permissions_role_id_fkey
    foreign key (role_id) references admin_internal.platform_admin_roles (id)
    on update restrict on delete restrict,
  -- RA-1A is a READ-ONLY foundation. The vocabulary contains no write, create, update, delete,
  -- approve or manage key, so no Platform Admin write capability can be expressed at all until a
  -- later round widens this CHECK deliberately.
  constraint platform_admin_role_permissions_permission_key_check
    check (permission_key in ('admin_context.read', 'admin_audit.read')),
  constraint platform_admin_role_permissions_permission_scope_check
    check (permission_scope in ('self', 'platform'))
);

-- ---------------------------------------------------------------------------------------------
-- Membership: the auth identity to platform role binding.
--
-- There is no separate `platform_admins` identity table. Restaurant needs one because membership is
-- per-restaurant and a person may hold several; Platform Admin has no tenant dimension, so an
-- identity table would be strictly 1:1 with membership and carry no information. `status` covers
-- the enable/disable need that restaurant_users.login_status covers there.
-- ---------------------------------------------------------------------------------------------
create table admin_internal.platform_admin_memberships (
  id uuid not null default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null,
  role_id uuid not null,
  status text not null default 'active',
  granted_by_auth_user_id uuid,
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_by_auth_user_id uuid,
  revoked_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint platform_admin_memberships_pkey primary key (id),
  -- One membership row per identity. Revocation is a status change, never a second row and never a
  -- delete, so the grant/revoke history of an identity is a single auditable record.
  constraint platform_admin_memberships_auth_user_id_key unique (auth_user_id),
  constraint platform_admin_memberships_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users (id)
    on update restrict on delete cascade,
  constraint platform_admin_memberships_role_id_fkey
    foreign key (role_id) references admin_internal.platform_admin_roles (id)
    on update restrict on delete restrict,
  constraint platform_admin_memberships_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint platform_admin_memberships_revocation_shape
    check (
      (status = 'active' and revoked_at is null and revoked_by_auth_user_id is null)
      or (status <> 'active' and revoked_at is not null)
    )
);

create index platform_admin_memberships_status_idx
  on admin_internal.platform_admin_memberships (status);

-- ---------------------------------------------------------------------------------------------
-- Audit foundation.
--
-- Append-only by construction: there is no UPDATE and no DELETE policy on this table for any role,
-- so a privileged operation can be recorded but never rewritten or erased. Every provisioning
-- function below writes its audit row in the SAME statement as the membership change, so a granted
-- or revoked admin without a corresponding audit row is not a state this schema can reach.
-- ---------------------------------------------------------------------------------------------
create table admin_internal.platform_admin_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  result text not null,
  reason text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint platform_admin_audit_log_pkey primary key (id),
  constraint platform_admin_audit_log_action_check
    check (action in ('grant_platform_admin', 'revoke_platform_admin')),
  constraint platform_admin_audit_log_target_type_check
    check (target_type = 'platform_admin_membership'),
  constraint platform_admin_audit_log_result_check
    check (result in ('granted', 'revoked', 'rejected'))
);

create index platform_admin_audit_log_created_at_idx
  on admin_internal.platform_admin_audit_log (created_at desc);

comment on table admin_internal.platform_admin_audit_log is
  'RA-1A append-only Platform Admin audit foundation. No UPDATE or DELETE policy exists for any role.';

insert into admin_internal.platform_admin_roles (id, role_key, display_name, status)
values ('00000000-0000-4000-8000-00000000ad01', 'platform_admin', 'Platform Admin', 'active');

insert into admin_internal.platform_admin_role_permissions (role_id, permission_key, permission_scope)
values
  ('00000000-0000-4000-8000-00000000ad01', 'admin_context.read', 'self'),
  ('00000000-0000-4000-8000-00000000ad01', 'admin_audit.read', 'platform');

-- ---------------------------------------------------------------------------------------------
-- Row level security. FORCE applies the policies to the owning role too, so even the sealed writer
-- reads and writes through a policy rather than around one.
-- ---------------------------------------------------------------------------------------------
alter table admin_internal.platform_admin_roles enable row level security;
alter table admin_internal.platform_admin_roles force row level security;
alter table admin_internal.platform_admin_role_permissions enable row level security;
alter table admin_internal.platform_admin_role_permissions force row level security;
alter table admin_internal.platform_admin_memberships enable row level security;
alter table admin_internal.platform_admin_memberships force row level security;
alter table admin_internal.platform_admin_audit_log enable row level security;
alter table admin_internal.platform_admin_audit_log force row level security;

create policy platform_admin_roles_reader_select
  on admin_internal.platform_admin_roles
  for select to platform_admin_context_reader using (true);
create policy platform_admin_roles_writer_select
  on admin_internal.platform_admin_roles
  for select to platform_admin_write_authority using (true);

create policy platform_admin_role_permissions_reader_select
  on admin_internal.platform_admin_role_permissions
  for select to platform_admin_context_reader using (true);
create policy platform_admin_role_permissions_writer_select
  on admin_internal.platform_admin_role_permissions
  for select to platform_admin_write_authority using (true);

create policy platform_admin_memberships_reader_select
  on admin_internal.platform_admin_memberships
  for select to platform_admin_context_reader using (true);
create policy platform_admin_memberships_writer_select
  on admin_internal.platform_admin_memberships
  for select to platform_admin_write_authority using (true);
create policy platform_admin_memberships_writer_insert
  on admin_internal.platform_admin_memberships
  for insert to platform_admin_write_authority with check (true);
create policy platform_admin_memberships_writer_update
  on admin_internal.platform_admin_memberships
  for update to platform_admin_write_authority using (true) with check (true);

create policy platform_admin_audit_log_reader_select
  on admin_internal.platform_admin_audit_log
  for select to platform_admin_context_reader using (true);
create policy platform_admin_audit_log_writer_select
  on admin_internal.platform_admin_audit_log
  for select to platform_admin_write_authority using (true);
create policy platform_admin_audit_log_writer_insert
  on admin_internal.platform_admin_audit_log
  for insert to platform_admin_write_authority with check (true);

-- No DELETE policy exists on any table above, and no UPDATE policy exists on the audit log.

-- ---------------------------------------------------------------------------------------------
-- Grants. Nothing in admin_internal is reachable by any client role.
-- ---------------------------------------------------------------------------------------------
revoke all on schema admin_internal from public;
revoke all on table admin_internal.platform_admin_roles
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.platform_admin_role_permissions
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.platform_admin_memberships
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.platform_admin_audit_log
  from public, anon, authenticated, authenticator, service_role;

-- Minimum column SELECT for the reader: exactly the columns the three public functions project.
grant select (id, role_key, status)
  on table admin_internal.platform_admin_roles to platform_admin_context_reader;
grant select (role_id, permission_key, permission_scope)
  on table admin_internal.platform_admin_role_permissions to platform_admin_context_reader;
grant select (id, auth_user_id, role_id, status)
  on table admin_internal.platform_admin_memberships to platform_admin_context_reader;
grant select (id, actor_auth_user_id, action, target_type, target_id, result, reason, created_at)
  on table admin_internal.platform_admin_audit_log to platform_admin_context_reader;

grant select, insert, update on table admin_internal.platform_admin_memberships
  to platform_admin_write_authority;
grant select, insert on table admin_internal.platform_admin_audit_log
  to platform_admin_write_authority;
grant select on table admin_internal.platform_admin_roles to platform_admin_write_authority;
grant select on table admin_internal.platform_admin_role_permissions
  to platform_admin_write_authority;

-- PostgreSQL requires a prospective function owner to hold CREATE on the schema. Both privileges
-- exist only while ownership is assigned and are revoked at the end of this migration.
grant create on schema public to platform_admin_context_reader;
grant create on schema admin_internal to platform_admin_write_authority;

-- ---------------------------------------------------------------------------------------------
-- Client-callable authorization boundary.
--
-- No function here accepts an actor, user id or role parameter. The actor is resolved only from the
-- verified request claims, so a caller cannot name somebody else and cannot assert a role.
-- ---------------------------------------------------------------------------------------------
create function public.platform_admin_current_context_v1()
returns table (
  role_key text,
  permission_key text,
  permission_scope text
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  with request_actor as (
    select coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (
        nullif(
          pg_catalog.current_setting('request.jwt.claims', true),
          ''
        )::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid as auth_user_id
  )
  select
    role.role_key,
    permission.permission_key,
    permission.permission_scope
  from request_actor
  join admin_internal.platform_admin_memberships as membership
    on membership.auth_user_id = request_actor.auth_user_id
   and membership.status = 'active'
  join admin_internal.platform_admin_roles as role
    on role.id = membership.role_id
   and role.status = 'active'
  join admin_internal.platform_admin_role_permissions as permission
    on permission.role_id = role.id;
$$;

comment on function public.platform_admin_current_context_v1() is
  'RA-1A. Returns the current verified caller''s Platform Admin permissions, or no rows. Takes no argument: the actor can only be the verified request subject.';

create function public.platform_admin_has_permission_v1(
  requested_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  with request_actor as (
    select coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      (
        nullif(
          pg_catalog.current_setting('request.jwt.claims', true),
          ''
        )::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid as auth_user_id
  )
  select pg_catalog.count(*) > 0
  from request_actor
  join admin_internal.platform_admin_memberships as membership
    on membership.auth_user_id = request_actor.auth_user_id
   and membership.status = 'active'
  join admin_internal.platform_admin_roles as role
    on role.id = membership.role_id
   and role.status = 'active'
  join admin_internal.platform_admin_role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = requested_permission_key;
$$;

comment on function public.platform_admin_has_permission_v1(text) is
  'RA-1A authorization predicate for future Admin surfaces. False for every caller who is not a currently active Platform Admin holding the requested permission.';

create function public.platform_admin_audit_log_v1(
  requested_limit integer default 100
)
returns table (
  id uuid,
  actor_auth_user_id uuid,
  action text,
  target_type text,
  target_id text,
  result text,
  reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    entry.id,
    entry.actor_auth_user_id,
    entry.action,
    entry.target_type,
    entry.target_id,
    entry.result,
    entry.reason,
    entry.created_at
  from admin_internal.platform_admin_audit_log as entry
  where public.platform_admin_has_permission_v1('admin_audit.read')
  order by entry.created_at desc, entry.id desc
  -- `least`, `greatest` and `coalesce` are SQL constructs, not schema-qualifiable functions, so they
  -- are deliberately bare here while every genuine function call stays qualified against search_path
  -- capture. Qualifying them raises 42883 under the empty search_path this definer pins.
  limit least(greatest(coalesce(requested_limit, 100), 1), 500);
$$;

comment on function public.platform_admin_audit_log_v1(integer) is
  'RA-1A. Returns Platform Admin audit entries only to a caller holding admin_audit.read; every other caller receives no rows.';

-- ---------------------------------------------------------------------------------------------
-- Provisioning and revocation.
--
-- These live in admin_internal, are owned by the sealed writer, and are granted to NO role. There is
-- therefore no client-callable path that can create a Platform Admin: reaching them requires an
-- operator to deliberately grant themselves membership of platform_admin_write_authority and SET
-- ROLE to it, which this migration revokes for itself at the end.
--
-- `p_actor_auth_user_id` is ATTRIBUTION FOR THE AUDIT ROW, never authorization. Authorization is
-- the ability to execute the function at all. A caller cannot escalate by passing a different value.
-- ---------------------------------------------------------------------------------------------
create function admin_internal.grant_platform_admin(
  p_target_auth_user_id uuid,
  p_role_key text,
  p_actor_auth_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_role_id uuid;
  v_membership_id uuid;
  v_constraint_name text;
begin
  if p_target_auth_user_id is null or p_reason is null or pg_catalog.btrim(p_reason) = '' then
    insert into admin_internal.platform_admin_audit_log
      (actor_auth_user_id, action, target_type, target_id, result, reason)
    values (p_actor_auth_user_id, 'grant_platform_admin', 'platform_admin_membership',
      coalesce(p_target_auth_user_id::text, 'unknown'), 'rejected', 'invalid request');
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select role.id into v_role_id
  from admin_internal.platform_admin_roles as role
  where role.role_key = p_role_key and role.status = 'active';

  if v_role_id is null then
    insert into admin_internal.platform_admin_audit_log
      (actor_auth_user_id, action, target_type, target_id, result, reason)
    values (p_actor_auth_user_id, 'grant_platform_admin', 'platform_admin_membership',
      p_target_auth_user_id::text, 'rejected', 'unknown or inactive role');
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unknown_role');
  end if;

  -- Target identity existence is the foreign key's job, not this function's. Reading auth.users here
  -- would require platform_admin_write_authority to hold USAGE on the auth schema — privilege a
  -- sealed provisioning role must never have, and privilege this migration cannot grant in any case.
  -- platform_admin_memberships_auth_user_id_fkey already enforces exactly that invariant, so the
  -- write is attempted and the constraint is the single authority on whether the identity exists.
  --
  -- The block is scoped to the membership write alone: on violation PostgreSQL rolls the
  -- subtransaction back to its implicit savepoint, so no partial membership state can survive, the
  -- handler still appends its audit row, and the surrounding operator transaction stays valid.
  begin
    insert into admin_internal.platform_admin_memberships
      (auth_user_id, role_id, status, granted_by_auth_user_id, granted_at,
       revoked_by_auth_user_id, revoked_at, updated_at)
    values (p_target_auth_user_id, v_role_id, 'active', p_actor_auth_user_id,
      pg_catalog.clock_timestamp(), null, null, pg_catalog.clock_timestamp())
    on conflict (auth_user_id) do update
      set role_id = excluded.role_id,
          status = 'active',
          granted_by_auth_user_id = excluded.granted_by_auth_user_id,
          granted_at = excluded.granted_at,
          revoked_by_auth_user_id = null,
          revoked_at = null,
          updated_at = pg_catalog.clock_timestamp()
    returning id into v_membership_id;
  exception
    when foreign_key_violation then
      -- Only the target-identity constraint is a user-facing rejection. Any other foreign key
      -- failing here is an unexpected database condition, so the original exception is re-raised
      -- unchanged: reporting it as 'unknown_identity' would state a false reason and swallow a real
      -- fault. Fail closed on anything this function does not positively recognise.
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'platform_admin_memberships_auth_user_id_fkey' then
        raise;
      end if;
      insert into admin_internal.platform_admin_audit_log
        (actor_auth_user_id, action, target_type, target_id, result, reason)
      values (p_actor_auth_user_id, 'grant_platform_admin', 'platform_admin_membership',
        p_target_auth_user_id::text, 'rejected', 'unknown target identity');
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unknown_identity');
  end;

  insert into admin_internal.platform_admin_audit_log
    (actor_auth_user_id, action, target_type, target_id, result, reason)
  values (p_actor_auth_user_id, 'grant_platform_admin', 'platform_admin_membership',
    p_target_auth_user_id::text, 'granted', p_reason);

  return pg_catalog.jsonb_build_object('ok', true, 'membershipId', v_membership_id);
end;
$$;

create function admin_internal.revoke_platform_admin(
  p_target_auth_user_id uuid,
  p_actor_auth_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_membership_id uuid;
begin
  if p_target_auth_user_id is null or p_reason is null or pg_catalog.btrim(p_reason) = '' then
    insert into admin_internal.platform_admin_audit_log
      (actor_auth_user_id, action, target_type, target_id, result, reason)
    values (p_actor_auth_user_id, 'revoke_platform_admin', 'platform_admin_membership',
      coalesce(p_target_auth_user_id::text, 'unknown'), 'rejected', 'invalid request');
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  update admin_internal.platform_admin_memberships as membership
  set status = 'revoked',
      revoked_by_auth_user_id = p_actor_auth_user_id,
      revoked_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  where membership.auth_user_id = p_target_auth_user_id
    and membership.status <> 'revoked'
  returning membership.id into v_membership_id;

  if v_membership_id is null then
    insert into admin_internal.platform_admin_audit_log
      (actor_auth_user_id, action, target_type, target_id, result, reason)
    values (p_actor_auth_user_id, 'revoke_platform_admin', 'platform_admin_membership',
      p_target_auth_user_id::text, 'rejected', 'no active membership');
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_active_membership');
  end if;

  insert into admin_internal.platform_admin_audit_log
    (actor_auth_user_id, action, target_type, target_id, result, reason)
  values (p_actor_auth_user_id, 'revoke_platform_admin', 'platform_admin_membership',
    p_target_auth_user_id::text, 'revoked', p_reason);

  return pg_catalog.jsonb_build_object('ok', true, 'membershipId', v_membership_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges, settled BEFORE ownership moves.
--
-- The ordering here is load-bearing, not cosmetic. REVOKE and GRANT must be issued while the
-- principal running this migration still owns these functions. Once ownership has moved to a
-- sealed role — a role this migration deliberately cannot SET ROLE to — a REVOKE by the previous
-- owner is not an error: PostgreSQL emits a warning and silently changes nothing, leaving the
-- PUBLIC EXECUTE default in place on every function. Every RA-1A function therefore carries its
-- explicit full-client revoke here, ahead of the transfer. ALTER FUNCTION ... OWNER TO rewrites
-- the grantor of each surviving ACL entry rather than resetting the ACL, so the privileges set
-- below survive the transfer intact.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.platform_admin_current_context_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.platform_admin_has_permission_v1(text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.platform_admin_audit_log_v1(integer)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.grant_platform_admin(uuid, text, uuid, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.revoke_platform_admin(uuid, uuid, text)
  from public, anon, authenticated, authenticator, service_role;

-- The three public functions are the whole client-executable boundary, and only for a signed-in
-- caller: a signed-out one cannot reach them at all. The two provisioning functions are granted to
-- NO role — only their owner may execute them, and the migration gives up its membership of that
-- owner below, so nothing in this database can call them without a deliberate operator action.
grant execute on function public.platform_admin_current_context_v1() to authenticated;
grant execute on function public.platform_admin_has_permission_v1(text) to authenticated;
grant execute on function public.platform_admin_audit_log_v1(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ownership, then release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
alter function public.platform_admin_current_context_v1()
  owner to platform_admin_context_reader;
alter function public.platform_admin_has_permission_v1(text)
  owner to platform_admin_context_reader;
alter function public.platform_admin_audit_log_v1(integer)
  owner to platform_admin_context_reader;
alter function admin_internal.grant_platform_admin(uuid, text, uuid, text)
  owner to platform_admin_write_authority;
alter function admin_internal.revoke_platform_admin(uuid, uuid, text)
  owner to platform_admin_write_authority;

revoke create on schema public from platform_admin_context_reader;
revoke create on schema admin_internal from platform_admin_write_authority;

revoke platform_admin_context_reader from postgres granted by postgres;
revoke platform_admin_write_authority from postgres granted by postgres;

commit;
