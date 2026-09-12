-- RA-3-IA-P3-P6-P1B: Bundle revision, assignment, and exact entitlement foundation.
--
-- Bundle rows are provisioning provenance, never runtime authority. The future runtime authority
-- source is one exact staff_permission_entitlements row per independent ALLOW source. This phase
-- creates no seeds, resolver, mutation RPC, compatibility backfill, delegation, audit, or receipt.

begin;

create table admin_internal.staff_bundle_templates (
  bundle_key text not null,
  revision integer not null,
  lifecycle_status text not null default 'active',
  display_name text not null,
  description text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  constraint staff_bundle_templates_pkey primary key (bundle_key, revision),
  constraint staff_bundle_templates_bundle_key_length_check
    check (pg_catalog.length(bundle_key) between 3 and 80),
  constraint staff_bundle_templates_bundle_key_format_check
    check (bundle_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint staff_bundle_templates_bundle_key_no_wildcard_check
    check (pg_catalog.strpos(bundle_key, '*') = 0 and pg_catalog.strpos(bundle_key, '%') = 0),
  constraint staff_bundle_templates_revision_check
    check (revision > 0),
  constraint staff_bundle_templates_lifecycle_status_check
    check (lifecycle_status in ('active', 'retired')),
  constraint staff_bundle_templates_display_name_check
    check (pg_catalog.length(display_name) between 1 and 160),
  constraint staff_bundle_templates_description_check
    check (description is null or pg_catalog.length(description) between 1 and 1000),
  constraint staff_bundle_templates_retirement_shape_check
    check (
      (lifecycle_status = 'active' and retired_at is null)
      or (lifecycle_status = 'retired' and retired_at is not null)
    )
);

comment on table admin_internal.staff_bundle_templates is
  'Versioned staff provisioning templates. (bundle_key, revision) is immutable assignment provenance and never runtime authority; revisions are inserted and later retired, never rewritten into latest.';

create table admin_internal.staff_bundle_template_permissions (
  bundle_key text not null,
  bundle_revision integer not null,
  permission_key text not null,
  membership_kind text not null default 'DEFAULT',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_bundle_template_permissions_pkey
    primary key (bundle_key, bundle_revision, permission_key),
  constraint staff_bundle_template_permissions_bundle_fkey
    foreign key (bundle_key, bundle_revision)
    references admin_internal.staff_bundle_templates (bundle_key, revision)
    on update restrict on delete restrict,
  constraint staff_bundle_template_permissions_permission_fkey
    foreign key (permission_key)
    references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_bundle_template_permissions_membership_kind_check
    check (membership_kind in ('DEFAULT', 'CONDITIONAL'))
);

comment on table admin_internal.staff_bundle_template_permissions is
  'Exact catalog permissions associated with one immutable Bundle revision. DEFAULT is eligible for future automatic materialization; CONDITIONAL requires separate explicit provisioning. P1B performs neither.';

create table admin_internal.staff_bundle_assignments (
  assignment_id uuid not null default pg_catalog.gen_random_uuid(),
  staff_account_id uuid not null,
  bundle_key text not null,
  bundle_revision integer not null,
  status text not null default 'active',
  effective_from timestamptz not null default pg_catalog.clock_timestamp(),
  effective_until timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  constraint staff_bundle_assignments_pkey primary key (assignment_id),
  constraint staff_bundle_assignments_staff_account_fkey
    foreign key (staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_bundle_assignments_bundle_revision_fkey
    foreign key (bundle_key, bundle_revision)
    references admin_internal.staff_bundle_templates (bundle_key, revision)
    on update restrict on delete restrict,
  constraint staff_bundle_assignments_status_check
    check (status in ('active', 'revoked')),
  constraint staff_bundle_assignments_effective_window_check
    check (effective_until is null or effective_until > effective_from),
  constraint staff_bundle_assignments_revocation_shape_check
    check (
      (status = 'active' and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create index staff_bundle_assignments_staff_resolution_idx
  on admin_internal.staff_bundle_assignments
  (staff_account_id, status, effective_from, effective_until);

comment on table admin_internal.staff_bundle_assignments is
  'Provisioning provenance pinned to one exact Bundle revision. An assignment grants nothing without separately materialized entitlement rows.';

create table admin_internal.staff_permission_entitlements (
  entitlement_id uuid not null default pg_catalog.gen_random_uuid(),
  staff_account_id uuid not null,
  permission_key text not null,
  source_type text not null,
  source_bundle_assignment_id uuid,
  status text not null default 'active',
  effective_from timestamptz not null default pg_catalog.clock_timestamp(),
  effective_until timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  constraint staff_permission_entitlements_pkey primary key (entitlement_id),
  constraint staff_permission_entitlements_staff_account_fkey
    foreign key (staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_permission_entitlements_permission_fkey
    foreign key (permission_key)
    references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_permission_entitlements_bundle_assignment_fkey
    foreign key (source_bundle_assignment_id)
    references admin_internal.staff_bundle_assignments (assignment_id)
    on update restrict on delete restrict,
  constraint staff_permission_entitlements_source_type_check
    check (source_type in ('bundle_assignment', 'direct_grant', 'migration_backfill')),
  constraint staff_permission_entitlements_source_shape_check
    check (
      (source_type = 'bundle_assignment' and source_bundle_assignment_id is not null)
      or (source_type in ('direct_grant', 'migration_backfill') and source_bundle_assignment_id is null)
    ),
  constraint staff_permission_entitlements_status_check
    check (status in ('active', 'revoked')),
  constraint staff_permission_entitlements_effective_window_check
    check (effective_until is null or effective_until > effective_from),
  constraint staff_permission_entitlements_revocation_shape_check
    check (
      (status = 'active' and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null)
    )
);

create unique index staff_permission_entitlements_bundle_source_key
  on admin_internal.staff_permission_entitlements
  (source_bundle_assignment_id, permission_key)
  where source_type = 'bundle_assignment';

create index staff_permission_entitlements_staff_resolution_idx
  on admin_internal.staff_permission_entitlements
  (staff_account_id, permission_key, status, effective_from, effective_until);

comment on table admin_internal.staff_permission_entitlements is
  'Future exact runtime ALLOW-source rows. Multiple independent rows may preserve one effective permission. P1C must atomically validate Bundle DEFAULT membership, matching assignment subject, window containment, and all-or-nothing materialization.';

alter table admin_internal.staff_bundle_templates enable row level security;
alter table admin_internal.staff_bundle_templates force row level security;
alter table admin_internal.staff_bundle_template_permissions enable row level security;
alter table admin_internal.staff_bundle_template_permissions force row level security;
alter table admin_internal.staff_bundle_assignments enable row level security;
alter table admin_internal.staff_bundle_assignments force row level security;
alter table admin_internal.staff_permission_entitlements enable row level security;
alter table admin_internal.staff_permission_entitlements force row level security;

create policy staff_bundle_templates_writer_select
  on admin_internal.staff_bundle_templates for select
  to staff_authority_write_authority using (true);
create policy staff_bundle_templates_writer_insert
  on admin_internal.staff_bundle_templates for insert
  to staff_authority_write_authority with check (true);
create policy staff_bundle_templates_writer_update
  on admin_internal.staff_bundle_templates for update
  to staff_authority_write_authority using (true) with check (true);

create policy staff_bundle_template_permissions_writer_select
  on admin_internal.staff_bundle_template_permissions for select
  to staff_authority_write_authority using (true);
create policy staff_bundle_template_permissions_writer_insert
  on admin_internal.staff_bundle_template_permissions for insert
  to staff_authority_write_authority with check (true);

create policy staff_bundle_assignments_reader_select
  on admin_internal.staff_bundle_assignments for select
  to staff_authority_context_reader using (true);
create policy staff_bundle_assignments_writer_select
  on admin_internal.staff_bundle_assignments for select
  to staff_authority_write_authority using (true);
create policy staff_bundle_assignments_writer_insert
  on admin_internal.staff_bundle_assignments for insert
  to staff_authority_write_authority with check (true);
create policy staff_bundle_assignments_writer_update
  on admin_internal.staff_bundle_assignments for update
  to staff_authority_write_authority using (true) with check (true);

create policy staff_permission_entitlements_reader_select
  on admin_internal.staff_permission_entitlements for select
  to staff_authority_context_reader using (true);
create policy staff_permission_entitlements_writer_select
  on admin_internal.staff_permission_entitlements for select
  to staff_authority_write_authority using (true);
create policy staff_permission_entitlements_writer_insert
  on admin_internal.staff_permission_entitlements for insert
  to staff_authority_write_authority with check (true);
create policy staff_permission_entitlements_writer_update
  on admin_internal.staff_permission_entitlements for update
  to staff_authority_write_authority using (true) with check (true);

revoke all on table admin_internal.staff_bundle_templates
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_bundle_template_permissions
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_bundle_assignments
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_permission_entitlements
  from public, anon, authenticated, authenticator, service_role;

-- Runtime resolution needs assignment and entitlement state only; it never reads Bundle definitions.
grant select (assignment_id, staff_account_id, status, effective_from, effective_until)
  on table admin_internal.staff_bundle_assignments to staff_authority_context_reader;
grant select (entitlement_id, staff_account_id, permission_key, source_type,
  source_bundle_assignment_id, status, effective_from, effective_until)
  on table admin_internal.staff_permission_entitlements to staff_authority_context_reader;

grant select, insert on table admin_internal.staff_bundle_templates
  to staff_authority_write_authority;
grant update (lifecycle_status, retired_at) on table admin_internal.staff_bundle_templates
  to staff_authority_write_authority;
grant select, insert on table admin_internal.staff_bundle_template_permissions
  to staff_authority_write_authority;
grant select, insert on table admin_internal.staff_bundle_assignments
  to staff_authority_write_authority;
grant update (status, effective_until, revoked_at) on table admin_internal.staff_bundle_assignments
  to staff_authority_write_authority;
grant select, insert on table admin_internal.staff_permission_entitlements
  to staff_authority_write_authority;
grant update (status, effective_until, revoked_at) on table admin_internal.staff_permission_entitlements
  to staff_authority_write_authority;

commit;
