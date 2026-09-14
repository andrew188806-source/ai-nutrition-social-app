-- RA-3-IA-P3-P6-P3A: private staff-management authority foundation.
--
-- This migration creates policy and evidence primitives only. Every management permission added
-- here is PLANNED, no staff authority is seeded, and no public management operation is exposed.

begin;

create role staff_management_reader nologin noinherit nobypassrls;
create role staff_account_write_authority nologin noinherit nobypassrls;
create role staff_bundle_assignment_authority nologin noinherit nobypassrls;
create role staff_direct_grant_authority nologin noinherit nobypassrls;
create role staff_delegation_write_authority nologin noinherit nobypassrls;
create role staff_console_admission_authority nologin noinherit nobypassrls;

comment on role staff_management_reader is
  'P3A sealed owner for future bounded staff-management reads and verified actor resolution; no login, client membership, mutation, or public RPC.';
comment on role staff_account_write_authority is
  'P3A sealed future staff-account operator owner; no login, client membership, public RPC, or authority grant.';
comment on role staff_bundle_assignment_authority is
  'P3A sealed future Bundle-assignment operator owner; no login, client membership, public RPC, or console-admission bypass.';
comment on role staff_direct_grant_authority is
  'P3A sealed future ordinary direct-grant operator owner; deliberately has no entitlement-table write and cannot grant console admission.';
comment on role staff_delegation_write_authority is
  'P3A sealed future exact-delegation operator owner; no login, client membership, public RPC, or delegation-of-delegation.';
comment on role staff_console_admission_authority is
  'P3A sealed future dedicated console-admission operator owner; separate from ordinary direct-grant authority.';

-- The frozen catalogue FORCEs RLS. Use its existing sealed writer only for the additive PLANNED
-- seeds, then remove the migration runner's temporary SET membership in this transaction.
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
set role staff_authority_write_authority;
insert into admin_internal.staff_permission_catalog (
  permission_key, lifecycle_status, readiness_status, sensitivity_class,
  individually_provisionable, temporary_grantable, ordinary_supervisor_delegable,
  privileged_only, deferred, console_admission_required
)
values
  ('admin.management.read', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.permissions.read', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.staff.read', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.staff.account.write', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.staff.bundle.write', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.staff.permission.write', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.staff.delegation.write', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false),
  ('admin.management.staff.console_admission.write', 'active', 'planned', 'SECURITY_AUTH',
    false, false, false, true, false, false);
reset role;
revoke staff_authority_write_authority from postgres granted by postgres;

