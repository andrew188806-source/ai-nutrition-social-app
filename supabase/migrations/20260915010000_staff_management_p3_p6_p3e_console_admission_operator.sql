-- RA-3-IA-P3-P6-P3E: dedicated staff console-admission grant/revoke operators.
--
-- Console admission is deliberately separate from ordinary delegated permission authority.
-- These operators can create and revoke only an exact admin_context.read provenance source.

begin;

grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
set role staff_authority_write_authority;
do $$
declare
  v_updated integer;
begin
  update admin_internal.staff_permission_catalog
  set readiness_status = 'current'
  where permission_key = 'admin.management.staff.console_admission.write'
    and lifecycle_status = 'active'
    and readiness_status = 'planned'
    and sensitivity_class = 'SECURITY_AUTH'
    and individually_provisionable = false
    and temporary_grantable = false
    and ordinary_supervisor_delegable = false
    and privileged_only = true
    and deferred = false
    and console_admission_required = false;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = '23514',
      message = 'staff_console_admission_write_promotion_mismatch';
  end if;
end;
$$;
reset role;
revoke create on schema admin_internal from staff_authority_write_authority;
revoke staff_authority_write_authority from postgres granted by postgres;

create table admin_internal.staff_console_admission_grants (
  console_admission_grant_id uuid not null default pg_catalog.gen_random_uuid(),
  entitlement_id uuid not null,
  target_staff_account_id uuid not null,
  granted_by_auth_user_id uuid not null,
  granted_by_staff_account_id uuid not null,
  status text not null default 'active',
  status_version bigint not null default 0,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid,
  revoked_by_staff_account_id uuid,
  constraint staff_console_admission_grants_pkey
    primary key (console_admission_grant_id),
  constraint staff_console_admission_grants_entitlement_key unique (entitlement_id),
  constraint staff_console_admission_grants_entitlement_fkey
    foreign key (entitlement_id)
    references admin_internal.staff_permission_entitlements (entitlement_id)
    on update restrict on delete restrict,
  constraint staff_console_admission_grants_target_fkey
    foreign key (target_staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_console_admission_grants_granted_auth_fkey
    foreign key (granted_by_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_console_admission_grants_granted_staff_fkey
    foreign key (granted_by_staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_console_admission_grants_revoked_auth_fkey
    foreign key (revoked_by_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_console_admission_grants_revoked_staff_fkey
    foreign key (revoked_by_staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_console_admission_grants_status_check
    check (status in ('active', 'revoked')),
  constraint staff_console_admission_grants_status_version_check
    check (status_version >= 0),
  constraint staff_console_admission_grants_revocation_shape_check check (
    (status = 'active' and revoked_at is null and revoked_by_auth_user_id is null
      and revoked_by_staff_account_id is null)
    or
    (status = 'revoked' and revoked_at is not null and revoked_by_auth_user_id is not null
      and revoked_by_staff_account_id is not null)
  )
);

create unique index staff_console_admission_grants_active_target_key
  on admin_internal.staff_console_admission_grants (target_staff_account_id)
  where status = 'active';

create index staff_console_admission_grants_target_history_idx
  on admin_internal.staff_console_admission_grants
  (target_staff_account_id, created_at desc, console_admission_grant_id);

comment on table admin_internal.staff_console_admission_grants is
  'P3E immutable provenance for dedicated admin_context.read direct entitlements. Revoked rows are terminal, restoration creates a new source, and P3E performs no backfill.';

create function admin_internal.enforce_staff_console_admission_grant_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_entitlement admin_internal.staff_permission_entitlements%rowtype;
begin
  if tg_op = 'UPDATE' and old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514',
      message = 'staff_console_admission_grant_revoked_terminal';
  end if;
  if tg_op = 'UPDATE' and (
    new.entitlement_id is distinct from old.entitlement_id
    or new.target_staff_account_id is distinct from old.target_staff_account_id
    or new.granted_by_auth_user_id is distinct from old.granted_by_auth_user_id
    or new.granted_by_staff_account_id is distinct from old.granted_by_staff_account_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '23514',
      message = 'staff_console_admission_grant_provenance_immutable';
  end if;

  select entitlement.* into v_entitlement
  from admin_internal.staff_permission_entitlements entitlement
  where entitlement.entitlement_id = new.entitlement_id;
  if not found
    or v_entitlement.staff_account_id <> new.target_staff_account_id
    or v_entitlement.permission_key <> 'admin_context.read'
    or v_entitlement.source_type <> 'direct_grant'
    or v_entitlement.source_bundle_assignment_id is not null
    or v_entitlement.status <> new.status
  then
    raise exception using errcode = '23514',
      message = 'staff_console_admission_grant_entitlement_mismatch';
  end if;
  return new;
end;
$$;

create trigger staff_console_admission_grants_consistency_v1
before insert or update on admin_internal.staff_console_admission_grants
for each row execute function admin_internal.enforce_staff_console_admission_grant_v1();

alter table admin_internal.staff_console_admission_grants enable row level security;
alter table admin_internal.staff_console_admission_grants force row level security;

create policy staff_console_admission_grants_writer_select
  on admin_internal.staff_console_admission_grants for select
  to staff_console_admission_authority using (true);
create policy staff_console_admission_grants_writer_insert
  on admin_internal.staff_console_admission_grants for insert
  to staff_console_admission_authority with check (true);
create policy staff_console_admission_grants_writer_update
  on admin_internal.staff_console_admission_grants for update
  to staff_console_admission_authority using (true) with check (true);

create policy staff_permission_entitlements_console_writer_select
  on admin_internal.staff_permission_entitlements for select
  to staff_console_admission_authority
  using (permission_key = 'admin_context.read');
create policy staff_permission_entitlements_console_writer_insert
  on admin_internal.staff_permission_entitlements for insert
  to staff_console_admission_authority with check (
    permission_key = 'admin_context.read'
    and source_type = 'direct_grant'
    and source_bundle_assignment_id is null
  );
create policy staff_permission_entitlements_console_writer_update
  on admin_internal.staff_permission_entitlements for update
  to staff_console_admission_authority using (
    permission_key = 'admin_context.read'
    and source_type = 'direct_grant'
    and exists (
      select 1
      from admin_internal.staff_console_admission_grants admission
      where admission.entitlement_id = staff_permission_entitlements.entitlement_id
        and admission.status = 'active'
    )
  ) with check (
    permission_key = 'admin_context.read'
    and source_type = 'direct_grant'
    and source_bundle_assignment_id is null
  );

revoke all on table admin_internal.staff_console_admission_grants
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table admin_internal.staff_console_admission_grants
  to staff_console_admission_authority;
grant update (status, status_version, updated_at, revoked_at,
  revoked_by_auth_user_id, revoked_by_staff_account_id)
  on table admin_internal.staff_console_admission_grants
  to staff_console_admission_authority;
grant select (entitlement_id, staff_account_id, permission_key, source_type,
  source_bundle_assignment_id, status, effective_from, effective_until, created_at, revoked_at)
  on table admin_internal.staff_permission_entitlements
  to staff_console_admission_authority;
grant insert (staff_account_id, permission_key, source_type,
  source_bundle_assignment_id, status, effective_from, effective_until, created_at)
  on table admin_internal.staff_permission_entitlements
  to staff_console_admission_authority;
grant update (status, revoked_at)
  on table admin_internal.staff_permission_entitlements
  to staff_console_admission_authority;

-- Extend the frozen atomic actor lock by exactly one CURRENT management writer. It still locks
-- and requires both the requested exact key and admin_context.read from effective sources.
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
set role staff_authority_write_authority;
create or replace function admin_internal.lock_current_staff_management_actor_v1(
  p_required_management_permission_key text
)
returns table (actor_auth_user_id uuid, actor_staff_account_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_staff_account_id uuid;
  v_database_now timestamptz := pg_catalog.statement_timestamp();
  v_row record;
  v_locked_catalog_keys text[] := array[]::text[];
  v_locked_assignment_ids uuid[] := array[]::uuid[];
  v_locked_entitlement_ids uuid[] := array[]::uuid[];
  v_effective_count integer;
  v_locked_effective_count integer;
begin
  if p_required_management_permission_key not in (
    'admin.management.staff.account.write',
    'admin.management.staff.delegation.write',
    'admin.management.staff.console_admission.write'
  ) then return; end if;

  v_actor := admin_internal.staff_request_subject_v1();
  if v_actor is null then return; end if;

  select account.id into v_staff_account_id
  from admin_internal.staff_accounts account
  where account.auth_user_id = v_actor
  for update;
  if not found then return; end if;

  for v_row in
    select permission.permission_key
    from admin_internal.staff_permission_catalog permission
    where permission.permission_key in (
      'admin_context.read', p_required_management_permission_key
    )
    order by permission.permission_key
    for update
  loop
    v_locked_catalog_keys := pg_catalog.array_append(v_locked_catalog_keys, v_row.permission_key);
  end loop;

  for v_row in
    select assignment.assignment_id
    from admin_internal.staff_bundle_assignments assignment
    where exists (
      select 1 from admin_internal.staff_permission_entitlements entitlement
      where entitlement.staff_account_id = v_staff_account_id
        and entitlement.permission_key in (
          'admin_context.read', p_required_management_permission_key
        )
        and entitlement.source_type = 'bundle_assignment'
        and entitlement.source_bundle_assignment_id = assignment.assignment_id
    )
    order by assignment.assignment_id
    for update of assignment
  loop
    v_locked_assignment_ids := pg_catalog.array_append(v_locked_assignment_ids, v_row.assignment_id);
  end loop;

  for v_row in
    select entitlement.entitlement_id
    from admin_internal.staff_permission_entitlements entitlement
    where entitlement.staff_account_id = v_staff_account_id
      and entitlement.permission_key in (
        'admin_context.read', p_required_management_permission_key
      )
    order by entitlement.entitlement_id
    for update
  loop
    v_locked_entitlement_ids := pg_catalog.array_append(v_locked_entitlement_ids, v_row.entitlement_id);
  end loop;

  select pg_catalog.count(distinct effective.permission_key)::integer
    into v_effective_count
  from admin_internal.staff_effective_permissions_for_subject_v1(v_actor, v_database_now) effective
  where effective.permission_key in ('admin_context.read', p_required_management_permission_key);

  select pg_catalog.count(distinct entitlement.permission_key)::integer
    into v_locked_effective_count
  from admin_internal.staff_accounts account
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.staff_account_id = account.id
  join admin_internal.staff_permission_catalog permission
    on permission.permission_key = entitlement.permission_key
  left join admin_internal.staff_bundle_assignments assignment
    on assignment.assignment_id = entitlement.source_bundle_assignment_id
  where account.id = v_staff_account_id
    and permission.permission_key = any(v_locked_catalog_keys)
    and entitlement.entitlement_id = any(v_locked_entitlement_ids)
    and account.status = 'active'
    and account.effective_from <= v_database_now
    and (account.effective_until is null or v_database_now < account.effective_until)
    and permission.lifecycle_status = 'active'
    and permission.readiness_status = 'current'
    and entitlement.status = 'active'
    and entitlement.effective_from <= v_database_now
    and (entitlement.effective_until is null or v_database_now < entitlement.effective_until)
    and (
      (entitlement.source_type in ('direct_grant', 'migration_backfill')
        and entitlement.source_bundle_assignment_id is null)
      or
      (entitlement.source_type = 'bundle_assignment'
        and assignment.assignment_id = any(v_locked_assignment_ids)
        and assignment.staff_account_id = entitlement.staff_account_id
        and assignment.status = 'active'
        and assignment.effective_from <= v_database_now
        and (assignment.effective_until is null or v_database_now < assignment.effective_until))
    );

  if v_effective_count <> 2 or v_locked_effective_count <> 2 then return; end if;
  return query select v_actor, v_staff_account_id;
end;
$$;

comment on function admin_internal.lock_current_staff_management_actor_v1(text) is
  'P3E private atomic actor lock, bounded to account.write, delegation.write, or console_admission.write plus admin_context.read and all valid locked authority sources.';
reset role;
revoke create on schema admin_internal from staff_authority_write_authority;
revoke staff_authority_write_authority from postgres granted by postgres;

create function admin_internal.lock_staff_console_admission_target_policy_v1(
  p_target_staff_account_id uuid
)
returns table (
  target_found boolean,
  target_status text,
  target_effective_from timestamptz,
  target_effective_until timestamptz,
  permission_found boolean,
  permission_lifecycle_status text,
  permission_readiness_status text,
  permission_sensitivity_class text,
  permission_individually_provisionable boolean,
  permission_temporary_grantable boolean,
  permission_ordinary_supervisor_delegable boolean,
  permission_privileged_only boolean,
  permission_deferred boolean,
  permission_console_admission_required boolean
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_target admin_internal.staff_accounts%rowtype;
  v_permission admin_internal.staff_permission_catalog%rowtype;
begin
  select account.* into v_target
  from admin_internal.staff_accounts account
  where account.id = p_target_staff_account_id
  for update;
  target_found := found;
  if target_found then
    target_status := v_target.status;
    target_effective_from := v_target.effective_from;
    target_effective_until := v_target.effective_until;
  end if;

  select permission.* into v_permission
  from admin_internal.staff_permission_catalog permission
  where permission.permission_key = 'admin_context.read'
  for update;
  permission_found := found;
  if permission_found then
    permission_lifecycle_status := v_permission.lifecycle_status;
    permission_readiness_status := v_permission.readiness_status;
    permission_sensitivity_class := v_permission.sensitivity_class;
    permission_individually_provisionable := v_permission.individually_provisionable;
    permission_temporary_grantable := v_permission.temporary_grantable;
    permission_ordinary_supervisor_delegable := v_permission.ordinary_supervisor_delegable;
    permission_privileged_only := v_permission.privileged_only;
    permission_deferred := v_permission.deferred;
    permission_console_admission_required := v_permission.console_admission_required;
  end if;
  return next;
end;
$$;

comment on function admin_internal.lock_staff_console_admission_target_policy_v1(uuid) is
  'P3E private target-account then exact admin_context.read catalogue lock with bounded policy evidence.';

create function admin_internal.staff_management_grant_console_admission_apply_v1(
  p_target_staff_account_id uuid,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_actor_auth_user_id uuid;
  v_actor_staff_account_id uuid;
  v_database_now timestamptz := pg_catalog.statement_timestamp();
  v_target record;
  v_prior admin_internal.staff_management_operation_receipts%rowtype;
  v_entitlement admin_internal.staff_permission_entitlements%rowtype;
  v_grant admin_internal.staff_console_admission_grants%rowtype;
  v_request_payload jsonb;
  v_result jsonb;
  v_after_state jsonb;
  v_error_code text;
  v_outcome text := 'rejected';
  v_audit_target_staff_account_id uuid;
begin
  if p_target_staff_account_id is null
    or p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or p_reason_code is null
    or pg_catalog.length(p_reason_code) not between 1 and 80
    or p_reason_code <> pg_catalog.btrim(p_reason_code)
    or p_reason_code !~ '^[a-z][a-z0-9_]*$'
  then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
    );
  end if;

  select actor.actor_auth_user_id, actor.actor_staff_account_id
    into v_actor_auth_user_id, v_actor_staff_account_id
  from admin_internal.lock_current_staff_management_actor_v1(
    'admin.management.staff.console_admission.write'
  ) actor;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'permission_denied'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_auth_user_id::text || ':' || p_request_id::text, 0
  ));

  select * into v_target
  from admin_internal.lock_staff_console_admission_target_policy_v1(
    p_target_staff_account_id
  );

  v_request_payload := pg_catalog.jsonb_build_object(
    'operationKind', 'staff_console_admission_grant',
    'targetStaffAccountId', p_target_staff_account_id,
    'reasonCode', p_reason_code
  );
  select receipt.* into v_prior
  from admin_internal.staff_management_operation_receipts receipt
  where receipt.actor_auth_user_id = v_actor_auth_user_id
    and receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> 'staff_console_admission_grant'
      or v_prior.request_payload is distinct from v_request_payload
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'request_conflict'
      );
    end if;
    return v_prior.result_payload;
  end if;

  v_audit_target_staff_account_id := case when v_target.target_found
    then p_target_staff_account_id else null end;
  if not v_target.target_found then
    v_error_code := 'target_not_found';
  elsif p_target_staff_account_id = v_actor_staff_account_id then
    v_error_code := 'self_target_denied';
  elsif v_target.target_status <> 'active'
    or v_target.target_effective_from > v_database_now
    or (v_target.target_effective_until is not null
      and v_database_now >= v_target.target_effective_until)
  then
    v_error_code := 'target_ineligible';
  elsif not v_target.permission_found
    or v_target.permission_lifecycle_status <> 'active'
    or v_target.permission_readiness_status <> 'current'
    or v_target.permission_sensitivity_class <> 'SECURITY_AUTH'
    or v_target.permission_individually_provisionable
    or v_target.permission_temporary_grantable
    or v_target.permission_ordinary_supervisor_delegable
    or v_target.permission_privileged_only
    or v_target.permission_deferred
    or not v_target.permission_console_admission_required
  then
    v_error_code := 'console_admission_policy_ineligible';
  end if;

  if v_error_code is null then
    begin
      insert into admin_internal.staff_permission_entitlements (
        staff_account_id, permission_key, source_type, source_bundle_assignment_id,
        status, effective_from, effective_until, created_at
      ) values (
        p_target_staff_account_id, 'admin_context.read', 'direct_grant', null,
        'active', v_database_now, v_target.target_effective_until, v_database_now
      ) returning * into v_entitlement;

      insert into admin_internal.staff_console_admission_grants (
        entitlement_id, target_staff_account_id, granted_by_auth_user_id,
        granted_by_staff_account_id, status, status_version, created_at, updated_at
      ) values (
        v_entitlement.entitlement_id, p_target_staff_account_id,
        v_actor_auth_user_id, v_actor_staff_account_id, 'active', 0,
        v_database_now, v_database_now
      ) returning * into v_grant;
      v_outcome := 'applied';
    exception when unique_violation then
      v_entitlement := null;
      v_grant := null;
      v_error_code := 'console_admission_exists';
    end;
  end if;

  v_after_state := case when v_outcome = 'applied' then
    pg_catalog.jsonb_build_object(
      'status', v_grant.status,
      'statusVersion', v_grant.status_version,
      'effectiveFrom', v_entitlement.effective_from,
      'effectiveUntil', v_entitlement.effective_until,
      'sourceType', v_entitlement.source_type
    ) else null end;
  v_result := pg_catalog.jsonb_build_object(
    'ok', v_outcome = 'applied', 'outcome', v_outcome, 'errorCode', v_error_code,
    'consoleAdmissionGrantId', v_grant.console_admission_grant_id,
    'entitlementId', v_entitlement.entitlement_id,
    'targetStaffAccountId', p_target_staff_account_id,
    'permissionKey', 'admin_context.read',
    'status', v_grant.status,
    'statusVersion', v_grant.status_version,
    'effectiveFrom', v_entitlement.effective_from,
    'effectiveUntil', v_entitlement.effective_until,
    'occurredAt', v_database_now
  );

  insert into admin_internal.staff_management_operation_receipts (
    actor_auth_user_id, actor_staff_account_id, request_id, operation_kind,
    request_payload, result_payload, created_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, p_request_id,
    'staff_console_admission_grant', v_request_payload, v_result, v_database_now
  );
  insert into admin_internal.staff_management_audit_log (
    actor_auth_user_id, actor_staff_account_id, target_staff_account_id,
    operation_kind, permission_key, entitlement_id, reason_code, request_id,
    outcome, before_state, after_state, occurred_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, v_audit_target_staff_account_id,
    'staff_console_admission_grant', 'admin_context.read',
    v_entitlement.entitlement_id, p_reason_code, p_request_id, v_outcome,
    null, v_after_state, v_database_now
  );
  return v_result;
end;
$$;

create function admin_internal.staff_management_revoke_console_admission_apply_v1(
  p_console_admission_grant_id uuid,
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
set timezone = 'UTC'
as $$
declare
  v_actor_auth_user_id uuid;
  v_actor_staff_account_id uuid;
  v_database_now timestamptz := pg_catalog.statement_timestamp();
  v_pre_grant admin_internal.staff_console_admission_grants%rowtype;
  v_grant admin_internal.staff_console_admission_grants%rowtype;
  v_entitlement admin_internal.staff_permission_entitlements%rowtype;
  v_target record;
  v_prior admin_internal.staff_management_operation_receipts%rowtype;
  v_request_payload jsonb;
  v_result jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_error_code text;
  v_outcome text := 'rejected';
begin
  if p_console_admission_grant_id is null
    or p_expected_status_version is null or p_expected_status_version < 0
    or p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or p_reason_code is null
    or pg_catalog.length(p_reason_code) not between 1 and 80
    or p_reason_code <> pg_catalog.btrim(p_reason_code)
    or p_reason_code !~ '^[a-z][a-z0-9_]*$'
  then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
    );
  end if;

  select actor.actor_auth_user_id, actor.actor_staff_account_id
    into v_actor_auth_user_id, v_actor_staff_account_id
  from admin_internal.lock_current_staff_management_actor_v1(
    'admin.management.staff.console_admission.write'
  ) actor;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'permission_denied'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_auth_user_id::text || ':' || p_request_id::text, 0
  ));
  select admission.* into v_pre_grant
  from admin_internal.staff_console_admission_grants admission
  where admission.console_admission_grant_id = p_console_admission_grant_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'console_admission_not_found'
    );
  end if;

  select * into v_target
  from admin_internal.lock_staff_console_admission_target_policy_v1(
    v_pre_grant.target_staff_account_id
  );

  v_request_payload := pg_catalog.jsonb_build_object(
    'operationKind', 'staff_console_admission_revoke',
    'consoleAdmissionGrantId', p_console_admission_grant_id,
    'expectedStatusVersion', p_expected_status_version,
    'reasonCode', p_reason_code
  );
  select receipt.* into v_prior
  from admin_internal.staff_management_operation_receipts receipt
  where receipt.actor_auth_user_id = v_actor_auth_user_id
    and receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> 'staff_console_admission_revoke'
      or v_prior.request_payload is distinct from v_request_payload
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'request_conflict'
      );
    end if;
    return v_prior.result_payload;
  end if;

  if v_pre_grant.target_staff_account_id = v_actor_staff_account_id then
    v_error_code := 'self_target_denied';
  elsif not v_target.target_found then
    v_error_code := 'target_not_found';
  else
    select admission.* into v_grant
    from admin_internal.staff_console_admission_grants admission
    where admission.console_admission_grant_id = p_console_admission_grant_id
    for update;
    if not found or v_grant.status_version <> p_expected_status_version then
      v_error_code := 'stale_state';
    elsif v_grant.status <> 'active' then
      v_error_code := 'mutation_rejected';
    else
      select entitlement.* into v_entitlement
      from admin_internal.staff_permission_entitlements entitlement
      where entitlement.entitlement_id = v_grant.entitlement_id
      for update;
      if not found
        or v_entitlement.staff_account_id <> v_grant.target_staff_account_id
        or v_entitlement.permission_key <> 'admin_context.read'
        or v_entitlement.source_type <> 'direct_grant'
        or v_entitlement.source_bundle_assignment_id is not null
        or v_entitlement.status <> 'active'
      then
        v_error_code := 'source_mismatch';
      else
        v_before_state := pg_catalog.jsonb_build_object(
          'status', v_grant.status,
          'statusVersion', v_grant.status_version,
          'entitlementStatus', v_entitlement.status,
          'effectiveFrom', v_entitlement.effective_from,
          'effectiveUntil', v_entitlement.effective_until,
          'sourceType', v_entitlement.source_type
        );
        update admin_internal.staff_permission_entitlements
        set status = 'revoked', revoked_at = v_database_now
        where entitlement_id = v_entitlement.entitlement_id
          and status = 'active';
        update admin_internal.staff_console_admission_grants
        set status = 'revoked', status_version = status_version + 1,
            updated_at = v_database_now, revoked_at = v_database_now,
            revoked_by_auth_user_id = v_actor_auth_user_id,
            revoked_by_staff_account_id = v_actor_staff_account_id
        where console_admission_grant_id = p_console_admission_grant_id
          and status = 'active'
          and status_version = p_expected_status_version
        returning * into v_grant;
        if not found then
          raise exception using errcode = '40001',
            message = 'staff_console_admission_revoke_concurrent_state';
        end if;
        v_entitlement.status := 'revoked';
        v_entitlement.revoked_at := v_database_now;
        v_outcome := 'applied';
      end if;
    end if;
  end if;

  v_after_state := case when v_outcome = 'applied' then
    pg_catalog.jsonb_build_object(
      'status', v_grant.status,
      'statusVersion', v_grant.status_version,
      'entitlementStatus', v_entitlement.status,
      'effectiveFrom', v_entitlement.effective_from,
      'effectiveUntil', v_entitlement.effective_until,
      'sourceType', v_entitlement.source_type
    ) else null end;
  v_result := pg_catalog.jsonb_build_object(
    'ok', v_outcome = 'applied', 'outcome', v_outcome, 'errorCode', v_error_code,
    'consoleAdmissionGrantId', p_console_admission_grant_id,
    'entitlementId', v_pre_grant.entitlement_id,
    'targetStaffAccountId', v_pre_grant.target_staff_account_id,
    'permissionKey', 'admin_context.read',
    'status', v_grant.status,
    'statusVersion', v_grant.status_version,
    'occurredAt', v_database_now
  );

  insert into admin_internal.staff_management_operation_receipts (
    actor_auth_user_id, actor_staff_account_id, request_id, operation_kind,
    request_payload, result_payload, created_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, p_request_id,
    'staff_console_admission_revoke', v_request_payload, v_result, v_database_now
  );
  insert into admin_internal.staff_management_audit_log (
    actor_auth_user_id, actor_staff_account_id, target_staff_account_id,
    operation_kind, permission_key, entitlement_id, reason_code, request_id,
    outcome, before_state, after_state, occurred_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, v_pre_grant.target_staff_account_id,
    'staff_console_admission_revoke', 'admin_context.read',
    v_pre_grant.entitlement_id, p_reason_code, p_request_id, v_outcome,
    v_before_state, v_after_state, v_database_now
  );
  return v_result;
end;
$$;

create function public.staff_management_grant_console_admission_v1(
  p_target_staff_account_id uuid,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
  select admin_internal.staff_management_grant_console_admission_apply_v1(
    p_target_staff_account_id, p_reason_code, p_request_id
  );
$$;

create function public.staff_management_revoke_console_admission_v1(
  p_console_admission_grant_id uuid,
  p_expected_status_version bigint,
  p_reason_code text,
  p_request_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
  select admin_internal.staff_management_revoke_console_admission_apply_v1(
    p_console_admission_grant_id, p_expected_status_version,
    p_reason_code, p_request_id
  );
$$;

comment on function public.staff_management_grant_console_admission_v1(uuid,text,uuid) is
  'P3E authenticated operator creating one dedicated admin_context.read entitlement and immutable provenance source.';
comment on function public.staff_management_revoke_console_admission_v1(uuid,bigint,text,uuid) is
  'P3E authenticated source-exact terminal console-admission revoke with status-version CAS.';

revoke all on function admin_internal.enforce_staff_console_admission_grant_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.lock_staff_console_admission_target_policy_v1(uuid)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.staff_management_grant_console_admission_apply_v1(
  uuid,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.staff_management_revoke_console_admission_apply_v1(
  uuid,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_grant_console_admission_v1(
  uuid,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_revoke_console_admission_v1(
  uuid,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;

grant execute on function public.staff_management_grant_console_admission_v1(
  uuid,text,uuid
) to authenticated;
grant execute on function public.staff_management_revoke_console_admission_v1(
  uuid,bigint,text,uuid
) to authenticated;

grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant staff_console_admission_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
grant create on schema admin_internal to staff_console_admission_authority;
grant create on schema public to staff_console_admission_authority;

alter function admin_internal.lock_staff_console_admission_target_policy_v1(uuid)
  owner to staff_authority_write_authority;
alter function admin_internal.staff_management_grant_console_admission_apply_v1(
  uuid,text,uuid
) owner to staff_console_admission_authority;
alter function admin_internal.staff_management_revoke_console_admission_apply_v1(
  uuid,bigint,text,uuid
) owner to staff_console_admission_authority;
alter function public.staff_management_grant_console_admission_v1(
  uuid,text,uuid
) owner to staff_console_admission_authority;
alter function public.staff_management_revoke_console_admission_v1(
  uuid,bigint,text,uuid
) owner to staff_console_admission_authority;

set role staff_authority_write_authority;
grant execute on function admin_internal.lock_current_staff_management_actor_v1(text)
  to staff_console_admission_authority;
grant execute on function admin_internal.lock_staff_console_admission_target_policy_v1(uuid)
  to staff_console_admission_authority;
reset role;

revoke create on schema admin_internal from staff_authority_write_authority;
revoke create on schema admin_internal from staff_console_admission_authority;
revoke create on schema public from staff_console_admission_authority;
revoke staff_authority_write_authority from postgres granted by postgres;
revoke staff_console_admission_authority from postgres granted by postgres;

commit;
