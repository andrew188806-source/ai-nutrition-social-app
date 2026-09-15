-- RA-3-IA-P3-P6-P3G: database-owner break-glass bootstrap and recovery control plane.
--
-- This is an out-of-band exception, not an application permission lane. It seeds no principal,
-- account, activation, entitlement, or permission. Only session_user=postgres may call the private
-- control functions, and every activation is finite and bound to four exact temporary sources.
-- HIGH_PRIVILEGE_STEP_UP_STILL_DEFERRED_TO_P3H
-- DO_NOT_OPERATIONALLY_BOOTSTRAP_REAL_PRIMARY_BEFORE_P3H_ACCEPTANCE
-- BREAK_GLASS_PRINCIPAL_NOT_SEEDED

begin;

create role staff_break_glass_control_authority
  nologin
  noinherit
  nobypassrls;

comment on role staff_break_glass_control_authority is
  'P3G sealed database-owner emergency control-plane authority. No login, client membership, inherited authority, RLS bypass, public RPC, or everyday application permission.';

create table admin_internal.staff_break_glass_principals (
  principal_id uuid not null default pg_catalog.gen_random_uuid(),
  auth_user_id uuid not null,
  staff_account_id uuid not null,
  status text not null default 'active',
  status_version bigint not null default 0,
  enrolled_at timestamptz not null default pg_catalog.clock_timestamp(),
  enrolled_by_db_role text not null,
  enroll_reason_code text not null,
  revoked_at timestamptz,
  revoked_by_db_role text,
  revoke_reason_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_break_glass_principals_pkey primary key (principal_id),
  constraint staff_break_glass_principals_auth_user_fkey
    foreign key (auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_break_glass_principals_staff_account_fkey
    foreign key (staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_break_glass_principals_status_check
    check (status in ('active', 'revoked')),
  constraint staff_break_glass_principals_status_version_check
    check (status_version >= 0),
  constraint staff_break_glass_principals_identity_check
    check (pg_catalog.length(enrolled_by_db_role) between 1 and 63),
  constraint staff_break_glass_principals_enroll_reason_check check (
    pg_catalog.length(enroll_reason_code) between 1 and 80
    and enroll_reason_code = pg_catalog.btrim(enroll_reason_code)
    and enroll_reason_code ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint staff_break_glass_principals_revoke_reason_check check (
    revoke_reason_code is null or (
      pg_catalog.length(revoke_reason_code) between 1 and 80
      and revoke_reason_code = pg_catalog.btrim(revoke_reason_code)
      and revoke_reason_code ~ '^[a-z][a-z0-9_]*$'
    )
  ),
  constraint staff_break_glass_principals_revocation_shape_check check (
    (status = 'active' and revoked_at is null and revoked_by_db_role is null
      and revoke_reason_code is null)
    or
    (status = 'revoked' and revoked_at is not null and revoked_by_db_role is not null
      and revoke_reason_code is not null)
  )
);

create unique index staff_break_glass_principals_active_auth_key
  on admin_internal.staff_break_glass_principals (auth_user_id)
  where status = 'active';
create unique index staff_break_glass_principals_active_staff_key
  on admin_internal.staff_break_glass_principals (staff_account_id)
  where status = 'active';
create index staff_break_glass_principals_history_idx
  on admin_internal.staff_break_glass_principals (auth_user_id, created_at desc, principal_id);

create table admin_internal.staff_break_glass_activations (
  activation_id uuid not null default pg_catalog.gen_random_uuid(),
  principal_id uuid not null,
  status text not null default 'active',
  status_version bigint not null default 0,
  effective_from timestamptz not null,
  effective_until timestamptz not null,
  opened_at timestamptz not null,
  opened_by_db_role text not null,
  open_reason_code text not null,
  last_extended_at timestamptz,
  last_extended_by_db_role text,
  last_extend_reason_code text,
  closed_at timestamptz,
  closed_by_db_role text,
  close_reason_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_break_glass_activations_pkey primary key (activation_id),
  constraint staff_break_glass_activations_principal_fkey
    foreign key (principal_id)
    references admin_internal.staff_break_glass_principals (principal_id)
    on update restrict on delete restrict,
  constraint staff_break_glass_activations_status_check
    check (status in ('active', 'closed')),
  constraint staff_break_glass_activations_status_version_check
    check (status_version >= 0),
  constraint staff_break_glass_activations_window_check check (
    effective_until > effective_from
    and effective_until <= effective_from + interval '2 hours'
  ),
  constraint staff_break_glass_activations_open_reason_check check (
    pg_catalog.length(open_reason_code) between 1 and 80
    and open_reason_code = pg_catalog.btrim(open_reason_code)
    and open_reason_code ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint staff_break_glass_activations_extend_shape_check check (
    (last_extended_at is null and last_extended_by_db_role is null
      and last_extend_reason_code is null)
    or
    (last_extended_at is not null and last_extended_by_db_role is not null
      and pg_catalog.length(last_extend_reason_code) between 1 and 80
      and last_extend_reason_code = pg_catalog.btrim(last_extend_reason_code)
      and last_extend_reason_code ~ '^[a-z][a-z0-9_]*$')
  ),
  constraint staff_break_glass_activations_close_shape_check check (
    (status = 'active' and closed_at is null and closed_by_db_role is null
      and close_reason_code is null)
    or
    (status = 'closed' and closed_at is not null and closed_by_db_role is not null
      and pg_catalog.length(close_reason_code) between 1 and 80
      and close_reason_code = pg_catalog.btrim(close_reason_code)
      and close_reason_code ~ '^[a-z][a-z0-9_]*$')
  )
);

create unique index staff_break_glass_activations_active_principal_key
  on admin_internal.staff_break_glass_activations (principal_id)
  where status = 'active';
create index staff_break_glass_activations_history_idx
  on admin_internal.staff_break_glass_activations (principal_id, created_at desc, activation_id);

create table admin_internal.staff_break_glass_activation_grants (
  activation_grant_id uuid not null default pg_catalog.gen_random_uuid(),
  activation_id uuid not null,
  entitlement_id uuid not null,
  permission_key text not null,
  status text not null default 'active',
  status_version bigint not null default 0,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  revoked_by_db_role text,
  constraint staff_break_glass_activation_grants_pkey primary key (activation_grant_id),
  constraint staff_break_glass_activation_grants_activation_permission_key
    unique (activation_id, permission_key),
  constraint staff_break_glass_activation_grants_entitlement_key unique (entitlement_id),
  constraint staff_break_glass_activation_grants_activation_fkey
    foreign key (activation_id)
    references admin_internal.staff_break_glass_activations (activation_id)
    on update restrict on delete restrict,
  constraint staff_break_glass_activation_grants_entitlement_fkey
    foreign key (entitlement_id)
    references admin_internal.staff_permission_entitlements (entitlement_id)
    on update restrict on delete restrict,
  constraint staff_break_glass_activation_grants_permission_fkey
    foreign key (permission_key)
    references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_break_glass_activation_grants_permission_check check (
    permission_key in (
      'admin_context.read',
      'admin.management.staff.account.write',
      'admin.management.staff.console_admission.write',
      'admin.management.staff.permission.write'
    )
  ),
  constraint staff_break_glass_activation_grants_status_check
    check (status in ('active', 'revoked')),
  constraint staff_break_glass_activation_grants_status_version_check
    check (status_version >= 0),
  constraint staff_break_glass_activation_grants_revocation_shape_check check (
    (status = 'active' and revoked_at is null and revoked_by_db_role is null)
    or
    (status = 'revoked' and revoked_at is not null and revoked_by_db_role is not null)
  )
);

create index staff_break_glass_activation_grants_history_idx
  on admin_internal.staff_break_glass_activation_grants
  (activation_id, status, permission_key, activation_grant_id);

create table admin_internal.staff_break_glass_control_receipts (
  operator_db_role text not null,
  request_id uuid not null,
  operation_kind text not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_break_glass_control_receipts_pkey
    primary key (operator_db_role, request_id),
  constraint staff_break_glass_control_receipts_request_v4_check check (
    (pg_catalog.get_byte(pg_catalog.uuid_send(request_id), 6) >> 4) = 4
  ),
  constraint staff_break_glass_control_receipts_operation_check check (
    operation_kind in (
      'principal_enroll', 'principal_revoke', 'activation_open',
      'activation_extend', 'activation_close'
    )
  ),
  constraint staff_break_glass_control_receipts_payload_check check (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
    and pg_catalog.octet_length(request_payload::text) <= 16384
  ),
  constraint staff_break_glass_control_receipts_result_check check (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
    and pg_catalog.octet_length(result_payload::text) <= 16384
  )
);

create index staff_break_glass_control_receipts_created_idx
  on admin_internal.staff_break_glass_control_receipts (created_at desc, request_id);

create table admin_internal.staff_break_glass_audit_log (
  event_id uuid not null default pg_catalog.gen_random_uuid(),
  operator_db_role text not null,
  operation_kind text not null,
  principal_id uuid,
  activation_id uuid,
  auth_user_id uuid,
  staff_account_id uuid,
  request_id uuid not null,
  reason_code text not null,
  outcome text not null,
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_break_glass_audit_log_pkey primary key (event_id),
  constraint staff_break_glass_audit_log_principal_fkey
    foreign key (principal_id)
    references admin_internal.staff_break_glass_principals (principal_id)
    on update restrict on delete restrict,
  constraint staff_break_glass_audit_log_activation_fkey
    foreign key (activation_id)
    references admin_internal.staff_break_glass_activations (activation_id)
    on update restrict on delete restrict,
  constraint staff_break_glass_audit_log_auth_user_fkey
    foreign key (auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_break_glass_audit_log_staff_account_fkey
    foreign key (staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_break_glass_audit_log_request_v4_check check (
    (pg_catalog.get_byte(pg_catalog.uuid_send(request_id), 6) >> 4) = 4
  ),
  constraint staff_break_glass_audit_log_operation_check check (
    operation_kind in (
      'principal_enroll', 'principal_revoke', 'activation_open',
      'activation_extend', 'activation_close'
    )
  ),
  constraint staff_break_glass_audit_log_reason_check check (
    pg_catalog.length(reason_code) between 1 and 80
    and reason_code = pg_catalog.btrim(reason_code)
    and reason_code ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint staff_break_glass_audit_log_outcome_check
    check (outcome in ('applied', 'replayed', 'rejected')),
  constraint staff_break_glass_audit_log_before_check check (
    before_state is null or (
      pg_catalog.jsonb_typeof(before_state) = 'object'
      and pg_catalog.octet_length(before_state::text) <= 16384)
  ),
  constraint staff_break_glass_audit_log_after_check check (
    after_state is null or (
      pg_catalog.jsonb_typeof(after_state) = 'object'
      and pg_catalog.octet_length(after_state::text) <= 16384)
  )
);

create index staff_break_glass_audit_log_occurred_idx
  on admin_internal.staff_break_glass_audit_log (occurred_at desc, event_id desc);

comment on table admin_internal.staff_break_glass_principals is
  'P3G history-preserving registry. Enrollment alone grants zero authority; revoked rows are terminal and re-enrollment creates a new principal.';
comment on table admin_internal.staff_break_glass_activations is
  'P3G finite emergency sessions: 30-minute default, exact 30-minute extensions, and an absolute two-hour continuous cap.';
comment on table admin_internal.staff_break_glass_activation_grants is
  'Exact provenance binding one P3G activation to exactly four finite direct-grant entitlements.';
comment on table admin_internal.staff_break_glass_control_receipts is
  'P3G global per-database-operator UUIDv4 idempotency evidence.';
comment on table admin_internal.staff_break_glass_audit_log is
  'Append-only P3G operator evidence. It stores bounded reason codes and identifiers, never credentials or free-form secrets.';

alter table admin_internal.staff_break_glass_principals enable row level security;
alter table admin_internal.staff_break_glass_principals force row level security;
alter table admin_internal.staff_break_glass_activations enable row level security;
alter table admin_internal.staff_break_glass_activations force row level security;
alter table admin_internal.staff_break_glass_activation_grants enable row level security;
alter table admin_internal.staff_break_glass_activation_grants force row level security;
alter table admin_internal.staff_break_glass_control_receipts enable row level security;
alter table admin_internal.staff_break_glass_control_receipts force row level security;
alter table admin_internal.staff_break_glass_audit_log enable row level security;
alter table admin_internal.staff_break_glass_audit_log force row level security;

create policy staff_break_glass_principals_control_select
  on admin_internal.staff_break_glass_principals for select
  to staff_break_glass_control_authority using (true);
create policy staff_break_glass_principals_control_insert
  on admin_internal.staff_break_glass_principals for insert
  to staff_break_glass_control_authority with check (true);
create policy staff_break_glass_principals_control_update
  on admin_internal.staff_break_glass_principals for update
  to staff_break_glass_control_authority using (true) with check (true);

create policy staff_break_glass_activations_control_select
  on admin_internal.staff_break_glass_activations for select
  to staff_break_glass_control_authority using (true);
create policy staff_break_glass_activations_control_insert
  on admin_internal.staff_break_glass_activations for insert
  to staff_break_glass_control_authority with check (true);
create policy staff_break_glass_activations_control_update
  on admin_internal.staff_break_glass_activations for update
  to staff_break_glass_control_authority using (true) with check (true);

create policy staff_break_glass_activation_grants_control_select
  on admin_internal.staff_break_glass_activation_grants for select
  to staff_break_glass_control_authority using (true);
create policy staff_break_glass_activation_grants_control_insert
  on admin_internal.staff_break_glass_activation_grants for insert
  to staff_break_glass_control_authority with check (true);
create policy staff_break_glass_activation_grants_control_update
  on admin_internal.staff_break_glass_activation_grants for update
  to staff_break_glass_control_authority using (true) with check (true);

create policy staff_break_glass_receipts_control_select
  on admin_internal.staff_break_glass_control_receipts for select
  to staff_break_glass_control_authority using (true);
create policy staff_break_glass_receipts_control_insert
  on admin_internal.staff_break_glass_control_receipts for insert
  to staff_break_glass_control_authority with check (true);
create policy staff_break_glass_audit_control_select
  on admin_internal.staff_break_glass_audit_log for select
  to staff_break_glass_control_authority using (true);
create policy staff_break_glass_audit_control_insert
  on admin_internal.staff_break_glass_audit_log for insert
  to staff_break_glass_control_authority with check (true);

-- Existing frozen staff tables receive only the minimum new role policies. The staff account
-- role path deliberately has no UPDATE policy or UPDATE grant.
create policy staff_accounts_break_glass_control_select
  on admin_internal.staff_accounts for select
  to staff_break_glass_control_authority using (true);
create policy staff_accounts_break_glass_control_insert
  on admin_internal.staff_accounts for insert
  to staff_break_glass_control_authority with check (
    auth_user_id::text = pg_catalog.current_setting(
      'tastkind.break_glass.enroll_auth_user_id', true)
    and status = 'active'
    and effective_until is null
    and status_version = 0
  );
create policy staff_permission_catalog_break_glass_control_select
  on admin_internal.staff_permission_catalog for select
  to staff_break_glass_control_authority using (true);
create policy staff_permission_entitlements_break_glass_control_select
  on admin_internal.staff_permission_entitlements for select
  to staff_break_glass_control_authority using (true);
create policy staff_permission_entitlements_break_glass_control_insert
  on admin_internal.staff_permission_entitlements for insert
  to staff_break_glass_control_authority with check (
    source_type = 'direct_grant'
    and source_bundle_assignment_id is null
    and status = 'active'
    and effective_until is not null
    and permission_key in (
      'admin_context.read',
      'admin.management.staff.account.write',
      'admin.management.staff.console_admission.write',
      'admin.management.staff.permission.write'
    )
    and exists (
      select 1
      from admin_internal.staff_break_glass_activations activation
      join admin_internal.staff_break_glass_principals principal
        on principal.principal_id = activation.principal_id
      where activation.activation_id::text = pg_catalog.current_setting(
          'tastkind.break_glass.activation_id', true)
        and activation.status = 'active'
        and principal.status = 'active'
        and principal.staff_account_id = staff_permission_entitlements.staff_account_id
        and activation.effective_from = staff_permission_entitlements.effective_from
        and activation.effective_until = staff_permission_entitlements.effective_until
    )
  );
create policy staff_permission_entitlements_break_glass_control_update
  on admin_internal.staff_permission_entitlements for update
  to staff_break_glass_control_authority using (
    source_type = 'direct_grant'
    and source_bundle_assignment_id is null
    and exists (
      select 1
      from admin_internal.staff_break_glass_activation_grants activation_grant
      where activation_grant.entitlement_id = staff_permission_entitlements.entitlement_id
    )
  ) with check (source_type = 'direct_grant' and source_bundle_assignment_id is null);

revoke all on table admin_internal.staff_break_glass_principals
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_break_glass_activations
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_break_glass_activation_grants
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_break_glass_control_receipts
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_break_glass_audit_log
  from public, anon, authenticated, authenticator, service_role;

grant usage on schema admin_internal to staff_break_glass_control_authority;
grant select (id, auth_user_id, status, effective_from, effective_until, status_version,
    created_at, updated_at),
  insert (auth_user_id, status, effective_from, effective_until, status_version, created_at, updated_at),
  references (id)
  on table admin_internal.staff_accounts to staff_break_glass_control_authority;
grant select on table admin_internal.staff_permission_catalog
  to staff_break_glass_control_authority;
grant select (entitlement_id, staff_account_id, permission_key, source_type,
    source_bundle_assignment_id, status, effective_from, effective_until, created_at, revoked_at),
  insert (entitlement_id, staff_account_id, permission_key, source_type,
    source_bundle_assignment_id, status, effective_from, effective_until, created_at),
  update (status, effective_until, revoked_at), references (entitlement_id)
  on table admin_internal.staff_permission_entitlements
  to staff_break_glass_control_authority;
grant select, insert on table admin_internal.staff_break_glass_principals,
  admin_internal.staff_break_glass_activations,
  admin_internal.staff_break_glass_activation_grants,
  admin_internal.staff_break_glass_control_receipts,
  admin_internal.staff_break_glass_audit_log
  to staff_break_glass_control_authority;
grant update (status, status_version, revoked_at, revoked_by_db_role,
    revoke_reason_code, updated_at)
  on table admin_internal.staff_break_glass_principals
  to staff_break_glass_control_authority;
grant update (status, status_version, effective_until, last_extended_at,
    last_extended_by_db_role, last_extend_reason_code, closed_at,
    closed_by_db_role, close_reason_code, updated_at)
  on table admin_internal.staff_break_glass_activations
  to staff_break_glass_control_authority;
grant update (status, status_version, revoked_at, revoked_by_db_role, updated_at)
  on table admin_internal.staff_break_glass_activation_grants
  to staff_break_glass_control_authority;

create function admin_internal.staff_break_glass_validate_mutation_input_v1(
  p_reason_code text,
  p_request_id uuid
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_reason_code is null
    or pg_catalog.length(p_reason_code) not between 1 and 80
    or p_reason_code <> pg_catalog.btrim(p_reason_code)
    or p_reason_code !~ '^[a-z][a-z0-9_]*$'
  then
    raise exception using errcode = '22023', message = 'invalid_reason_code';
  end if;
  if p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
  then
    raise exception using errcode = '22023', message = 'request_id_must_be_uuid_v4';
  end if;
end;
$$;

create function admin_internal.staff_break_glass_prior_result_v1(
  p_operation_kind text,
  p_request_id uuid,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_prior admin_internal.staff_break_glass_control_receipts%rowtype;
begin
  select receipt.* into v_prior
  from admin_internal.staff_break_glass_control_receipts receipt
  where receipt.operator_db_role = session_user
    and receipt.request_id = p_request_id;
  if not found then return null; end if;
  if v_prior.operation_kind <> p_operation_kind
    or v_prior.request_payload is distinct from p_request_payload
  then
    raise exception using errcode = '23505', message = 'request_conflict';
  end if;
  return v_prior.result_payload;
end;
$$;

create function admin_internal.prevent_staff_break_glass_principal_reactivation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514', message = 'break_glass_principal_revoked_terminal';
  end if;
  if new.auth_user_id is distinct from old.auth_user_id
    or new.staff_account_id is distinct from old.staff_account_id
    or new.enrolled_at is distinct from old.enrolled_at
    or new.enrolled_by_db_role is distinct from old.enrolled_by_db_role
    or new.enroll_reason_code is distinct from old.enroll_reason_code
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'break_glass_principal_identity_immutable';
  end if;
  return new;
end;
$$;

create trigger staff_break_glass_principals_terminal_v1
before update on admin_internal.staff_break_glass_principals
for each row execute function admin_internal.prevent_staff_break_glass_principal_reactivation_v1();

create function admin_internal.prevent_staff_break_glass_activation_reactivation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.status = 'closed' and new is distinct from old then
    raise exception using errcode = '23514', message = 'break_glass_activation_closed_terminal';
  end if;
  if new.principal_id is distinct from old.principal_id
    or new.effective_from is distinct from old.effective_from
    or new.opened_at is distinct from old.opened_at
    or new.opened_by_db_role is distinct from old.opened_by_db_role
    or new.open_reason_code is distinct from old.open_reason_code
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'break_glass_activation_identity_immutable';
  end if;
  if new.effective_until < old.effective_until
    or new.effective_until > old.effective_until + interval '30 minutes'
    or new.effective_until > old.effective_from + interval '2 hours'
  then
    raise exception using errcode = '23514', message = 'break_glass_activation_extension_invalid';
  end if;
  return new;
end;
$$;

create trigger staff_break_glass_activations_terminal_v1
before update on admin_internal.staff_break_glass_activations
for each row execute function admin_internal.prevent_staff_break_glass_activation_reactivation_v1();

create function admin_internal.prevent_staff_break_glass_activation_grant_reactivation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514', message = 'break_glass_activation_grant_revoked_terminal';
  end if;
  if new.activation_id is distinct from old.activation_id
    or new.entitlement_id is distinct from old.entitlement_id
    or new.permission_key is distinct from old.permission_key
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'break_glass_activation_grant_identity_immutable';
  end if;
  return new;
end;
$$;

create trigger staff_break_glass_activation_grants_terminal_v1
before update on admin_internal.staff_break_glass_activation_grants
for each row execute function admin_internal.prevent_staff_break_glass_activation_grant_reactivation_v1();

create function admin_internal.prevent_staff_break_glass_evidence_mutation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'break_glass_evidence_append_only';
end;
$$;

create trigger staff_break_glass_receipts_append_only_v1
before update or delete on admin_internal.staff_break_glass_control_receipts
for each row execute function admin_internal.prevent_staff_break_glass_evidence_mutation_v1();
create trigger staff_break_glass_audit_append_only_v1
before update or delete on admin_internal.staff_break_glass_audit_log
for each row execute function admin_internal.prevent_staff_break_glass_evidence_mutation_v1();

create function admin_internal.assert_staff_break_glass_activation_grant_consistency_v1(
  p_activation_grant_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_row record;
begin
  select grant_row.status as grant_status,
    grant_row.permission_key as grant_permission_key,
    activation.status as activation_status,
    activation.effective_from as activation_effective_from,
    activation.effective_until as activation_effective_until,
    principal.staff_account_id as principal_staff_account_id,
    entitlement.staff_account_id as entitlement_staff_account_id,
    entitlement.permission_key as entitlement_permission_key,
    entitlement.source_type as entitlement_source_type,
    entitlement.source_bundle_assignment_id,
    entitlement.status as entitlement_status,
    entitlement.effective_from as entitlement_effective_from,
    entitlement.effective_until as entitlement_effective_until
  into v_row
  from admin_internal.staff_break_glass_activation_grants grant_row
  join admin_internal.staff_break_glass_activations activation
    on activation.activation_id = grant_row.activation_id
  join admin_internal.staff_break_glass_principals principal
    on principal.principal_id = activation.principal_id
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.entitlement_id = grant_row.entitlement_id
  where grant_row.activation_grant_id = p_activation_grant_id;
  if not found
    or v_row.entitlement_staff_account_id <> v_row.principal_staff_account_id
    or v_row.entitlement_permission_key <> v_row.grant_permission_key
    or v_row.entitlement_source_type <> 'direct_grant'
    or v_row.source_bundle_assignment_id is not null
    or v_row.entitlement_effective_from <> v_row.activation_effective_from
    or v_row.entitlement_effective_until <> v_row.activation_effective_until
    or (v_row.grant_status = 'active' and (
      v_row.activation_status <> 'active' or v_row.entitlement_status <> 'active'))
    or (v_row.grant_status = 'revoked' and (
      v_row.activation_status <> 'closed' or v_row.entitlement_status <> 'revoked'))
  then
    raise exception using errcode = '23514', message = 'break_glass_activation_grant_mismatch';
  end if;
end;
$$;

create function admin_internal.enforce_staff_break_glass_activation_grant_consistency_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  perform admin_internal.assert_staff_break_glass_activation_grant_consistency_v1(
    new.activation_grant_id);
  return new;
end;
$$;

create constraint trigger staff_break_glass_activation_grants_consistency_v1
after insert or update on admin_internal.staff_break_glass_activation_grants
deferrable initially deferred
for each row execute function admin_internal.enforce_staff_break_glass_activation_grant_consistency_v1();

create function admin_internal.enforce_staff_break_glass_activation_consistency_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_total integer;
  v_consistent integer;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  select pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where
      (new.status = 'active' and grant_row.status = 'active' and entitlement.status = 'active')
      or
      (new.status = 'closed' and grant_row.status = 'revoked' and entitlement.status = 'revoked')
    )::integer
  into v_total, v_consistent
  from admin_internal.staff_break_glass_activation_grants grant_row
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.entitlement_id = grant_row.entitlement_id
  where grant_row.activation_id = new.activation_id;
  if v_total <> 4 or v_consistent <> 4 then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;
  return new;
end;
$$;

create constraint trigger staff_break_glass_activations_consistency_v1
after insert or update on admin_internal.staff_break_glass_activations
deferrable initially deferred
for each row execute function admin_internal.enforce_staff_break_glass_activation_consistency_v1();

create function admin_internal.enforce_staff_break_glass_entitlement_consistency_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_activation_grant_id uuid;
begin
  select grant_row.activation_grant_id into v_activation_grant_id
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.entitlement_id = new.entitlement_id;
  if found then
    if session_user <> 'postgres' then
      raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
    end if;
    perform admin_internal.assert_staff_break_glass_activation_grant_consistency_v1(
      v_activation_grant_id);
  end if;
  return new;
end;
$$;

create constraint trigger staff_break_glass_entitlements_consistency_v1
after insert or update on admin_internal.staff_permission_entitlements
deferrable initially deferred
for each row execute function admin_internal.enforce_staff_break_glass_entitlement_consistency_v1();

-- These two lock-only helpers run under the frozen staff-authority writer. They expose no mutation
-- and let the P3G role coordinate with P3B lifecycle and catalogue writers without receiving UPDATE.
create function admin_internal.staff_break_glass_lock_staff_account_v1(
  p_staff_account_id uuid,
  p_auth_user_id uuid
)
returns table (
  id uuid, auth_user_id uuid, status text, effective_from timestamptz,
  effective_until timestamptz, status_version bigint,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  if (p_staff_account_id is null) = (p_auth_user_id is null) then
    raise exception using errcode = '22023', message = 'staff_lock_target_invalid';
  end if;
  return query
  select account.id, account.auth_user_id, account.status, account.effective_from,
    account.effective_until, account.status_version, account.created_at, account.updated_at
  from admin_internal.staff_accounts account
  where (p_staff_account_id is not null and account.id = p_staff_account_id)
    or (p_auth_user_id is not null and account.auth_user_id = p_auth_user_id)
  for update;
end;
$$;

create function admin_internal.staff_break_glass_assert_root_contract_v1()
returns void
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_permission record;
  v_count integer := 0;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  for v_permission in
    select permission.*
    from admin_internal.staff_permission_catalog permission
    where permission.permission_key in (
      'admin_context.read',
      'admin.management.staff.account.write',
      'admin.management.staff.console_admission.write',
      'admin.management.staff.permission.write'
    )
    order by permission.permission_key
    for update
  loop
    v_count := v_count + 1;
    if v_permission.lifecycle_status <> 'active'
      or v_permission.readiness_status <> 'current'
      or v_permission.deferred
      or (v_permission.permission_key = 'admin_context.read' and (
        not v_permission.console_admission_required
        or v_permission.privileged_only
        or v_permission.ordinary_supervisor_delegable))
      or (v_permission.permission_key <> 'admin_context.read' and (
        not v_permission.privileged_only
        or v_permission.console_admission_required
        or v_permission.ordinary_supervisor_delegable))
    then
      raise exception using errcode = '23514', message = 'root_contract_invalid';
    end if;
  end loop;
  if v_count <> 4 then
    raise exception using errcode = '23514', message = 'root_contract_invalid';
  end if;
end;
$$;

create function admin_internal.staff_break_glass_reap_expired_activation_v1(
  p_activation_id uuid,
  p_operation_time timestamptz
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_activation admin_internal.staff_break_glass_activations%rowtype;
  v_count integer;
begin
  select activation.* into v_activation
  from admin_internal.staff_break_glass_activations activation
  where activation.activation_id = p_activation_id
  for update;
  if not found or v_activation.status <> 'active'
    or p_operation_time < v_activation.effective_until
  then
    return false;
  end if;

  perform grant_row.activation_grant_id
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.activation_id = p_activation_id
  order by grant_row.activation_grant_id
  for update;
  perform entitlement.entitlement_id
  from admin_internal.staff_permission_entitlements entitlement
  join admin_internal.staff_break_glass_activation_grants grant_row
    on grant_row.entitlement_id = entitlement.entitlement_id
  where grant_row.activation_id = p_activation_id
  order by entitlement.entitlement_id
  for update of entitlement;

  update admin_internal.staff_permission_entitlements entitlement
  set status = 'revoked', revoked_at = p_operation_time
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.activation_id = p_activation_id
    and grant_row.entitlement_id = entitlement.entitlement_id
    and grant_row.status = 'active'
    and entitlement.status = 'active';
  get diagnostics v_count = row_count;
  if v_count <> 4 then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;

  update admin_internal.staff_break_glass_activation_grants
  set status = 'revoked', status_version = status_version + 1,
    revoked_at = p_operation_time, revoked_by_db_role = session_user,
    updated_at = p_operation_time
  where activation_id = p_activation_id and status = 'active';

  update admin_internal.staff_break_glass_activations
  set status = 'closed', status_version = status_version + 1,
    closed_at = p_operation_time, closed_by_db_role = session_user,
    close_reason_code = 'natural_expiry_reap', updated_at = p_operation_time
  where activation_id = p_activation_id and status = 'active';
  return true;
end;
$$;

create function admin_internal.staff_break_glass_enroll_principal_v1(
  p_auth_user_id uuid,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_payload jsonb;
  v_prior jsonb;
  v_staff admin_internal.staff_accounts%rowtype;
  v_principal_id uuid;
  v_result jsonb;
  v_active_count integer;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  perform admin_internal.staff_break_glass_validate_mutation_input_v1(
    p_reason_code, p_request_id);
  if p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'target_not_found';
  end if;
  v_payload := pg_catalog.jsonb_build_object(
    'auth_user_id', p_auth_user_id, 'reason_code', p_reason_code);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_request:' || session_user || ':' || p_request_id::text, 0));
  v_prior := admin_internal.staff_break_glass_prior_result_v1(
    'principal_enroll', p_request_id, v_payload);
  if v_prior is not null then return v_prior; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_principal_capacity', 0));
  select locked.* into v_staff
  from admin_internal.staff_break_glass_lock_staff_account_v1(null, p_auth_user_id) locked;
  if not found then
    perform pg_catalog.set_config(
      'tastkind.break_glass.enroll_auth_user_id', p_auth_user_id::text, true);
    begin
      insert into admin_internal.staff_accounts (
        auth_user_id, status, effective_from, effective_until, status_version,
        created_at, updated_at
      ) values (
        p_auth_user_id, 'active', v_now, null, 0, v_now, v_now
      ) returning * into v_staff;
    exception
      when foreign_key_violation then
        raise exception using errcode = 'P0002', message = 'target_not_found';
      when unique_violation then
        select locked.* into v_staff
        from admin_internal.staff_break_glass_lock_staff_account_v1(
          null, p_auth_user_id) locked;
        if not found then
          raise exception using errcode = '23505', message = 'principal_exists';
        end if;
    end;
  end if;
  if v_staff.status <> 'active'
    or v_staff.effective_from > v_now
    or (v_staff.effective_until is not null and v_now >= v_staff.effective_until)
  then
    raise exception using errcode = '55000', message = 'staff_account_not_effective';
  end if;

  if exists (
    select 1 from admin_internal.staff_break_glass_principals principal
    where principal.status = 'active'
      and (principal.auth_user_id = p_auth_user_id
        or principal.staff_account_id = v_staff.id)
  ) then
    raise exception using errcode = '23505', message = 'principal_exists';
  end if;
  select pg_catalog.count(*)::integer into v_active_count
  from admin_internal.staff_break_glass_principals principal
  where principal.status = 'active';
  if v_active_count >= 2 then
    raise exception using errcode = '54000', message = 'principal_capacity_reached';
  end if;

  insert into admin_internal.staff_break_glass_principals (
    auth_user_id, staff_account_id, status, status_version,
    enrolled_at, enrolled_by_db_role, enroll_reason_code, created_at, updated_at
  ) values (
    p_auth_user_id, v_staff.id, 'active', 0,
    v_now, session_user, p_reason_code, v_now, v_now
  ) returning principal_id into v_principal_id;

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'principal_enroll', 'outcome', 'applied',
    'principal_id', v_principal_id, 'auth_user_id', p_auth_user_id,
    'staff_account_id', v_staff.id, 'status', 'active', 'status_version', 0,
    'enrolled_at', v_now);
  insert into admin_internal.staff_break_glass_control_receipts
    (operator_db_role, request_id, operation_kind, request_payload, result_payload, created_at)
  values (session_user, p_request_id, 'principal_enroll', v_payload, v_result, v_now);
  insert into admin_internal.staff_break_glass_audit_log (
    operator_db_role, operation_kind, principal_id, auth_user_id, staff_account_id,
    request_id, reason_code, outcome, before_state, after_state, occurred_at
  ) values (
    session_user, 'principal_enroll', v_principal_id, p_auth_user_id, v_staff.id,
    p_request_id, p_reason_code, 'applied', null, v_result, v_now
  );
  return v_result;
end;
$$;

create function admin_internal.staff_break_glass_revoke_principal_v1(
  p_principal_id uuid,
  p_expected_status_version bigint,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_payload jsonb;
  v_prior jsonb;
  v_principal admin_internal.staff_break_glass_principals%rowtype;
  v_activation admin_internal.staff_break_glass_activations%rowtype;
  v_before jsonb;
  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  perform admin_internal.staff_break_glass_validate_mutation_input_v1(
    p_reason_code, p_request_id);
  v_payload := pg_catalog.jsonb_build_object(
    'principal_id', p_principal_id, 'expected_status_version', p_expected_status_version,
    'reason_code', p_reason_code);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_request:' || session_user || ':' || p_request_id::text, 0));
  v_prior := admin_internal.staff_break_glass_prior_result_v1(
    'principal_revoke', p_request_id, v_payload);
  if v_prior is not null then return v_prior; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_principal_capacity', 0));

  select principal.* into v_principal
  from admin_internal.staff_break_glass_principals principal
  where principal.principal_id = p_principal_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'principal_not_found';
  end if;
  if v_principal.status <> 'active' then
    raise exception using errcode = '55000', message = 'principal_not_active';
  end if;
  if v_principal.status_version <> p_expected_status_version then
    raise exception using errcode = '40001', message = 'stale_state';
  end if;

  select activation.* into v_activation
  from admin_internal.staff_break_glass_activations activation
  where activation.principal_id = p_principal_id and activation.status = 'active'
  for update;
  if found and v_now < v_activation.effective_until then
    raise exception using errcode = '55000', message = 'active_activation_exists';
  elsif found then
    perform admin_internal.staff_break_glass_reap_expired_activation_v1(
      v_activation.activation_id, v_now);
  end if;

  v_before := pg_catalog.jsonb_build_object(
    'status', v_principal.status, 'status_version', v_principal.status_version);
  update admin_internal.staff_break_glass_principals
  set status = 'revoked', status_version = status_version + 1,
    revoked_at = v_now, revoked_by_db_role = session_user,
    revoke_reason_code = p_reason_code, updated_at = v_now
  where principal_id = p_principal_id;
  v_result := pg_catalog.jsonb_build_object(
    'operation', 'principal_revoke', 'outcome', 'applied',
    'principal_id', p_principal_id, 'status', 'revoked',
    'status_version', v_principal.status_version + 1, 'revoked_at', v_now);
  insert into admin_internal.staff_break_glass_control_receipts
    (operator_db_role, request_id, operation_kind, request_payload, result_payload, created_at)
  values (session_user, p_request_id, 'principal_revoke', v_payload, v_result, v_now);
  insert into admin_internal.staff_break_glass_audit_log (
    operator_db_role, operation_kind, principal_id, auth_user_id, staff_account_id,
    request_id, reason_code, outcome, before_state, after_state, occurred_at
  ) values (
    session_user, 'principal_revoke', p_principal_id, v_principal.auth_user_id,
    v_principal.staff_account_id, p_request_id, p_reason_code, 'applied',
    v_before, v_result, v_now
  );
  return v_result;
end;
$$;

create function admin_internal.staff_break_glass_activate_v1(
  p_principal_id uuid,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_payload jsonb;
  v_prior jsonb;
  v_principal admin_internal.staff_break_glass_principals%rowtype;
  v_staff admin_internal.staff_accounts%rowtype;
  v_existing admin_internal.staff_break_glass_activations%rowtype;
  v_activation_id uuid := pg_catalog.gen_random_uuid();
  v_effective_until timestamptz;
  v_permission_key text;
  v_entitlement_id uuid;
  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  perform admin_internal.staff_break_glass_validate_mutation_input_v1(
    p_reason_code, p_request_id);
  v_payload := pg_catalog.jsonb_build_object(
    'principal_id', p_principal_id, 'reason_code', p_reason_code);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_request:' || session_user || ':' || p_request_id::text, 0));
  v_prior := admin_internal.staff_break_glass_prior_result_v1(
    'activation_open', p_request_id, v_payload);
  if v_prior is not null then return v_prior; end if;

  select principal.* into v_principal
  from admin_internal.staff_break_glass_principals principal
  where principal.principal_id = p_principal_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'principal_not_found';
  end if;
  if v_principal.status <> 'active' then
    raise exception using errcode = '55000', message = 'principal_not_active';
  end if;
  select locked.* into v_staff
  from admin_internal.staff_break_glass_lock_staff_account_v1(
    v_principal.staff_account_id, null) locked;
  if not found or v_staff.auth_user_id <> v_principal.auth_user_id
    or v_staff.status <> 'active' or v_staff.effective_from > v_now
    or (v_staff.effective_until is not null and v_now >= v_staff.effective_until)
  then
    raise exception using errcode = '55000', message = 'staff_account_not_effective';
  end if;

  select activation.* into v_existing
  from admin_internal.staff_break_glass_activations activation
  where activation.principal_id = p_principal_id and activation.status = 'active'
  for update;
  if found and v_now < v_existing.effective_until then
    raise exception using errcode = '55000', message = 'activation_exists';
  elsif found then
    perform admin_internal.staff_break_glass_reap_expired_activation_v1(
      v_existing.activation_id, v_now);
  end if;

  perform admin_internal.staff_break_glass_assert_root_contract_v1();
  v_effective_until := least(
    v_now + interval '30 minutes',
    coalesce(v_staff.effective_until, 'infinity'::timestamptz));
  if v_effective_until <= v_now then
    raise exception using errcode = '55000', message = 'staff_account_not_effective';
  end if;

  insert into admin_internal.staff_break_glass_activations (
    activation_id, principal_id, status, status_version,
    effective_from, effective_until, opened_at, opened_by_db_role,
    open_reason_code, created_at, updated_at
  ) values (
    v_activation_id, p_principal_id, 'active', 0,
    v_now, v_effective_until, v_now, session_user,
    p_reason_code, v_now, v_now
  );
  perform pg_catalog.set_config(
    'tastkind.break_glass.activation_id', v_activation_id::text, true);

  foreach v_permission_key in array array[
    'admin_context.read',
    'admin.management.staff.account.write',
    'admin.management.staff.console_admission.write',
    'admin.management.staff.permission.write'
  ]::text[]
  loop
    v_entitlement_id := pg_catalog.gen_random_uuid();
    insert into admin_internal.staff_permission_entitlements (
      entitlement_id, staff_account_id, permission_key, source_type,
      source_bundle_assignment_id, status, effective_from, effective_until, created_at
    ) values (
      v_entitlement_id, v_principal.staff_account_id, v_permission_key, 'direct_grant',
      null, 'active', v_now, v_effective_until, v_now
    );
    insert into admin_internal.staff_break_glass_activation_grants (
      activation_id, entitlement_id, permission_key, status, status_version,
      created_at, updated_at
    ) values (
      v_activation_id, v_entitlement_id, v_permission_key, 'active', 0, v_now, v_now
    );
  end loop;

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'activation_open', 'outcome', 'applied',
    'activation_id', v_activation_id, 'principal_id', p_principal_id,
    'status', 'active', 'status_version', 0,
    'effective_from', v_now, 'effective_until', v_effective_until,
    'maximum_continuous_end', v_now + interval '2 hours',
    'permissions', pg_catalog.to_jsonb(array[
      'admin_context.read',
      'admin.management.staff.account.write',
      'admin.management.staff.console_admission.write',
      'admin.management.staff.permission.write'
    ]::text[]));
  insert into admin_internal.staff_break_glass_control_receipts
    (operator_db_role, request_id, operation_kind, request_payload, result_payload, created_at)
  values (session_user, p_request_id, 'activation_open', v_payload, v_result, v_now);
  insert into admin_internal.staff_break_glass_audit_log (
    operator_db_role, operation_kind, principal_id, activation_id,
    auth_user_id, staff_account_id, request_id, reason_code, outcome,
    before_state, after_state, occurred_at
  ) values (
    session_user, 'activation_open', p_principal_id, v_activation_id,
    v_principal.auth_user_id, v_principal.staff_account_id, p_request_id,
    p_reason_code, 'applied', null, v_result, v_now
  );
  return v_result;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'activation_exists';
end;
$$;

create function admin_internal.staff_break_glass_extend_activation_v1(
  p_activation_id uuid,
  p_expected_status_version bigint,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_payload jsonb;
  v_prior jsonb;
  v_activation admin_internal.staff_break_glass_activations%rowtype;
  v_principal admin_internal.staff_break_glass_principals%rowtype;
  v_staff admin_internal.staff_accounts%rowtype;
  v_cap timestamptz;
  v_new_end timestamptz;
  v_count integer;
  v_permissions text[];
  v_before jsonb;
  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  perform admin_internal.staff_break_glass_validate_mutation_input_v1(
    p_reason_code, p_request_id);
  v_payload := pg_catalog.jsonb_build_object(
    'activation_id', p_activation_id, 'expected_status_version', p_expected_status_version,
    'reason_code', p_reason_code);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_request:' || session_user || ':' || p_request_id::text, 0));
  v_prior := admin_internal.staff_break_glass_prior_result_v1(
    'activation_extend', p_request_id, v_payload);
  if v_prior is not null then return v_prior; end if;

  select activation.* into v_activation
  from admin_internal.staff_break_glass_activations activation
  where activation.activation_id = p_activation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'activation_not_found';
  end if;
  if v_activation.status_version <> p_expected_status_version then
    raise exception using errcode = '40001', message = 'stale_state';
  end if;
  if v_activation.status <> 'active' then
    raise exception using errcode = '55000', message = 'activation_not_active';
  end if;
  if v_now >= v_activation.effective_until then
    raise exception using errcode = '55000', message = 'activation_expired';
  end if;

  select principal.* into v_principal
  from admin_internal.staff_break_glass_principals principal
  where principal.principal_id = v_activation.principal_id
  for update;
  if not found or v_principal.status <> 'active' then
    raise exception using errcode = '55000', message = 'principal_not_active';
  end if;
  select locked.* into v_staff
  from admin_internal.staff_break_glass_lock_staff_account_v1(
    v_principal.staff_account_id, null) locked;
  if not found or v_staff.auth_user_id <> v_principal.auth_user_id
    or v_staff.status <> 'active' or v_staff.effective_from > v_now
    or (v_staff.effective_until is not null and v_now >= v_staff.effective_until)
  then
    raise exception using errcode = '55000', message = 'staff_account_not_effective';
  end if;
  perform admin_internal.staff_break_glass_assert_root_contract_v1();

  perform grant_row.activation_grant_id
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.activation_id = p_activation_id
  order by grant_row.activation_grant_id
  for update;
  perform entitlement.entitlement_id
  from admin_internal.staff_permission_entitlements entitlement
  join admin_internal.staff_break_glass_activation_grants grant_row
    on grant_row.entitlement_id = entitlement.entitlement_id
  where grant_row.activation_id = p_activation_id
  order by entitlement.entitlement_id
  for update of entitlement;
  select pg_catalog.count(*)::integer,
    pg_catalog.array_agg(grant_row.permission_key order by grant_row.permission_key)
  into v_count, v_permissions
  from admin_internal.staff_break_glass_activation_grants grant_row
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.entitlement_id = grant_row.entitlement_id
  where grant_row.activation_id = p_activation_id
    and grant_row.status = 'active'
    and entitlement.status = 'active'
    and entitlement.effective_from = v_activation.effective_from
    and entitlement.effective_until = v_activation.effective_until;
  if v_count <> 4 or v_permissions <> array[
    'admin.management.staff.account.write',
    'admin.management.staff.console_admission.write',
    'admin.management.staff.permission.write',
    'admin_context.read'
  ]::text[] then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;

  v_cap := least(
    v_activation.effective_from + interval '2 hours',
    coalesce(v_staff.effective_until, 'infinity'::timestamptz));
  v_new_end := least(
    v_activation.effective_until + interval '30 minutes', v_cap);
  if v_new_end <= v_activation.effective_until then
    raise exception using errcode = '54000', message = 'extension_limit_reached';
  end if;
  v_before := pg_catalog.jsonb_build_object(
    'status', v_activation.status, 'status_version', v_activation.status_version,
    'effective_until', v_activation.effective_until);

  update admin_internal.staff_break_glass_activations
  set effective_until = v_new_end, status_version = status_version + 1,
    last_extended_at = v_now, last_extended_by_db_role = session_user,
    last_extend_reason_code = p_reason_code, updated_at = v_now
  where activation_id = p_activation_id;
  update admin_internal.staff_permission_entitlements entitlement
  set effective_until = v_new_end
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.activation_id = p_activation_id
    and grant_row.entitlement_id = entitlement.entitlement_id
    and grant_row.status = 'active' and entitlement.status = 'active';
  get diagnostics v_count = row_count;
  if v_count <> 4 then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'activation_extend', 'outcome', 'applied',
    'activation_id', p_activation_id, 'principal_id', v_activation.principal_id,
    'status', 'active', 'status_version', v_activation.status_version + 1,
    'previous_effective_until', v_activation.effective_until,
    'effective_until', v_new_end, 'maximum_continuous_end', v_cap,
    'extended_at', v_now);
  insert into admin_internal.staff_break_glass_control_receipts
    (operator_db_role, request_id, operation_kind, request_payload, result_payload, created_at)
  values (session_user, p_request_id, 'activation_extend', v_payload, v_result, v_now);
  insert into admin_internal.staff_break_glass_audit_log (
    operator_db_role, operation_kind, principal_id, activation_id,
    auth_user_id, staff_account_id, request_id, reason_code, outcome,
    before_state, after_state, occurred_at
  ) values (
    session_user, 'activation_extend', v_activation.principal_id, p_activation_id,
    v_principal.auth_user_id, v_principal.staff_account_id, p_request_id,
    p_reason_code, 'applied', v_before, v_result, v_now
  );
  return v_result;
end;
$$;

create function admin_internal.staff_break_glass_close_activation_v1(
  p_activation_id uuid,
  p_expected_status_version bigint,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_payload jsonb;
  v_prior jsonb;
  v_activation admin_internal.staff_break_glass_activations%rowtype;
  v_principal admin_internal.staff_break_glass_principals%rowtype;
  v_count integer;
  v_before jsonb;
  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  perform admin_internal.staff_break_glass_validate_mutation_input_v1(
    p_reason_code, p_request_id);
  v_payload := pg_catalog.jsonb_build_object(
    'activation_id', p_activation_id, 'expected_status_version', p_expected_status_version,
    'reason_code', p_reason_code);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_break_glass_request:' || session_user || ':' || p_request_id::text, 0));
  v_prior := admin_internal.staff_break_glass_prior_result_v1(
    'activation_close', p_request_id, v_payload);
  if v_prior is not null then return v_prior; end if;

  select activation.* into v_activation
  from admin_internal.staff_break_glass_activations activation
  where activation.activation_id = p_activation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'activation_not_found';
  end if;
  if v_activation.status_version <> p_expected_status_version then
    raise exception using errcode = '40001', message = 'stale_state';
  end if;
  if v_activation.status <> 'active' then
    raise exception using errcode = '55000', message = 'activation_not_active';
  end if;
  select principal.* into v_principal
  from admin_internal.staff_break_glass_principals principal
  where principal.principal_id = v_activation.principal_id
  for update;

  perform grant_row.activation_grant_id
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.activation_id = p_activation_id
  order by grant_row.activation_grant_id
  for update;
  perform entitlement.entitlement_id
  from admin_internal.staff_permission_entitlements entitlement
  join admin_internal.staff_break_glass_activation_grants grant_row
    on grant_row.entitlement_id = entitlement.entitlement_id
  where grant_row.activation_id = p_activation_id
  order by entitlement.entitlement_id
  for update of entitlement;
  select pg_catalog.count(*)::integer into v_count
  from admin_internal.staff_break_glass_activation_grants grant_row
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.entitlement_id = grant_row.entitlement_id
  where grant_row.activation_id = p_activation_id
    and grant_row.status = 'active' and entitlement.status = 'active';
  if v_count <> 4 then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;
  v_before := pg_catalog.jsonb_build_object(
    'status', v_activation.status, 'status_version', v_activation.status_version,
    'effective_until', v_activation.effective_until);

  update admin_internal.staff_permission_entitlements entitlement
  set status = 'revoked', revoked_at = v_now
  from admin_internal.staff_break_glass_activation_grants grant_row
  where grant_row.activation_id = p_activation_id
    and grant_row.entitlement_id = entitlement.entitlement_id
    and grant_row.status = 'active' and entitlement.status = 'active';
  get diagnostics v_count = row_count;
  if v_count <> 4 then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;
  update admin_internal.staff_break_glass_activation_grants
  set status = 'revoked', status_version = status_version + 1,
    revoked_at = v_now, revoked_by_db_role = session_user, updated_at = v_now
  where activation_id = p_activation_id and status = 'active';
  update admin_internal.staff_break_glass_activations
  set status = 'closed', status_version = status_version + 1,
    closed_at = v_now, closed_by_db_role = session_user,
    close_reason_code = p_reason_code, updated_at = v_now
  where activation_id = p_activation_id;

  v_result := pg_catalog.jsonb_build_object(
    'operation', 'activation_close', 'outcome', 'applied',
    'activation_id', p_activation_id, 'principal_id', v_activation.principal_id,
    'status', 'closed', 'status_version', v_activation.status_version + 1,
    'closed_at', v_now);
  insert into admin_internal.staff_break_glass_control_receipts
    (operator_db_role, request_id, operation_kind, request_payload, result_payload, created_at)
  values (session_user, p_request_id, 'activation_close', v_payload, v_result, v_now);
  insert into admin_internal.staff_break_glass_audit_log (
    operator_db_role, operation_kind, principal_id, activation_id,
    auth_user_id, staff_account_id, request_id, reason_code, outcome,
    before_state, after_state, occurred_at
  ) values (
    session_user, 'activation_close', v_activation.principal_id, p_activation_id,
    v_principal.auth_user_id, v_principal.staff_account_id, p_request_id,
    p_reason_code, 'applied', v_before, v_result, v_now
  );
  return v_result;
end;
$$;

create function admin_internal.staff_break_glass_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  select pg_catalog.jsonb_build_object(
    'database_name', pg_catalog.current_database(),
    'database_time', v_now,
    'state', case when exists (
      select 1 from admin_internal.staff_break_glass_activations live
      where live.status = 'active' and v_now < live.effective_until
    ) then 'ACTIVE' else 'INACTIVE' end,
    'active_principal_count', (
      select pg_catalog.count(*) from admin_internal.staff_break_glass_principals p
      where p.status = 'active'),
    'maximum_active_principals', 2,
    'principals', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'principal_id', principal.principal_id,
        'auth_user_id', principal.auth_user_id,
        'staff_account_id', principal.staff_account_id,
        'principal_status', principal.status,
        'principal_status_version', principal.status_version,
        'enrolled_at', principal.enrolled_at,
        'activation_id', activation.activation_id,
        'activation_status', case
          when activation.activation_id is null then 'inactive'
          when activation.status = 'active' and v_now < activation.effective_until then 'active'
          when activation.status = 'active' then 'expired'
          else activation.status end,
        'activation_status_version', activation.status_version,
        'effective_from', activation.effective_from,
        'effective_until', activation.effective_until,
        'remaining_seconds', case
          when activation.status = 'active' and v_now < activation.effective_until
          then pg_catalog.floor(extract(epoch from
            (activation.effective_until - v_now)))::bigint else 0 end,
        'maximum_continuous_end', case when activation.activation_id is null then null
          else least(
            activation.effective_from + interval '2 hours',
            coalesce(account.effective_until, 'infinity'::timestamptz)) end,
        'extension_available', case when activation.status = 'active'
          and v_now < activation.effective_until then activation.effective_until < least(
            activation.effective_from + interval '2 hours',
            coalesce(account.effective_until, 'infinity'::timestamptz))
          else false end
      ) order by principal.created_at, principal.principal_id)
      from admin_internal.staff_break_glass_principals principal
      join admin_internal.staff_accounts account on account.id = principal.staff_account_id
      left join lateral (
        select candidate.*
        from admin_internal.staff_break_glass_activations candidate
        where candidate.principal_id = principal.principal_id
        order by (candidate.status = 'active') desc, candidate.created_at desc
        limit 1
      ) activation on true
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function admin_internal.staff_break_glass_recent_audit_v1(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception using errcode = '42501', message = 'break_glass_control_not_authorized';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception using errcode = '22023', message = 'audit_limit_out_of_range';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(evidence)), '[]'::jsonb)
  into v_result
  from (
    select event_id, operator_db_role, operation_kind, principal_id, activation_id,
      auth_user_id, staff_account_id, request_id, reason_code, outcome,
      before_state, after_state, occurred_at
    from admin_internal.staff_break_glass_audit_log
    order by occurred_at desc, event_id desc
    limit v_limit
  ) evidence;
  return v_result;
end;
$$;

-- Transfer every private implementation function to the sealed role. The temporary membership
-- exists only for ownership transfer and is removed before commit.
grant staff_break_glass_control_authority to postgres
  with admin false, inherit false, set true;
grant staff_authority_write_authority to postgres
  with admin false, inherit false, set true;
grant create on schema admin_internal to staff_break_glass_control_authority;
grant create on schema admin_internal to staff_authority_write_authority;

alter function admin_internal.staff_break_glass_validate_mutation_input_v1(text,uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_prior_result_v1(text,uuid,jsonb)
  owner to staff_break_glass_control_authority;
alter function admin_internal.prevent_staff_break_glass_principal_reactivation_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.prevent_staff_break_glass_activation_reactivation_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.prevent_staff_break_glass_activation_grant_reactivation_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.prevent_staff_break_glass_evidence_mutation_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.assert_staff_break_glass_activation_grant_consistency_v1(uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.enforce_staff_break_glass_activation_grant_consistency_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.enforce_staff_break_glass_activation_consistency_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.enforce_staff_break_glass_entitlement_consistency_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_reap_expired_activation_v1(uuid,timestamptz)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_enroll_principal_v1(uuid,text,uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_revoke_principal_v1(uuid,bigint,text,uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_activate_v1(uuid,text,uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_extend_activation_v1(uuid,bigint,text,uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_close_activation_v1(uuid,bigint,text,uuid)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_status_v1()
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_recent_audit_v1(integer)
  owner to staff_break_glass_control_authority;
alter function admin_internal.staff_break_glass_lock_staff_account_v1(uuid,uuid)
  owner to staff_authority_write_authority;
alter function admin_internal.staff_break_glass_assert_root_contract_v1()
  owner to staff_authority_write_authority;

set role staff_authority_write_authority;
revoke all on function
  admin_internal.staff_break_glass_lock_staff_account_v1(uuid,uuid),
  admin_internal.staff_break_glass_assert_root_contract_v1()
from public, anon, authenticated, authenticator, service_role;
grant execute on function
  admin_internal.staff_break_glass_lock_staff_account_v1(uuid,uuid),
  admin_internal.staff_break_glass_assert_root_contract_v1()
to staff_break_glass_control_authority;
reset role;

set role staff_break_glass_control_authority;
revoke all on function
  admin_internal.staff_break_glass_validate_mutation_input_v1(text,uuid),
  admin_internal.staff_break_glass_prior_result_v1(text,uuid,jsonb),
  admin_internal.prevent_staff_break_glass_principal_reactivation_v1(),
  admin_internal.prevent_staff_break_glass_activation_reactivation_v1(),
  admin_internal.prevent_staff_break_glass_activation_grant_reactivation_v1(),
  admin_internal.prevent_staff_break_glass_evidence_mutation_v1(),
  admin_internal.assert_staff_break_glass_activation_grant_consistency_v1(uuid),
  admin_internal.enforce_staff_break_glass_activation_grant_consistency_v1(),
  admin_internal.enforce_staff_break_glass_activation_consistency_v1(),
  admin_internal.enforce_staff_break_glass_entitlement_consistency_v1(),
  admin_internal.staff_break_glass_reap_expired_activation_v1(uuid,timestamptz),
  admin_internal.staff_break_glass_enroll_principal_v1(uuid,text,uuid),
  admin_internal.staff_break_glass_revoke_principal_v1(uuid,bigint,text,uuid),
  admin_internal.staff_break_glass_activate_v1(uuid,text,uuid),
  admin_internal.staff_break_glass_extend_activation_v1(uuid,bigint,text,uuid),
  admin_internal.staff_break_glass_close_activation_v1(uuid,bigint,text,uuid),
  admin_internal.staff_break_glass_status_v1(),
  admin_internal.staff_break_glass_recent_audit_v1(integer)
from public, anon, authenticated, authenticator, service_role;

grant execute on function
  admin_internal.staff_break_glass_enroll_principal_v1(uuid,text,uuid),
  admin_internal.staff_break_glass_revoke_principal_v1(uuid,bigint,text,uuid),
  admin_internal.staff_break_glass_activate_v1(uuid,text,uuid),
  admin_internal.staff_break_glass_extend_activation_v1(uuid,bigint,text,uuid),
  admin_internal.staff_break_glass_close_activation_v1(uuid,bigint,text,uuid),
  admin_internal.staff_break_glass_status_v1(),
  admin_internal.staff_break_glass_recent_audit_v1(integer)
to postgres;
reset role;

revoke create on schema admin_internal from staff_break_glass_control_authority;
revoke create on schema admin_internal from staff_authority_write_authority;
revoke staff_break_glass_control_authority from postgres granted by postgres;
revoke staff_authority_write_authority from postgres granted by postgres;

commit;
