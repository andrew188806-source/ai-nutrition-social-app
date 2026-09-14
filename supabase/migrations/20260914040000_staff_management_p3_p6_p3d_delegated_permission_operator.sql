-- RA-3-IA-P3-P6-P3D: exact delegated individual-permission grant/revoke operators.
--
-- A P3C delegation is the sole operational authority source. It is never itself a runtime
-- entitlement, and each entitlement created here is bound to one immutable provenance row.

begin;

create table admin_internal.staff_delegated_permission_grants (
  delegated_grant_id uuid not null default pg_catalog.gen_random_uuid(),
  entitlement_id uuid not null,
  delegation_id uuid not null,
  target_staff_account_id uuid not null,
  permission_key text not null,
  granted_by_auth_user_id uuid not null,
  granted_by_staff_account_id uuid not null,
  status text not null default 'active',
  status_version bigint not null default 0,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  revoked_by_auth_user_id uuid,
  revoked_by_staff_account_id uuid,
  constraint staff_delegated_permission_grants_pkey primary key (delegated_grant_id),
  constraint staff_delegated_permission_grants_entitlement_key unique (entitlement_id),
  constraint staff_delegated_permission_grants_entitlement_fkey
    foreign key (entitlement_id)
    references admin_internal.staff_permission_entitlements (entitlement_id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_delegation_fkey
    foreign key (delegation_id)
    references admin_internal.staff_permission_delegations (delegation_id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_target_fkey
    foreign key (target_staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_permission_fkey
    foreign key (permission_key)
    references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_granted_auth_fkey
    foreign key (granted_by_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_granted_staff_fkey
    foreign key (granted_by_staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_revoked_auth_fkey
    foreign key (revoked_by_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_revoked_staff_fkey
    foreign key (revoked_by_staff_account_id)
    references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_delegated_permission_grants_permission_shape_check check (
    permission_key = pg_catalog.btrim(permission_key)
    and permission_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    and pg_catalog.strpos(permission_key, '*') = 0
    and pg_catalog.strpos(permission_key, '%') = 0
  ),
  constraint staff_delegated_permission_grants_status_check
    check (status in ('active', 'revoked')),
  constraint staff_delegated_permission_grants_status_version_check
    check (status_version >= 0),
  constraint staff_delegated_permission_grants_revocation_shape_check check (
    (status = 'active' and revoked_at is null and revoked_by_auth_user_id is null
      and revoked_by_staff_account_id is null)
    or
    (status = 'revoked' and revoked_at is not null and revoked_by_auth_user_id is not null
      and revoked_by_staff_account_id is not null)
  )
);

create unique index staff_delegated_permission_grants_active_source_key
  on admin_internal.staff_delegated_permission_grants
  (delegation_id, target_staff_account_id, permission_key)
  where status = 'active';

create index staff_delegated_permission_grants_target_permission_idx
  on admin_internal.staff_delegated_permission_grants
  (target_staff_account_id, permission_key, status, created_at desc);

comment on table admin_internal.staff_delegated_permission_grants is
  'P3D immutable provenance linking one supervisor delegation to one exact direct entitlement. Revoked rows are terminal; P3D seeds no rows and performs no backfill.';

create function admin_internal.enforce_staff_delegated_permission_grant_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_entitlement admin_internal.staff_permission_entitlements%rowtype;
  v_delegation admin_internal.staff_permission_delegations%rowtype;
begin
  if tg_op = 'UPDATE' and old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514',
      message = 'staff_delegated_permission_grant_revoked_terminal';
  end if;
  if tg_op = 'UPDATE' and (
    new.entitlement_id is distinct from old.entitlement_id
    or new.delegation_id is distinct from old.delegation_id
    or new.target_staff_account_id is distinct from old.target_staff_account_id
    or new.permission_key is distinct from old.permission_key
    or new.granted_by_auth_user_id is distinct from old.granted_by_auth_user_id
    or new.granted_by_staff_account_id is distinct from old.granted_by_staff_account_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '23514',
      message = 'staff_delegated_permission_grant_provenance_immutable';
  end if;

  select entitlement.* into v_entitlement
  from admin_internal.staff_permission_entitlements entitlement
  where entitlement.entitlement_id = new.entitlement_id;
  if not found
    or v_entitlement.staff_account_id <> new.target_staff_account_id
    or v_entitlement.permission_key <> new.permission_key
    or v_entitlement.source_type <> 'direct_grant'
    or v_entitlement.source_bundle_assignment_id is not null
    or v_entitlement.status <> new.status
  then
    raise exception using errcode = '23514',
      message = 'staff_delegated_permission_grant_entitlement_mismatch';
  end if;

  select delegation.* into v_delegation
  from admin_internal.staff_permission_delegations delegation
  where delegation.delegation_id = new.delegation_id;
  if not found or v_delegation.permission_key <> new.permission_key then
    raise exception using errcode = '23514',
      message = 'staff_delegated_permission_grant_delegation_mismatch';
  end if;
  return new;
end;
$$;

create trigger staff_delegated_permission_grants_consistency_v1
before insert or update on admin_internal.staff_delegated_permission_grants
for each row execute function admin_internal.enforce_staff_delegated_permission_grant_v1();

create function admin_internal.prevent_staff_permission_entitlement_reactivation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514',
      message = 'staff_permission_entitlement_revoked_terminal';
  end if;
  return new;
end;
$$;

create trigger staff_permission_entitlements_revoked_terminal_v1
before update on admin_internal.staff_permission_entitlements
for each row execute function admin_internal.prevent_staff_permission_entitlement_reactivation_v1();

alter table admin_internal.staff_delegated_permission_grants enable row level security;
alter table admin_internal.staff_delegated_permission_grants force row level security;

create policy staff_delegated_permission_grants_writer_select
  on admin_internal.staff_delegated_permission_grants for select
  to staff_direct_grant_authority using (true);
create policy staff_delegated_permission_grants_writer_insert
  on admin_internal.staff_delegated_permission_grants for insert
  to staff_direct_grant_authority with check (true);
create policy staff_delegated_permission_grants_writer_update
  on admin_internal.staff_delegated_permission_grants for update
  to staff_direct_grant_authority using (true) with check (true);

create policy staff_permission_entitlements_direct_writer_select
  on admin_internal.staff_permission_entitlements for select
  to staff_direct_grant_authority using (true);
create policy staff_permission_entitlements_direct_writer_insert
  on admin_internal.staff_permission_entitlements for insert
  to staff_direct_grant_authority with check (
    source_type = 'direct_grant' and source_bundle_assignment_id is null
  );
create policy staff_permission_entitlements_direct_writer_update
  on admin_internal.staff_permission_entitlements for update
  to staff_direct_grant_authority using (
    source_type = 'direct_grant'
    and exists (
      select 1
      from admin_internal.staff_delegated_permission_grants delegated
      where delegated.entitlement_id = staff_permission_entitlements.entitlement_id
        and delegated.status = 'active'
    )
  ) with check (source_type = 'direct_grant' and source_bundle_assignment_id is null);

create policy staff_permission_delegations_direct_reader_select
  on admin_internal.staff_permission_delegations for select
  to staff_direct_grant_authority using (true);

revoke all on table admin_internal.staff_delegated_permission_grants
  from public, anon, authenticated, authenticator, service_role;

grant select, insert on table admin_internal.staff_delegated_permission_grants
  to staff_direct_grant_authority;
grant update (status, status_version, updated_at, revoked_at,
  revoked_by_auth_user_id, revoked_by_staff_account_id)
  on table admin_internal.staff_delegated_permission_grants
  to staff_direct_grant_authority;

grant select (entitlement_id, staff_account_id, permission_key, source_type,
  source_bundle_assignment_id, status, effective_from, effective_until, created_at, revoked_at)
  on table admin_internal.staff_permission_entitlements to staff_direct_grant_authority;
grant insert (staff_account_id, permission_key, source_type,
  source_bundle_assignment_id, status, effective_from, effective_until, created_at)
  on table admin_internal.staff_permission_entitlements to staff_direct_grant_authority;
grant update (status, revoked_at)
  on table admin_internal.staff_permission_entitlements to staff_direct_grant_authority;
grant select on table admin_internal.staff_permission_delegations
  to staff_direct_grant_authority;

-- Actor locking is independent of console admission and of every management permission.
create function admin_internal.lock_current_staff_delegated_actor_v1()
returns table (actor_auth_user_id uuid, actor_staff_account_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor_auth_user_id uuid;
  v_actor_staff_account_id uuid;
  v_account admin_internal.staff_accounts%rowtype;
  v_database_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_actor_auth_user_id := admin_internal.staff_request_subject_v1();
  if v_actor_auth_user_id is null then return; end if;

  select account.* into v_account
  from admin_internal.staff_accounts account
  where account.auth_user_id = v_actor_auth_user_id
  for update;
  if not found
    or v_account.status <> 'active'
    or v_account.effective_from > v_database_now
    or (v_account.effective_until is not null and v_database_now >= v_account.effective_until)
  then
    return;
  end if;
  v_actor_staff_account_id := v_account.id;
  return query select v_actor_auth_user_id, v_actor_staff_account_id;
end;
$$;

-- P3D follows P3C's target -> catalogue -> delegation order. This helper performs the final
-- delegation lock after the existing P3C target/catalogue helper has returned locked evidence.
create function admin_internal.lock_staff_delegated_permission_source_v1(
  p_delegation_id uuid
)
returns table (
  delegation_found boolean,
  delegate_staff_account_id uuid,
  permission_key text,
  can_grant boolean,
  can_revoke boolean,
  can_set_temporary boolean,
  scope_kind text,
  status text,
  effective_from timestamptz,
  effective_until timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_delegation admin_internal.staff_permission_delegations%rowtype;
begin
  select delegation.* into v_delegation
  from admin_internal.staff_permission_delegations delegation
  where delegation.delegation_id = p_delegation_id
  for update;
  delegation_found := found;
  if delegation_found then
    delegate_staff_account_id := v_delegation.delegate_staff_account_id;
    permission_key := v_delegation.permission_key;
    can_grant := v_delegation.can_grant;
    can_revoke := v_delegation.can_revoke;
    can_set_temporary := v_delegation.can_set_temporary;
    scope_kind := v_delegation.scope_kind;
    status := v_delegation.status;
    effective_from := v_delegation.effective_from;
    effective_until := v_delegation.effective_until;
  end if;
  return next;
end;
$$;

create function admin_internal.staff_delegated_grant_permission_apply_v1(
  p_delegation_id uuid,
  p_target_staff_account_id uuid,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
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
  v_pre_delegation admin_internal.staff_permission_delegations%rowtype;
  v_delegation record;
  v_target record;
  v_prior admin_internal.staff_management_operation_receipts%rowtype;
  v_entitlement admin_internal.staff_permission_entitlements%rowtype;
  v_grant admin_internal.staff_delegated_permission_grants%rowtype;
  v_request_payload jsonb;
  v_result jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_actual_effective_from timestamptz;
  v_actual_effective_until timestamptz;
  v_custom_window boolean;
  v_audit_target_staff_account_id uuid;
  v_error_code text;
  v_outcome text := 'rejected';
begin
  if p_delegation_id is null or p_target_staff_account_id is null
    or p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or p_reason_code is null
    or pg_catalog.length(p_reason_code) not between 1 and 80
    or p_reason_code <> pg_catalog.btrim(p_reason_code)
    or p_reason_code !~ '^[a-z][a-z0-9_]*$'
    or (p_effective_until is not null and p_effective_from is not null
      and p_effective_until <= p_effective_from)
  then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
    );
  end if;

  select actor.actor_auth_user_id, actor.actor_staff_account_id
    into v_actor_auth_user_id, v_actor_staff_account_id
  from admin_internal.lock_current_staff_delegated_actor_v1() actor;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'permission_denied'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_auth_user_id::text || ':' || p_request_id::text, 0
  ));

  select delegation.* into v_pre_delegation
  from admin_internal.staff_permission_delegations delegation
  where delegation.delegation_id = p_delegation_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'delegation_denied'
    );
  end if;

  select * into v_target
  from admin_internal.lock_staff_delegation_target_policy_v1(
    p_target_staff_account_id, v_pre_delegation.permission_key
  );
  select * into v_delegation
  from admin_internal.lock_staff_delegated_permission_source_v1(p_delegation_id);

  if not v_delegation.delegation_found
    or v_delegation.delegate_staff_account_id <> v_actor_staff_account_id
    or v_delegation.permission_key <> v_pre_delegation.permission_key
    or v_delegation.scope_kind <> 'global'
    or v_delegation.status <> 'active'
    or v_delegation.effective_from > v_database_now
    or (v_delegation.effective_until is not null
      and v_database_now >= v_delegation.effective_until)
    or not v_delegation.can_grant
  then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'delegation_denied'
    );
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operationKind', 'staff_permission_grant',
    'delegationId', p_delegation_id,
    'targetStaffAccountId', p_target_staff_account_id,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'reasonCode', p_reason_code
  );

  select receipt.* into v_prior
  from admin_internal.staff_management_operation_receipts receipt
  where receipt.actor_auth_user_id = v_actor_auth_user_id
    and receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> 'staff_permission_grant'
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
  v_custom_window := p_effective_from is not null or p_effective_until is not null;

  if not v_target.target_found then
    v_error_code := 'target_not_found';
  elsif p_target_staff_account_id = v_actor_staff_account_id then
    v_error_code := 'self_target_denied';
  elsif v_target.target_status <> 'active' then
    v_error_code := 'target_ineligible';
  elsif not v_target.permission_found
    or v_delegation.permission_key = 'admin_context.read'
    or v_delegation.permission_key like 'admin.management.%'
    or v_delegation.permission_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
    or pg_catalog.strpos(v_delegation.permission_key, '*') <> 0
    or pg_catalog.strpos(v_delegation.permission_key, '%') <> 0
    or v_target.permission_lifecycle_status <> 'active'
    or v_target.permission_readiness_status <> 'current'
    or not v_target.permission_individually_provisionable
    or not v_target.permission_ordinary_supervisor_delegable
    or v_target.permission_console_admission_required
    or v_target.permission_privileged_only
  then
    v_error_code := 'permission_ineligible';
  elsif v_custom_window and not v_delegation.can_set_temporary then
    v_error_code := 'custom_window_denied';
  elsif v_custom_window and not v_target.permission_temporary_grantable then
    v_error_code := 'temporary_permission_ineligible';
  else
    if v_custom_window then
      v_actual_effective_from := coalesce(p_effective_from, v_database_now);
      v_actual_effective_until := p_effective_until;
    else
      v_actual_effective_from := v_database_now;
      v_actual_effective_until := case
        when v_target.target_effective_until is null then v_delegation.effective_until
        when v_delegation.effective_until is null then v_target.target_effective_until
        else least(v_target.target_effective_until, v_delegation.effective_until)
      end;
    end if;

    if (v_actual_effective_until is not null
        and v_actual_effective_until <= v_actual_effective_from)
      or v_actual_effective_from < v_target.target_effective_from
      or v_actual_effective_from < v_delegation.effective_from
      or (v_target.target_effective_until is not null and (
        v_actual_effective_until is null
        or v_actual_effective_until > v_target.target_effective_until
      ))
      or (v_delegation.effective_until is not null and (
        v_actual_effective_until is null
        or v_actual_effective_until > v_delegation.effective_until
      ))
    then
      v_error_code := 'window_outside_authority';
    end if;
  end if;

  if v_error_code is null then
    begin
      insert into admin_internal.staff_permission_entitlements (
        staff_account_id, permission_key, source_type, source_bundle_assignment_id,
        status, effective_from, effective_until, created_at
      ) values (
        p_target_staff_account_id, v_delegation.permission_key, 'direct_grant', null,
        'active', v_actual_effective_from, v_actual_effective_until, v_database_now
      ) returning * into v_entitlement;

      insert into admin_internal.staff_delegated_permission_grants (
        entitlement_id, delegation_id, target_staff_account_id, permission_key,
        granted_by_auth_user_id, granted_by_staff_account_id, status,
        status_version, created_at, updated_at
      ) values (
        v_entitlement.entitlement_id, p_delegation_id, p_target_staff_account_id,
        v_delegation.permission_key, v_actor_auth_user_id, v_actor_staff_account_id,
        'active', 0, v_database_now, v_database_now
      ) returning * into v_grant;
      v_outcome := 'applied';
    exception when unique_violation then
      v_entitlement := null;
      v_grant := null;
      v_error_code := 'delegated_grant_exists';
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
    'delegatedGrantId', v_grant.delegated_grant_id,
    'entitlementId', v_entitlement.entitlement_id,
    'delegationId', p_delegation_id,
    'targetStaffAccountId', p_target_staff_account_id,
    'permissionKey', v_delegation.permission_key,
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
    'staff_permission_grant', v_request_payload, v_result, v_database_now
  );
  insert into admin_internal.staff_management_audit_log (
    actor_auth_user_id, actor_staff_account_id, target_staff_account_id,
    operation_kind, permission_key, delegation_id, entitlement_id, reason_code,
    request_id, outcome, before_state, after_state, occurred_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, v_audit_target_staff_account_id,
    'staff_permission_grant', v_delegation.permission_key, p_delegation_id,
    v_entitlement.entitlement_id, p_reason_code, p_request_id, v_outcome,
    v_before_state, v_after_state, v_database_now
  );
  return v_result;
end;
$$;

create function admin_internal.staff_delegated_revoke_permission_apply_v1(
  p_delegation_id uuid,
  p_delegated_grant_id uuid,
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
  v_pre_grant admin_internal.staff_delegated_permission_grants%rowtype;
  v_grant admin_internal.staff_delegated_permission_grants%rowtype;
  v_entitlement admin_internal.staff_permission_entitlements%rowtype;
  v_delegation record;
  v_target record;
  v_prior admin_internal.staff_management_operation_receipts%rowtype;
  v_request_payload jsonb;
  v_result jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_error_code text;
  v_outcome text := 'rejected';
begin
  if p_delegation_id is null or p_delegated_grant_id is null
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
  from admin_internal.lock_current_staff_delegated_actor_v1() actor;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'permission_denied'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_auth_user_id::text || ':' || p_request_id::text, 0
  ));
  select delegated.* into v_pre_grant
  from admin_internal.staff_delegated_permission_grants delegated
  where delegated.delegated_grant_id = p_delegated_grant_id;
  if not found or v_pre_grant.delegation_id <> p_delegation_id then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'delegated_grant_not_found'
    );
  end if;

  select * into v_target
  from admin_internal.lock_staff_delegation_target_policy_v1(
    v_pre_grant.target_staff_account_id, v_pre_grant.permission_key
  );
  select * into v_delegation
  from admin_internal.lock_staff_delegated_permission_source_v1(p_delegation_id);

  if not v_delegation.delegation_found
    or v_delegation.delegate_staff_account_id <> v_actor_staff_account_id
    or v_delegation.permission_key <> v_pre_grant.permission_key
    or v_delegation.scope_kind <> 'global'
    or v_delegation.status <> 'active'
    or v_delegation.effective_from > v_database_now
    or (v_delegation.effective_until is not null
      and v_database_now >= v_delegation.effective_until)
    or not v_delegation.can_revoke
  then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'delegation_denied'
    );
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operationKind', 'staff_permission_revoke',
    'delegationId', p_delegation_id,
    'delegatedGrantId', p_delegated_grant_id,
    'expectedStatusVersion', p_expected_status_version,
    'reasonCode', p_reason_code
  );
  select receipt.* into v_prior
  from admin_internal.staff_management_operation_receipts receipt
  where receipt.actor_auth_user_id = v_actor_auth_user_id
    and receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> 'staff_permission_revoke'
      or v_prior.request_payload is distinct from v_request_payload
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'request_conflict'
      );
    end if;
    return v_prior.result_payload;
  end if;

  if not v_target.target_found
    or v_pre_grant.target_staff_account_id = v_actor_staff_account_id
  then
    v_error_code := case when v_pre_grant.target_staff_account_id = v_actor_staff_account_id
      then 'self_target_denied' else 'target_not_found' end;
  elsif v_target.target_status <> 'active'
    or v_target.target_effective_from > v_database_now
    or (v_target.target_effective_until is not null
      and v_database_now >= v_target.target_effective_until)
  then
    v_error_code := 'target_ineligible';
  elsif not v_target.permission_found
    or v_pre_grant.permission_key = 'admin_context.read'
    or v_pre_grant.permission_key like 'admin.management.%'
    or v_target.permission_lifecycle_status <> 'active'
    or v_target.permission_readiness_status <> 'current'
    or not v_target.permission_individually_provisionable
    or not v_target.permission_ordinary_supervisor_delegable
    or v_target.permission_console_admission_required
    or v_target.permission_privileged_only
  then
    v_error_code := 'permission_ineligible';
  else
    select delegated.* into v_grant
    from admin_internal.staff_delegated_permission_grants delegated
    where delegated.delegated_grant_id = p_delegated_grant_id
    for update;
    if not found
      or v_grant.delegation_id <> p_delegation_id
      or v_grant.target_staff_account_id <> v_pre_grant.target_staff_account_id
      or v_grant.permission_key <> v_pre_grant.permission_key
      or v_grant.status_version <> p_expected_status_version
    then
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
        or v_entitlement.permission_key <> v_grant.permission_key
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
        update admin_internal.staff_delegated_permission_grants
        set status = 'revoked', status_version = status_version + 1,
            updated_at = v_database_now, revoked_at = v_database_now,
            revoked_by_auth_user_id = v_actor_auth_user_id,
            revoked_by_staff_account_id = v_actor_staff_account_id
        where delegated_grant_id = p_delegated_grant_id
          and status = 'active'
          and status_version = p_expected_status_version
        returning * into v_grant;
        if not found then
          raise exception using errcode = '40001',
            message = 'staff_delegated_permission_revoke_concurrent_state';
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
    'delegatedGrantId', p_delegated_grant_id,
    'entitlementId', v_pre_grant.entitlement_id,
    'delegationId', p_delegation_id,
    'targetStaffAccountId', v_pre_grant.target_staff_account_id,
    'permissionKey', v_pre_grant.permission_key,
    'status', v_grant.status,
    'statusVersion', v_grant.status_version,
    'occurredAt', v_database_now
  );

  insert into admin_internal.staff_management_operation_receipts (
    actor_auth_user_id, actor_staff_account_id, request_id, operation_kind,
    request_payload, result_payload, created_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, p_request_id,
    'staff_permission_revoke', v_request_payload, v_result, v_database_now
  );
  insert into admin_internal.staff_management_audit_log (
    actor_auth_user_id, actor_staff_account_id, target_staff_account_id,
    operation_kind, permission_key, delegation_id, entitlement_id, reason_code,
    request_id, outcome, before_state, after_state, occurred_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, v_pre_grant.target_staff_account_id,
    'staff_permission_revoke', v_pre_grant.permission_key, p_delegation_id,
    v_pre_grant.entitlement_id, p_reason_code, p_request_id, v_outcome,
    v_before_state, v_after_state, v_database_now
  );
  return v_result;
