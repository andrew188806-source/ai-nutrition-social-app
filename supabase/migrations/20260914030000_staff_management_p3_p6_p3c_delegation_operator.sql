-- RA-3-IA-P3-P6-P3C: exact GLOBAL staff-permission delegation operators.
-- Delegation records authorize later P3E operations only; they never enter effective permissions.

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
  where permission_key = 'admin.management.staff.delegation.write'
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
      message = 'staff_delegation_write_promotion_mismatch';
  end if;
end;
$$;

-- Replace the P3B private lock with the same source-independent algorithm bounded to either
-- currently operational management writer. The caller still supplies one exact constant.
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
    'admin.management.staff.delegation.write'
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
  'P3C private atomic actor lock, bounded to exact account.write or delegation.write plus admin_context.read and all valid locked authority sources.';

-- This privileged helper locks target account before catalog policy. Its caller receives evidence
-- only; staff_delegation_write_authority receives no account/catalog UPDATE privilege.
create function admin_internal.lock_staff_delegation_target_policy_v1(
  p_target_staff_account_id uuid,
  p_permission_key text
)
returns table (
  target_found boolean,
  target_status text,
  target_effective_from timestamptz,
  target_effective_until timestamptz,
  permission_found boolean,
  permission_lifecycle_status text,
  permission_readiness_status text,
  permission_individually_provisionable boolean,
  permission_temporary_grantable boolean,
  permission_ordinary_supervisor_delegable boolean,
  permission_privileged_only boolean,
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
  where permission.permission_key = p_permission_key
  for update;
  permission_found := found;
  if permission_found then
    permission_lifecycle_status := v_permission.lifecycle_status;
    permission_readiness_status := v_permission.readiness_status;
    permission_individually_provisionable := v_permission.individually_provisionable;
    permission_temporary_grantable := v_permission.temporary_grantable;
    permission_ordinary_supervisor_delegable := v_permission.ordinary_supervisor_delegable;
    permission_privileged_only := v_permission.privileged_only;
    permission_console_admission_required := v_permission.console_admission_required;
  end if;
  return next;
end;
$$;

comment on function admin_internal.lock_staff_delegation_target_policy_v1(uuid,text) is
  'P3C private target-account then permission-catalog lock. It exposes bounded evidence without granting the delegation writer mutation rights on either table.';

revoke all on function admin_internal.lock_current_staff_management_actor_v1(text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.lock_staff_delegation_target_policy_v1(uuid,text)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function admin_internal.lock_current_staff_management_actor_v1(text)
  to staff_account_write_authority, staff_delegation_write_authority;
grant execute on function admin_internal.lock_staff_delegation_target_policy_v1(uuid,text)
  to staff_delegation_write_authority;

reset role;
revoke create on schema admin_internal from staff_authority_write_authority;
revoke staff_authority_write_authority from postgres granted by postgres;

create function admin_internal.staff_management_apply_delegation_operation_v1(
  p_operation_kind text,
  p_delegate_staff_account_id uuid,
  p_permission_key text,
  p_can_grant boolean,
  p_can_revoke boolean,
  p_can_set_temporary boolean,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_delegation_id uuid,
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
  v_actual_effective_from timestamptz;
  v_request_payload jsonb;
  v_prior admin_internal.staff_management_operation_receipts%rowtype;
  v_target record;
  v_delegation admin_internal.staff_permission_delegations%rowtype;
  v_existing admin_internal.staff_permission_delegations%rowtype;
  v_target_staff_account_id uuid;
  v_audit_permission_key text;
  v_result jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_outcome text := 'rejected';
  v_error_code text;
begin
  select actor.actor_auth_user_id, actor.actor_staff_account_id
    into v_actor_auth_user_id, v_actor_staff_account_id
  from admin_internal.lock_current_staff_management_actor_v1(
    'admin.management.staff.delegation.write'
  ) actor;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'permission_denied'
    );
  end if;

  if p_operation_kind not in ('staff_delegation_grant', 'staff_delegation_revoke')
    or p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or (p_reason_code is not null and (
      pg_catalog.length(p_reason_code) not between 1 and 80
      or p_reason_code <> pg_catalog.btrim(p_reason_code)
      or p_reason_code !~ '^[a-z][a-z0-9_]*$'
    ))
  then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
    );
  end if;

  if p_operation_kind = 'staff_delegation_grant' then
    if p_delegate_staff_account_id is null or p_permission_key is null
      or p_permission_key <> pg_catalog.btrim(p_permission_key)
      or p_permission_key !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
      or pg_catalog.strpos(p_permission_key, '*') <> 0
      or pg_catalog.strpos(p_permission_key, '%') <> 0
      or p_can_grant is null or p_can_revoke is null or p_can_set_temporary is null
      or (not p_can_grant and not p_can_revoke)
      or (p_can_set_temporary and not p_can_grant)
      or p_delegation_id is not null or p_expected_status_version is not null
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
      );
    end if;
    v_actual_effective_from := coalesce(p_effective_from, v_database_now);
    if p_effective_until is not null and p_effective_until <= v_actual_effective_from then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_window'
      );
    end if;
    v_request_payload := pg_catalog.jsonb_build_object(
      'operationKind', p_operation_kind,
      'delegateStaffAccountId', p_delegate_staff_account_id,
      'permissionKey', p_permission_key,
      'canGrant', p_can_grant, 'canRevoke', p_can_revoke,
      'canSetTemporary', p_can_set_temporary,
      'effectiveFrom', p_effective_from, 'effectiveUntil', p_effective_until,
      'scopeKind', 'global', 'reasonCode', p_reason_code
    );
  else
    if p_delegation_id is null or p_expected_status_version is null
      or p_expected_status_version < 0
      or p_delegate_staff_account_id is not null or p_permission_key is not null
      or p_can_grant is not null or p_can_revoke is not null
      or p_can_set_temporary is not null or p_effective_from is not null
      or p_effective_until is not null
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
      );
    end if;
    v_request_payload := pg_catalog.jsonb_build_object(
      'operationKind', p_operation_kind, 'delegationId', p_delegation_id,
      'expectedStatusVersion', p_expected_status_version, 'reasonCode', p_reason_code
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_auth_user_id::text || ':' || p_request_id::text, 0
  ));
  select receipt.* into v_prior
  from admin_internal.staff_management_operation_receipts receipt
  where receipt.actor_auth_user_id = v_actor_auth_user_id
    and receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> p_operation_kind
      or v_prior.request_payload is distinct from v_request_payload
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'request_conflict'
      );
    end if;
    return v_prior.result_payload;
  end if;

  if p_operation_kind = 'staff_delegation_revoke' then
    select delegation.* into v_delegation
    from admin_internal.staff_permission_delegations delegation
    where delegation.delegation_id = p_delegation_id;
    if found then
      v_target_staff_account_id := v_delegation.delegate_staff_account_id;
      v_audit_permission_key := v_delegation.permission_key;
    else
      v_error_code := 'delegation_not_found';
    end if;
  else
    v_target_staff_account_id := p_delegate_staff_account_id;
  end if;

  if v_error_code is null then
    select * into v_target
    from admin_internal.lock_staff_delegation_target_policy_v1(
      v_target_staff_account_id,
      coalesce(p_permission_key, v_delegation.permission_key)
    );
    if v_target.permission_found then
      v_audit_permission_key := coalesce(p_permission_key, v_delegation.permission_key);
    end if;

    if not v_target.target_found then
      v_error_code := 'target_not_found';
      v_target_staff_account_id := null;
    elsif v_target_staff_account_id = v_actor_staff_account_id then
      v_error_code := 'self_target_denied';
    elsif v_target.target_status <> 'active' then
      v_error_code := 'target_ineligible';
    elsif p_operation_kind = 'staff_delegation_grant' then
      if v_actual_effective_from < v_target.target_effective_from
        or (v_target.target_effective_until is not null and (
          p_effective_until is null
          or p_effective_until > v_target.target_effective_until
        ))
      then
        v_error_code := 'window_outside_target';
      elsif not v_target.permission_found then
        v_error_code := 'permission_ineligible';
      elsif p_permission_key = 'admin_context.read'
        or p_permission_key like 'admin.management.%'
        or v_target.permission_lifecycle_status <> 'active'
        or v_target.permission_readiness_status <> 'current'
        or not v_target.permission_ordinary_supervisor_delegable
        or v_target.permission_console_admission_required
        or v_target.permission_privileged_only
        or (p_can_grant and not v_target.permission_individually_provisionable)
        or (p_can_set_temporary and not v_target.permission_temporary_grantable)
      then
        v_error_code := 'permission_ineligible';
      else
        select delegation.* into v_existing
        from admin_internal.staff_permission_delegations delegation
        where delegation.delegate_staff_account_id = p_delegate_staff_account_id
          and delegation.permission_key = p_permission_key
          and delegation.scope_kind = 'global'
          and delegation.status = 'active'
        for update;
        if found then
          v_delegation := v_existing;
          v_error_code := 'delegation_exists';
        else
          begin
            insert into admin_internal.staff_permission_delegations (
              delegate_staff_account_id, permission_key, can_grant, can_revoke,
              can_set_temporary, scope_kind, status, effective_from, effective_until,
              granted_by_auth_user_id, granted_by_staff_account_id, granted_at,
              status_version, created_at, updated_at
            ) values (
              p_delegate_staff_account_id, p_permission_key, p_can_grant, p_can_revoke,
              p_can_set_temporary, 'global', 'active', v_actual_effective_from,
              p_effective_until, v_actor_auth_user_id, v_actor_staff_account_id,
              v_database_now, 0, v_database_now, v_database_now
            ) returning * into v_delegation;
            v_outcome := 'applied';
          exception when unique_violation then
            select delegation.* into v_delegation
            from admin_internal.staff_permission_delegations delegation
            where delegation.delegate_staff_account_id = p_delegate_staff_account_id
              and delegation.permission_key = p_permission_key
              and delegation.scope_kind = 'global'
              and delegation.status = 'active';
            v_error_code := 'delegation_exists';
          end;
        end if;
      end if;
    else
      select delegation.* into v_delegation
      from admin_internal.staff_permission_delegations delegation
      where delegation.delegation_id = p_delegation_id
      for update;
      if not found then
        v_error_code := 'delegation_not_found';
      elsif v_delegation.delegate_staff_account_id <> v_target_staff_account_id then
        v_error_code := 'stale_state';
      elsif v_delegation.status_version <> p_expected_status_version then
        v_error_code := 'stale_state';
      elsif v_delegation.status <> 'active' then
        v_error_code := 'mutation_rejected';
      else
        v_before_state := pg_catalog.jsonb_build_object(
          'status', v_delegation.status, 'statusVersion', v_delegation.status_version,
          'canGrant', v_delegation.can_grant, 'canRevoke', v_delegation.can_revoke,
          'canSetTemporary', v_delegation.can_set_temporary,
          'effectiveFrom', v_delegation.effective_from,
          'effectiveUntil', v_delegation.effective_until, 'scopeKind', v_delegation.scope_kind
        );
        update admin_internal.staff_permission_delegations
        set status = 'revoked', revoked_by_auth_user_id = v_actor_auth_user_id,
            revoked_by_staff_account_id = v_actor_staff_account_id,
            revoked_at = v_database_now, status_version = status_version + 1,
            updated_at = v_database_now
        where delegation_id = p_delegation_id
        returning * into v_delegation;
        v_outcome := 'applied';
      end if;
    end if;
  end if;

  if v_delegation.delegation_id is not null and v_before_state is null
    and p_operation_kind = 'staff_delegation_revoke'
  then
    v_before_state := pg_catalog.jsonb_build_object(
      'status', v_delegation.status, 'statusVersion', v_delegation.status_version,
      'canGrant', v_delegation.can_grant, 'canRevoke', v_delegation.can_revoke,
      'canSetTemporary', v_delegation.can_set_temporary,
      'effectiveFrom', v_delegation.effective_from,
      'effectiveUntil', v_delegation.effective_until, 'scopeKind', v_delegation.scope_kind
    );
  end if;
  if v_delegation.delegation_id is not null then
    v_after_state := pg_catalog.jsonb_build_object(
      'status', v_delegation.status, 'statusVersion', v_delegation.status_version,
      'canGrant', v_delegation.can_grant, 'canRevoke', v_delegation.can_revoke,
      'canSetTemporary', v_delegation.can_set_temporary,
      'effectiveFrom', v_delegation.effective_from,
      'effectiveUntil', v_delegation.effective_until, 'scopeKind', v_delegation.scope_kind
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'ok', v_outcome = 'applied', 'outcome', v_outcome, 'errorCode', v_error_code,
    'delegationId', v_delegation.delegation_id,
    'delegateStaffAccountId', v_target_staff_account_id,
    'permissionKey', coalesce(v_audit_permission_key, p_permission_key),
    'status', v_delegation.status, 'statusVersion', v_delegation.status_version,
    'occurredAt', v_database_now
  );

  insert into admin_internal.staff_management_operation_receipts (
    actor_auth_user_id, actor_staff_account_id, request_id, operation_kind,
    request_payload, result_payload, created_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, p_request_id, p_operation_kind,
    v_request_payload, v_result, v_database_now
  );

  insert into admin_internal.staff_management_audit_log (
    actor_auth_user_id, actor_staff_account_id, target_staff_account_id,
    operation_kind, permission_key, delegation_id, reason_code, request_id,
    outcome, before_state, after_state, occurred_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, v_target_staff_account_id,
    p_operation_kind, v_audit_permission_key, v_delegation.delegation_id,
    p_reason_code, p_request_id, v_outcome, v_before_state, v_after_state, v_database_now
  );
  return v_result;