create table admin_internal.staff_permission_delegations (
  delegation_id uuid not null default pg_catalog.gen_random_uuid(),
  delegate_staff_account_id uuid not null,
  permission_key text not null,
  can_grant boolean not null,
  can_revoke boolean not null,
  can_set_temporary boolean not null,
  scope_kind text not null default 'global',
  status text not null default 'active',
  effective_from timestamptz not null default pg_catalog.clock_timestamp(),
  effective_until timestamptz,
  granted_by_auth_user_id uuid not null,
  granted_by_staff_account_id uuid not null,
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_by_auth_user_id uuid,
  revoked_by_staff_account_id uuid,
  revoked_at timestamptz,
  status_version bigint not null default 0,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_permission_delegations_pkey primary key (delegation_id),
  constraint staff_permission_delegations_delegate_fkey
    foreign key (delegate_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_permission_delegations_permission_fkey
    foreign key (permission_key) references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_permission_delegations_granted_auth_fkey
    foreign key (granted_by_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_permission_delegations_granted_staff_fkey
    foreign key (granted_by_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_permission_delegations_revoked_auth_fkey
    foreign key (revoked_by_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_permission_delegations_revoked_staff_fkey
    foreign key (revoked_by_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_permission_delegations_permission_key_shape_check check (
    permission_key = pg_catalog.btrim(permission_key)
    and permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.strpos(permission_key, '*') = 0
    and pg_catalog.strpos(permission_key, '%') = 0
  ),
  constraint staff_permission_delegations_capability_check
    check (can_grant or can_revoke),
  constraint staff_permission_delegations_temporary_check
    check (not can_set_temporary or can_grant),
  constraint staff_permission_delegations_scope_check
    check (scope_kind = 'global'),
  constraint staff_permission_delegations_status_check
    check (status in ('active', 'revoked')),
  constraint staff_permission_delegations_window_check
    check (effective_until is null or effective_until > effective_from),
  constraint staff_permission_delegations_revocation_shape_check check (
    (status = 'active' and revoked_by_auth_user_id is null
      and revoked_by_staff_account_id is null and revoked_at is null)
    or
    (status = 'revoked' and revoked_by_auth_user_id is not null
      and revoked_by_staff_account_id is not null and revoked_at is not null)
  ),
  constraint staff_permission_delegations_status_version_check
    check (status_version >= 0)
);

create unique index staff_permission_delegations_active_exact_key
  on admin_internal.staff_permission_delegations
  (delegate_staff_account_id, permission_key, scope_kind)
  where status = 'active';

comment on table admin_internal.staff_permission_delegations is
  'P3A exact ordinary-supervisor delegation sources. One row governs one exact permission at GLOBAL scope; expiry is derived, revoked rows are terminal, and P3A seeds no rows.';

create function admin_internal.prevent_staff_permission_delegation_reactivation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new is distinct from old then
    raise exception using
      errcode = '23514',
      message = 'staff_permission_delegation_revoked_terminal';
  end if;
  return new;
end;
$$;

create trigger staff_permission_delegations_terminal_v1
before update on admin_internal.staff_permission_delegations
for each row execute function admin_internal.prevent_staff_permission_delegation_reactivation_v1();

create table admin_internal.staff_management_operation_receipts (
  receipt_id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  actor_staff_account_id uuid not null,
  request_id uuid not null,
  operation_kind text not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_management_operation_receipts_pkey primary key (receipt_id),
  constraint staff_management_operation_receipts_actor_request_key
    unique (actor_auth_user_id, request_id),
  constraint staff_management_operation_receipts_actor_auth_fkey
    foreign key (actor_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_management_operation_receipts_actor_staff_fkey
    foreign key (actor_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_management_operation_receipts_request_v4_check check (
    (pg_catalog.get_byte(pg_catalog.uuid_send(request_id), 6) >> 4) = 4
  ),
  constraint staff_management_operation_receipts_operation_check check (operation_kind in (
    'staff_account_link', 'staff_account_suspend', 'staff_account_reactivate',
    'staff_account_revoke', 'staff_bundle_assign', 'staff_bundle_revoke',
    'staff_permission_grant', 'staff_permission_revoke', 'staff_delegation_grant',
    'staff_delegation_revoke', 'staff_console_admission_grant',
    'staff_console_admission_revoke'
  )),
  constraint staff_management_operation_receipts_request_payload_check check (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
    and pg_catalog.octet_length(request_payload::text) <= 16384
  ),
  constraint staff_management_operation_receipts_result_payload_check check (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
    and pg_catalog.octet_length(result_payload::text) <= 16384
  )
);

create index staff_management_operation_receipts_created_idx
  on admin_internal.staff_management_operation_receipts (created_at desc, receipt_id desc);

comment on table admin_internal.staff_management_operation_receipts is
  'P3A immutable global per-actor request namespace. Canonical JSONB payload equality supports future exact replay versus request_conflict; payloads are evidence, never authority.';

create table admin_internal.staff_management_audit_log (
  event_id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  actor_staff_account_id uuid not null,
  target_staff_account_id uuid,
  operation_kind text not null,
  permission_key text,
  bundle_key text,
  bundle_revision integer,
  bundle_assignment_id uuid,
  delegation_id uuid,
  entitlement_id uuid,
  reason_code text,
  request_id uuid not null,
  outcome text not null,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_management_audit_log_pkey primary key (event_id),
  constraint staff_management_audit_log_actor_auth_fkey
    foreign key (actor_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_actor_staff_fkey
    foreign key (actor_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_target_staff_fkey
    foreign key (target_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_permission_fkey
    foreign key (permission_key) references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_bundle_revision_fkey
    foreign key (bundle_key, bundle_revision)
    references admin_internal.staff_bundle_templates (bundle_key, revision)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_bundle_assignment_fkey
    foreign key (bundle_assignment_id)
    references admin_internal.staff_bundle_assignments (assignment_id)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_delegation_fkey
    foreign key (delegation_id)
    references admin_internal.staff_permission_delegations (delegation_id)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_entitlement_fkey
    foreign key (entitlement_id)
    references admin_internal.staff_permission_entitlements (entitlement_id)
    on update restrict on delete restrict,
  constraint staff_management_audit_log_operation_check check (operation_kind in (
    'staff_account_link', 'staff_account_suspend', 'staff_account_reactivate',
    'staff_account_revoke', 'staff_bundle_assign', 'staff_bundle_revoke',
    'staff_permission_grant', 'staff_permission_revoke', 'staff_delegation_grant',
    'staff_delegation_revoke', 'staff_console_admission_grant',
    'staff_console_admission_revoke'
  )),
  constraint staff_management_audit_log_bundle_shape_check
    check ((bundle_key is null) = (bundle_revision is null)),
  constraint staff_management_audit_log_reason_check check (
    reason_code is null or (
      pg_catalog.length(reason_code) between 1 and 80
      and reason_code = pg_catalog.btrim(reason_code)
      and reason_code ~ '^[a-z][a-z0-9_]*$'
    )
  ),
  constraint staff_management_audit_log_outcome_check
    check (outcome in ('applied', 'replayed', 'rejected', 'noop')),
  constraint staff_management_audit_log_before_state_check check (
    before_state is null or (
      pg_catalog.jsonb_typeof(before_state) = 'object'
      and pg_catalog.octet_length(before_state::text) <= 16384
    )
  ),
  constraint staff_management_audit_log_after_state_check check (
    after_state is null or (
      pg_catalog.jsonb_typeof(after_state) = 'object'
      and pg_catalog.octet_length(after_state::text) <= 16384
    )
  )
);

create index staff_management_audit_log_occurred_idx
  on admin_internal.staff_management_audit_log (occurred_at desc, event_id desc);
create index staff_management_audit_log_target_occurred_idx
  on admin_internal.staff_management_audit_log
  (target_staff_account_id, occurred_at desc, event_id desc)
  where target_staff_account_id is not null;

comment on table admin_internal.staff_management_audit_log is
  'P3A append-only high-level staff-management evidence. Typed identifiers remain searchable; bounded JSONB stores supplementary before/after evidence only.';

alter table admin_internal.staff_permission_delegations enable row level security;
alter table admin_internal.staff_permission_delegations force row level security;
alter table admin_internal.staff_management_operation_receipts enable row level security;
alter table admin_internal.staff_management_operation_receipts force row level security;
alter table admin_internal.staff_management_audit_log enable row level security;
alter table admin_internal.staff_management_audit_log force row level security;

create policy staff_permission_delegations_reader_select
  on admin_internal.staff_permission_delegations for select
  to staff_management_reader using (true);
create policy staff_permission_delegations_writer_select
  on admin_internal.staff_permission_delegations for select
  to staff_delegation_write_authority using (true);
create policy staff_permission_delegations_writer_insert
  on admin_internal.staff_permission_delegations for insert
  to staff_delegation_write_authority with check (true);
create policy staff_permission_delegations_writer_update
  on admin_internal.staff_permission_delegations for update
  to staff_delegation_write_authority using (true) with check (true);

create policy staff_management_receipts_writer_select
  on admin_internal.staff_management_operation_receipts for select
  to staff_account_write_authority, staff_bundle_assignment_authority,
     staff_direct_grant_authority, staff_delegation_write_authority,
     staff_console_admission_authority using (true);
create policy staff_management_receipts_writer_insert
  on admin_internal.staff_management_operation_receipts for insert
  to staff_account_write_authority, staff_bundle_assignment_authority,
     staff_direct_grant_authority, staff_delegation_write_authority,
     staff_console_admission_authority with check (true);

create policy staff_management_audit_reader_select
  on admin_internal.staff_management_audit_log for select
  to staff_management_reader using (true);
create policy staff_management_audit_writer_insert
  on admin_internal.staff_management_audit_log for insert
  to staff_account_write_authority, staff_bundle_assignment_authority,
     staff_direct_grant_authority, staff_delegation_write_authority,
     staff_console_admission_authority with check (true);

-- The verified actor helper reads only the staff identity columns needed to return one internal ID.
create policy staff_accounts_management_reader_select
  on admin_internal.staff_accounts for select
  to staff_management_reader using (true);

revoke all on table admin_internal.staff_permission_delegations
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_management_operation_receipts
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_management_audit_log
  from public, anon, authenticated, authenticator, service_role;

grant usage on schema admin_internal to staff_management_reader;
grant usage on schema admin_internal to staff_account_write_authority;
grant usage on schema admin_internal to staff_bundle_assignment_authority;
grant usage on schema admin_internal to staff_direct_grant_authority;
grant usage on schema admin_internal to staff_delegation_write_authority;
grant usage on schema admin_internal to staff_console_admission_authority;

grant select on table admin_internal.staff_permission_delegations
  to staff_management_reader;
grant select, insert on table admin_internal.staff_permission_delegations
  to staff_delegation_write_authority;
grant update (status, revoked_by_auth_user_id, revoked_by_staff_account_id,
  revoked_at, status_version, updated_at)
  on table admin_internal.staff_permission_delegations
  to staff_delegation_write_authority;

grant select, insert on table admin_internal.staff_management_operation_receipts
  to staff_account_write_authority, staff_bundle_assignment_authority,
     staff_direct_grant_authority, staff_delegation_write_authority,
     staff_console_admission_authority;
grant select on table admin_internal.staff_management_audit_log
  to staff_management_reader;
grant insert on table admin_internal.staff_management_audit_log
  to staff_account_write_authority, staff_bundle_assignment_authority,
     staff_direct_grant_authority, staff_delegation_write_authority,
     staff_console_admission_authority;

grant select (id, auth_user_id, status, effective_from, effective_until, status_version)
  on table admin_internal.staff_accounts to staff_management_reader;
grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
set role staff_authority_context_reader;
grant execute on function admin_internal.staff_request_subject_v1()
  to staff_management_reader;
grant execute on function admin_internal.staff_effective_permissions_for_subject_v1(uuid, timestamptz)
  to staff_management_reader;
reset role;
revoke staff_authority_context_reader from postgres granted by postgres;

create function admin_internal.current_staff_management_actor_v1(
  p_required_management_permission_key text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_auth_user_id uuid;
  v_staff_account_id uuid;
  v_database_now timestamptz := pg_catalog.statement_timestamp();
begin
  if p_required_management_permission_key is null
    or p_required_management_permission_key not in (
      'admin.management.read',
      'admin.management.permissions.read',
      'admin.management.staff.read',
      'admin.management.staff.account.write',
      'admin.management.staff.bundle.write',
      'admin.management.staff.permission.write',
      'admin.management.staff.delegation.write',
      'admin.management.staff.console_admission.write'
    )
  then
    return null;
  end if;

  v_auth_user_id := admin_internal.staff_request_subject_v1();
  if v_auth_user_id is null then return null; end if;

  select account.id into v_staff_account_id
  from admin_internal.staff_accounts account
  where account.auth_user_id = v_auth_user_id
    and account.status = 'active'
    and account.effective_from <= v_database_now
    and (account.effective_until is null or v_database_now < account.effective_until);
  if not found then return null; end if;

  if not exists (
    select 1
    from admin_internal.staff_effective_permissions_for_subject_v1(
      v_auth_user_id, v_database_now
    ) effective
    where effective.permission_key = p_required_management_permission_key
  ) then
    return null;
  end if;

  return v_staff_account_id;
end;
$$;

comment on function admin_internal.current_staff_management_actor_v1(text) is
  'P3A private exact-management-actor resolver. Actor derives only from the request JWT subject and must hold the requested exact effective management permission; all P3A management keys are PLANNED and therefore resolve to no authority.';

revoke all on function admin_internal.prevent_staff_permission_delegation_reactivation_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.current_staff_management_actor_v1(text)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function admin_internal.current_staff_management_actor_v1(text)
  to staff_account_write_authority, staff_bundle_assignment_authority,
     staff_direct_grant_authority, staff_delegation_write_authority,
     staff_console_admission_authority;

grant staff_management_reader to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_management_reader;
alter function admin_internal.current_staff_management_actor_v1(text)
  owner to staff_management_reader;
revoke create on schema admin_internal from staff_management_reader;
revoke staff_management_reader from postgres granted by postgres;

-- No role receives entitlement-table mutation here. The direct and console authorities remain
-- structurally separate until later exact operator functions own their respective write paths.

commit;