end;
$$;

create function public.staff_delegated_grant_permission_v1(
  p_delegation_id uuid,
  p_target_staff_account_id uuid,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
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
  select admin_internal.staff_delegated_grant_permission_apply_v1(
    p_delegation_id, p_target_staff_account_id, p_effective_from,
    p_effective_until, p_reason_code, p_request_id
  );
$$;

create function public.staff_delegated_revoke_permission_v1(
  p_delegation_id uuid,
  p_delegated_grant_id uuid,
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
  select admin_internal.staff_delegated_revoke_permission_apply_v1(
    p_delegation_id, p_delegated_grant_id, p_expected_status_version,
    p_reason_code, p_request_id
  );
$$;

comment on function public.staff_delegated_grant_permission_v1(
  uuid,uuid,timestamptz,timestamptz,text,uuid
) is 'P3D authenticated exact-delegation operator creating one direct entitlement and one immutable provenance source.';
comment on function public.staff_delegated_revoke_permission_v1(
  uuid,uuid,bigint,text,uuid
) is 'P3D authenticated source-exact terminal revoke operator with delegation authority and provenance CAS.';

revoke all on function admin_internal.enforce_staff_delegated_permission_grant_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.prevent_staff_permission_entitlement_reactivation_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.lock_current_staff_delegated_actor_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.lock_staff_delegated_permission_source_v1(uuid)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.staff_delegated_grant_permission_apply_v1(
  uuid,uuid,timestamptz,timestamptz,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.staff_delegated_revoke_permission_apply_v1(
  uuid,uuid,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_delegated_grant_permission_v1(
  uuid,uuid,timestamptz,timestamptz,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_delegated_revoke_permission_v1(
  uuid,uuid,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;

grant execute on function public.staff_delegated_grant_permission_v1(
  uuid,uuid,timestamptz,timestamptz,text,uuid
) to authenticated;
grant execute on function public.staff_delegated_revoke_permission_v1(
  uuid,uuid,bigint,text,uuid
) to authenticated;

-- Grant helper execution as each helper's sealed owner, then seal schema CREATE again.
grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
set role staff_authority_context_reader;
grant execute on function admin_internal.staff_request_subject_v1()
  to staff_authority_write_authority;
reset role;
revoke staff_authority_context_reader from postgres granted by postgres;

grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant staff_delegation_write_authority to postgres with admin false, inherit false, set true;
grant staff_direct_grant_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
grant create on schema admin_internal to staff_delegation_write_authority;
grant create on schema admin_internal to staff_direct_grant_authority;
grant create on schema public to staff_direct_grant_authority;

alter function admin_internal.lock_current_staff_delegated_actor_v1()
  owner to staff_authority_write_authority;
alter function admin_internal.lock_staff_delegated_permission_source_v1(uuid)
  owner to staff_delegation_write_authority;
alter function admin_internal.staff_delegated_grant_permission_apply_v1(
  uuid,uuid,timestamptz,timestamptz,text,uuid
) owner to staff_direct_grant_authority;
alter function admin_internal.staff_delegated_revoke_permission_apply_v1(
  uuid,uuid,bigint,text,uuid
) owner to staff_direct_grant_authority;
alter function public.staff_delegated_grant_permission_v1(
  uuid,uuid,timestamptz,timestamptz,text,uuid
) owner to staff_direct_grant_authority;
alter function public.staff_delegated_revoke_permission_v1(
  uuid,uuid,bigint,text,uuid
) owner to staff_direct_grant_authority;

set role staff_authority_write_authority;
grant execute on function admin_internal.lock_current_staff_delegated_actor_v1()
  to staff_direct_grant_authority;
grant execute on function admin_internal.lock_staff_delegation_target_policy_v1(uuid,text)
  to staff_direct_grant_authority;
reset role;
set role staff_delegation_write_authority;
grant execute on function admin_internal.lock_staff_delegated_permission_source_v1(uuid)
  to staff_direct_grant_authority;
reset role;

revoke create on schema admin_internal from staff_authority_write_authority;
revoke create on schema admin_internal from staff_delegation_write_authority;
revoke create on schema admin_internal from staff_direct_grant_authority;
revoke create on schema public from staff_direct_grant_authority;
revoke staff_authority_write_authority from postgres granted by postgres;
revoke staff_delegation_write_authority from postgres granted by postgres;
revoke staff_direct_grant_authority from postgres granted by postgres;

commit;