end;
$$;

create function public.staff_management_grant_permission_delegation_v1(
  p_delegate_staff_account_id uuid,
  p_permission_key text,
  p_can_grant boolean,
  p_can_revoke boolean,
  p_can_set_temporary boolean,
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
  select admin_internal.staff_management_apply_delegation_operation_v1(
    'staff_delegation_grant', p_delegate_staff_account_id, p_permission_key,
    p_can_grant, p_can_revoke, p_can_set_temporary, p_effective_from,
    p_effective_until, null, null, p_reason_code, p_request_id
  );
$$;

create function public.staff_management_revoke_permission_delegation_v1(
  p_delegation_id uuid,
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
  select admin_internal.staff_management_apply_delegation_operation_v1(
    'staff_delegation_revoke', null, null, null, null, null, null, null,
    p_delegation_id, p_expected_status_version, p_reason_code, p_request_id
  );
$$;

comment on function public.staff_management_grant_permission_delegation_v1(
  uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid
) is 'P3C authenticated exact GLOBAL delegation grant operator. It creates no entitlement or runtime permission.';
comment on function public.staff_management_revoke_permission_delegation_v1(
  uuid,bigint,text,uuid
) is 'P3C authenticated terminal delegation revoke operator with exact status-version CAS.';

revoke all on function admin_internal.staff_management_apply_delegation_operation_v1(
  text,uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,uuid,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_grant_permission_delegation_v1(
  uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_revoke_permission_delegation_v1(
  uuid,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;

grant execute on function public.staff_management_grant_permission_delegation_v1(
  uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid
) to authenticated;
grant execute on function public.staff_management_revoke_permission_delegation_v1(
  uuid,bigint,text,uuid
) to authenticated;

grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant staff_delegation_write_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
grant create on schema admin_internal to staff_delegation_write_authority;
grant create on schema public to staff_delegation_write_authority;
alter function admin_internal.lock_current_staff_management_actor_v1(text)
  owner to staff_authority_write_authority;
alter function admin_internal.lock_staff_delegation_target_policy_v1(uuid,text)
  owner to staff_authority_write_authority;
alter function admin_internal.staff_management_apply_delegation_operation_v1(
  text,uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,uuid,bigint,text,uuid
) owner to staff_delegation_write_authority;
alter function public.staff_management_grant_permission_delegation_v1(
  uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid
) owner to staff_delegation_write_authority;
alter function public.staff_management_revoke_permission_delegation_v1(
  uuid,bigint,text,uuid
) owner to staff_delegation_write_authority;
revoke create on schema admin_internal from staff_authority_write_authority;
revoke create on schema admin_internal from staff_delegation_write_authority;
revoke create on schema public from staff_delegation_write_authority;
revoke staff_authority_write_authority from postgres granted by postgres;
revoke staff_delegation_write_authority from postgres granted by postgres;

commit;
