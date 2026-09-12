-- RA-3-IA-P3-P6-P1A: staff identity and exact permission-catalog foundation.
--
-- This migration is deliberately inert at runtime. It creates no staff entitlement, Bundle,
-- delegation, context RPC, mutation RPC, or platform_admin backfill. Existing Admin authorization
-- continues to use the frozen platform_admin authority exclusively.

begin;

-- These roles are future authority components, not client identities. Neither is a member of any
-- Supabase client role and neither may authenticate, inherit authority, or bypass RLS.
create role staff_authority_context_reader
  nologin
  noinherit
  nobypassrls;

create role staff_authority_write_authority
  nologin
  noinherit
  nobypassrls;

comment on role staff_authority_context_reader is
  'P3-P6-P1A sealed reader for future exact staff-context resolution. Column-bounded reads on the P1A tables only; no login, write, client membership, or public RPC.';
comment on role staff_authority_write_authority is
  'P3-P6-P1A sealed future provisioning authority. SELECT, INSERT and UPDATE on the P1A tables only; no DELETE, login, client membership, or public RPC.';

-- The migration runner retains table ownership, matching the frozen admin_internal table pattern.
-- The new staff roles receive explicit bounded privileges only and never receive schema CREATE.

create table admin_internal.staff_permission_catalog (
  permission_key text not null,
  lifecycle_status text not null default 'active',
  readiness_status text not null default 'planned',
  sensitivity_class text not null,
  individually_provisionable boolean not null,
  temporary_grantable boolean not null,
  ordinary_supervisor_delegable boolean not null,
  privileged_only boolean not null,
  deferred boolean not null,
  console_admission_required boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_permission_catalog_pkey primary key (permission_key),
  constraint staff_permission_catalog_permission_key_length_check
    check (pg_catalog.length(permission_key) between 3 and 160),
  constraint staff_permission_catalog_permission_key_format_check
    check (permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint staff_permission_catalog_permission_key_no_wildcard_check
    check (pg_catalog.strpos(permission_key, '*') = 0 and pg_catalog.strpos(permission_key, '%') = 0),
  constraint staff_permission_catalog_lifecycle_status_check
    check (lifecycle_status in ('active', 'inactive', 'retired')),
  constraint staff_permission_catalog_readiness_status_check
    check (readiness_status in ('current', 'planned')),
  constraint staff_permission_catalog_sensitivity_class_check
    check (sensitivity_class in (
      'PUBLIC', 'RESTAURANT_OPERATIONAL', 'RESTAURANT_PRIVATE', 'MEMBER_ACCOUNT',
      'USER_PRIVATE', 'HEALTH_PERSONAL_NUTRITION', 'PRIVATE_SOCIAL', 'SECURITY_AUTH',
      'AUDIT', 'ENGINEERING_DIAGNOSTIC', 'BREAK_GLASS_ONLY', 'NUTRITION_GOVERNANCE',
      'COMMERCIAL_RELATIONSHIP'
    )),
  constraint staff_permission_catalog_delegation_shape_check
    check (not ordinary_supervisor_delegable or (individually_provisionable and not privileged_only)),
  constraint staff_permission_catalog_deferred_shape_check
    check (not deferred or readiness_status = 'planned'),
  constraint staff_permission_catalog_console_admission_shape_check
    check (not console_admission_required or (
      readiness_status = 'current'
      and not temporary_grantable
      and not ordinary_supervisor_delegable
      and not privileged_only
      and not deferred
    ))
);

comment on table admin_internal.staff_permission_catalog is
  'P3-P6 closed registry of exact staff permission keys. Contains classifications only: no roles, Bundles, memberships, assignments, entitlements, wildcard namespaces, or runtime prefix semantics.';
comment on column admin_internal.staff_permission_catalog.permission_key is
  'Exact lowercase ASCII authority identifier, maximum 160 characters. Authorization must compare this full value for equality.';

create table admin_internal.staff_accounts (
  id uuid not null default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null,
  status text not null default 'active',
  effective_from timestamptz not null default pg_catalog.clock_timestamp(),
  effective_until timestamptz,
  status_version bigint not null default 0,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_accounts_pkey primary key (id),
  constraint staff_accounts_auth_user_id_key unique (auth_user_id),
  constraint staff_accounts_auth_user_id_fkey
    foreign key (auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_accounts_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint staff_accounts_effective_window_check
    check (effective_until is null or effective_until > effective_from),
  constraint staff_accounts_status_version_check
    check (status_version >= 0)
);

create index staff_accounts_resolution_idx
  on admin_internal.staff_accounts (auth_user_id, status, effective_from, effective_until);

comment on table admin_internal.staff_accounts is
  'P3-P6 one-to-one governed staff identity foundation. It stores lifecycle and validity only; job titles, manager flags, Bundles, permissions and assignments are intentionally absent.';
comment on column admin_internal.staff_accounts.effective_until is
  'Exclusive upper validity bound. NULL is unbounded; expiry is derived later from database time and is never a stored lifecycle status.';

-- P1A seeds only the exact authority vocabulary that already exists in the frozen Admin runtime.
insert into admin_internal.staff_permission_catalog (
  permission_key, lifecycle_status, readiness_status, sensitivity_class,
  individually_provisionable, temporary_grantable, ordinary_supervisor_delegable,
  privileged_only, deferred, console_admission_required
)
values
  ('admin_context.read', 'active', 'current', 'SECURITY_AUTH',
    false, false, false, false, false, true),
  ('admin_audit.read', 'active', 'current', 'AUDIT',
    true, true, false, true, false, false),
  ('admin_restaurant_branch.status.write', 'active', 'current', 'RESTAURANT_OPERATIONAL',
    true, true, true, false, false, false);

alter table admin_internal.staff_permission_catalog enable row level security;
alter table admin_internal.staff_permission_catalog force row level security;
alter table admin_internal.staff_accounts enable row level security;
alter table admin_internal.staff_accounts force row level security;

create policy staff_permission_catalog_reader_select
  on admin_internal.staff_permission_catalog
  for select to staff_authority_context_reader using (true);
create policy staff_permission_catalog_writer_select
  on admin_internal.staff_permission_catalog
  for select to staff_authority_write_authority using (true);
create policy staff_permission_catalog_writer_insert
  on admin_internal.staff_permission_catalog
  for insert to staff_authority_write_authority with check (true);
create policy staff_permission_catalog_writer_update
  on admin_internal.staff_permission_catalog
  for update to staff_authority_write_authority using (true) with check (true);

create policy staff_accounts_reader_select
  on admin_internal.staff_accounts
  for select to staff_authority_context_reader using (true);
create policy staff_accounts_writer_select
  on admin_internal.staff_accounts
  for select to staff_authority_write_authority using (true);
create policy staff_accounts_writer_insert
  on admin_internal.staff_accounts
  for insert to staff_authority_write_authority with check (true);
create policy staff_accounts_writer_update
  on admin_internal.staff_accounts
  for update to staff_authority_write_authority using (true) with check (true);

-- Revoke explicitly even though admin_internal is private. No client role, including service_role,
-- receives a direct table or schema path. The new sealed roles get only their P1A columns/actions.
revoke all on schema admin_internal from public;
revoke all on table admin_internal.staff_permission_catalog
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_accounts
  from public, anon, authenticated, authenticator, service_role;

grant usage on schema admin_internal to staff_authority_context_reader;
grant usage on schema admin_internal to staff_authority_write_authority;

grant select (permission_key, lifecycle_status, readiness_status, deferred)
  on table admin_internal.staff_permission_catalog to staff_authority_context_reader;
grant select (id, auth_user_id, status, effective_from, effective_until, status_version)
  on table admin_internal.staff_accounts to staff_authority_context_reader;

grant select, insert, update on table admin_internal.staff_permission_catalog
  to staff_authority_write_authority;
grant select, insert, update on table admin_internal.staff_accounts
  to staff_authority_write_authority;

commit;
