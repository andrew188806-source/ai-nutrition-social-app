-- RA-3-IA-P3-P6-P3B: staff-account lifecycle operator authority.
--
-- Lock order: actor account -> exact catalog keys -> actor Bundle sources -> actor
-- entitlements -> actor/request advisory lock -> target identity/account -> receipt/audit.

begin;

-- Promote only the exact account operator key. The catalogue FORCEs RLS, so use the
-- frozen catalogue writer for this bounded transition and release SET membership.
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
set role staff_authority_write_authority;
do $$
declare
  v_updated integer;
begin
  update admin_internal.staff_permission_catalog
  set readiness_status = 'current', updated_at = pg_catalog.statement_timestamp()
  where permission_key = 'admin.management.staff.account.write'
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
    raise exception using errcode = '23514', message = 'staff_account_write_promotion_mismatch';
  end if;
end;
$$;
reset role;
revoke staff_authority_write_authority from postgres granted by postgres;

-- Revocation is a terminal account lifecycle state for every writer, including future ones.
create function admin_internal.prevent_staff_account_reactivation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514', message = 'staff_account_revoked_terminal';
  end if;
  return new;
end;
$$;

create trigger staff_accounts_revoked_terminal_v1
before update on admin_internal.staff_accounts
for each row execute function admin_internal.prevent_staff_account_reactivation_v1();

-- The public operators run only as this sealed role. Its direct table authority is bounded
-- to account creation and lifecycle columns; it cannot change identity or validity windows.
create policy staff_accounts_account_writer_select
  on admin_internal.staff_accounts for select
  to staff_account_write_authority using (true);
create policy staff_accounts_account_writer_insert
  on admin_internal.staff_accounts for insert
  to staff_account_write_authority with check (true);
create policy staff_accounts_account_writer_update
  on admin_internal.staff_accounts for update
  to staff_account_write_authority using (true) with check (true);

grant select (id, auth_user_id, status, effective_from, effective_until, status_version)
  on table admin_internal.staff_accounts to staff_account_write_authority;
grant insert (auth_user_id, status, effective_from, effective_until, status_version)
  on table admin_internal.staff_accounts to staff_account_write_authority;
grant update (status, status_version, updated_at)
  on table admin_internal.staff_accounts to staff_account_write_authority;

-- This lock copies the proven B0-A source-independent discipline while requiring the
-- console-admission permission and the exact account-management permission together.
create function admin_internal.lock_current_staff_management_actor_v1(
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
  if p_required_management_permission_key is distinct from
    'admin.management.staff.account.write'
  then
    return;
  end if;

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
      'admin_context.read', 'admin.management.staff.account.write'
    )
    order by permission.permission_key
    for update
  loop
    v_locked_catalog_keys := pg_catalog.array_append(
      v_locked_catalog_keys, v_row.permission_key
    );
  end loop;

  for v_row in
    select assignment.assignment_id
    from admin_internal.staff_bundle_assignments assignment
    where exists (
      select 1
      from admin_internal.staff_permission_entitlements entitlement
      where entitlement.staff_account_id = v_staff_account_id
        and entitlement.permission_key in (
          'admin_context.read', 'admin.management.staff.account.write'
        )
        and entitlement.source_type = 'bundle_assignment'
        and entitlement.source_bundle_assignment_id = assignment.assignment_id
    )
    order by assignment.assignment_id
    for update of assignment
  loop
    v_locked_assignment_ids := pg_catalog.array_append(
      v_locked_assignment_ids, v_row.assignment_id
    );
  end loop;

  for v_row in
    select entitlement.entitlement_id
    from admin_internal.staff_permission_entitlements entitlement
    where entitlement.staff_account_id = v_staff_account_id
      and entitlement.permission_key in (
        'admin_context.read', 'admin.management.staff.account.write'
      )
    order by entitlement.entitlement_id
    for update
  loop
    v_locked_entitlement_ids := pg_catalog.array_append(
      v_locked_entitlement_ids, v_row.entitlement_id
    );
  end loop;

  select pg_catalog.count(distinct effective.permission_key)::integer
    into v_effective_count
  from admin_internal.staff_effective_permissions_for_subject_v1(
    v_actor, v_database_now
  ) effective
  where effective.permission_key in (
    'admin_context.read', 'admin.management.staff.account.write'
  );

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
  'P3B private atomic actor lock. It derives the verified JWT subject and locks every valid source for exact admin_context.read plus admin.management.staff.account.write before returning actor identity.';

-- All four wrappers enter this private implementation with a frozen operation constant.
-- The actor/request receipt namespace remains global across all management operations.
create function admin_internal.staff_management_apply_account_operation_v1(
  p_operation_kind text,
  p_target_auth_user_id uuid,
  p_target_staff_account_id uuid,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
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
  v_request_payload jsonb;
  v_prior admin_internal.staff_management_operation_receipts%rowtype;
  v_target_staff_account_id uuid;
  v_target_auth_user_id uuid;
  v_before_status text;
  v_before_version bigint;
  v_before_effective_from timestamptz;
  v_before_effective_until timestamptz;
  v_after_status text;
  v_after_version bigint;
  v_actual_effective_from timestamptz;
  v_result jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_outcome text := 'rejected';
  v_error_code text;
begin
  select actor.actor_auth_user_id, actor.actor_staff_account_id
    into v_actor_auth_user_id, v_actor_staff_account_id
  from admin_internal.lock_current_staff_management_actor_v1(
    'admin.management.staff.account.write'
  ) actor;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'outcome', 'rejected', 'errorCode', 'permission_denied'
    );
  end if;

  if p_operation_kind not in (
      'staff_account_link', 'staff_account_suspend',
      'staff_account_reactivate', 'staff_account_revoke'
    )
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

  if p_operation_kind = 'staff_account_link' then
    if p_target_auth_user_id is null
      or p_target_staff_account_id is not null
      or p_expected_status_version is not null
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
      );
    end if;
    v_actual_effective_from := coalesce(p_effective_from, v_database_now);
    if p_effective_until is not null and (
      p_effective_until <= v_actual_effective_from
      or p_effective_until <= v_database_now
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
      );
    end if;
    v_request_payload := pg_catalog.jsonb_build_object(
      'operationKind', p_operation_kind,
      'targetAuthUserId', p_target_auth_user_id,
      'effectiveFrom', p_effective_from,
      'effectiveUntil', p_effective_until,
      'reasonCode', p_reason_code
    );
  else
    if p_target_auth_user_id is not null
      or p_target_staff_account_id is null
      or p_effective_from is not null
      or p_effective_until is not null
      or p_expected_status_version is null
      or p_expected_status_version < 0
    then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'outcome', 'rejected', 'errorCode', 'invalid_request'
      );
    end if;
    v_request_payload := pg_catalog.jsonb_build_object(
      'operationKind', p_operation_kind,
      'targetStaffAccountId', p_target_staff_account_id,
      'expectedStatusVersion', p_expected_status_version,
      'reasonCode', p_reason_code
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

  if p_operation_kind = 'staff_account_link' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'staff-account-link:' || p_target_auth_user_id::text, 0
    ));

    if p_target_auth_user_id = v_actor_auth_user_id then
      v_target_staff_account_id := v_actor_staff_account_id;
      select account.auth_user_id, account.status, account.status_version,
             account.effective_from, account.effective_until
        into v_target_auth_user_id, v_before_status, v_before_version,
             v_before_effective_from, v_before_effective_until
      from admin_internal.staff_accounts account
      where account.id = v_actor_staff_account_id;
      v_error_code := 'self_target_denied';
    else
      select account.id, account.auth_user_id, account.status, account.status_version,
             account.effective_from, account.effective_until
        into v_target_staff_account_id, v_target_auth_user_id, v_before_status,
             v_before_version, v_before_effective_from, v_before_effective_until
      from admin_internal.staff_accounts account
      where account.auth_user_id = p_target_auth_user_id
      for update;

      if found then
        v_error_code := 'target_exists';
      else
        begin
          insert into admin_internal.staff_accounts (
            auth_user_id, status, effective_from, effective_until, status_version
          ) values (
            p_target_auth_user_id, 'active', v_actual_effective_from,
            p_effective_until, 0
          ) returning id, auth_user_id, status, status_version,
                      effective_from, effective_until
            into v_target_staff_account_id, v_target_auth_user_id, v_after_status,
                 v_after_version, v_before_effective_from, v_before_effective_until;
          v_outcome := 'applied';
        exception
          when foreign_key_violation then
            v_error_code := 'target_not_found';
          when unique_violation then
            v_error_code := 'target_exists';
        end;
      end if;
    end if;
  else
    v_target_staff_account_id := p_target_staff_account_id;
    if p_target_staff_account_id = v_actor_staff_account_id then
      select account.auth_user_id, account.status, account.status_version,
             account.effective_from, account.effective_until
        into v_target_auth_user_id, v_before_status, v_before_version,
             v_before_effective_from, v_before_effective_until
      from admin_internal.staff_accounts account
      where account.id = v_actor_staff_account_id;
      v_error_code := 'self_target_denied';
    else
      select account.auth_user_id, account.status, account.status_version,
             account.effective_from, account.effective_until
        into v_target_auth_user_id, v_before_status, v_before_version,
             v_before_effective_from, v_before_effective_until
      from admin_internal.staff_accounts account
      where account.id = p_target_staff_account_id
      for update;

      if not found then
        v_target_staff_account_id := null;
        v_error_code := 'target_not_found';
      elsif v_before_version <> p_expected_status_version then
        v_error_code := 'stale_state';
      elsif p_operation_kind = 'staff_account_suspend' then
        if v_before_status <> 'active' then
          v_error_code := 'mutation_rejected';
        else
          update admin_internal.staff_accounts
          set status = 'suspended', status_version = status_version + 1,
              updated_at = v_database_now
          where id = p_target_staff_account_id
          returning status, status_version into v_after_status, v_after_version;
          v_outcome := 'applied';
        end if;
      elsif p_operation_kind = 'staff_account_reactivate' then
        if v_before_status <> 'suspended'
          or (v_before_effective_until is not null
            and v_database_now >= v_before_effective_until)
        then
          v_error_code := 'mutation_rejected';
        else
          update admin_internal.staff_accounts
          set status = 'active', status_version = status_version + 1,
              updated_at = v_database_now
          where id = p_target_staff_account_id
          returning status, status_version into v_after_status, v_after_version;
          v_outcome := 'applied';
        end if;
      elsif p_operation_kind = 'staff_account_revoke' then
        if v_before_status not in ('active', 'suspended') then
          v_error_code := 'mutation_rejected';
        else
          update admin_internal.staff_accounts
          set status = 'revoked', status_version = status_version + 1,
              updated_at = v_database_now
          where id = p_target_staff_account_id
          returning status, status_version into v_after_status, v_after_version;
          v_outcome := 'applied';
        end if;
      end if;
    end if;
  end if;

  if v_before_status is not null then
    v_before_state := pg_catalog.jsonb_build_object(
      'authUserId', v_target_auth_user_id,
      'status', v_before_status,
      'statusVersion', v_before_version,
      'effectiveFrom', v_before_effective_from,
      'effectiveUntil', v_before_effective_until
    );
  end if;

  if v_outcome = 'applied' then
    v_after_state := pg_catalog.jsonb_build_object(
      'authUserId', coalesce(v_target_auth_user_id, p_target_auth_user_id),
      'status', v_after_status,
      'statusVersion', v_after_version,
      'effectiveFrom', coalesce(v_before_effective_from, v_actual_effective_from),
      'effectiveUntil', coalesce(v_before_effective_until, p_effective_until)
    );
  else
    v_after_status := v_before_status;
    v_after_version := v_before_version;
    v_after_state := v_before_state;
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'ok', v_outcome = 'applied',
    'outcome', v_outcome,
    'errorCode', v_error_code,
    'staffAccountId', v_target_staff_account_id,
    'status', v_after_status,
    'statusVersion', v_after_version,
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
    operation_kind, reason_code, request_id, outcome, before_state, after_state,
    occurred_at
  ) values (
    v_actor_auth_user_id, v_actor_staff_account_id, v_target_staff_account_id,
    p_operation_kind, p_reason_code, p_request_id, v_outcome, v_before_state,
    v_after_state, v_database_now
  );

  return v_result;
end;
$$;

create function public.staff_management_link_staff_account_v1(
  p_target_auth_user_id uuid,
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
  select admin_internal.staff_management_apply_account_operation_v1(
    'staff_account_link', p_target_auth_user_id, null, p_effective_from,
    p_effective_until, null, p_reason_code, p_request_id
  );
$$;

create function public.staff_management_suspend_staff_account_v1(
  p_target_staff_account_id uuid,
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
  select admin_internal.staff_management_apply_account_operation_v1(
    'staff_account_suspend', null, p_target_staff_account_id, null, null,
    p_expected_status_version, p_reason_code, p_request_id
  );
$$;

create function public.staff_management_reactivate_staff_account_v1(
  p_target_staff_account_id uuid,
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
  select admin_internal.staff_management_apply_account_operation_v1(
    'staff_account_reactivate', null, p_target_staff_account_id, null, null,
    p_expected_status_version, p_reason_code, p_request_id
  );
$$;

create function public.staff_management_revoke_staff_account_v1(
  p_target_staff_account_id uuid,
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
  select admin_internal.staff_management_apply_account_operation_v1(
    'staff_account_revoke', null, p_target_staff_account_id, null, null,
    p_expected_status_version, p_reason_code, p_request_id
  );
$$;

comment on function public.staff_management_link_staff_account_v1(uuid,timestamptz,timestamptz,text,uuid) is
  'P3B authenticated account-link operator. Creates one active version-zero staff identity only; no entitlement, Bundle, legacy membership, or Auth identity.';
comment on function public.staff_management_suspend_staff_account_v1(uuid,bigint,text,uuid) is
  'P3B authenticated active-to-suspended account operator with exact status-version CAS.';
comment on function public.staff_management_reactivate_staff_account_v1(uuid,bigint,text,uuid) is
  'P3B authenticated suspended-to-active account operator; revoked and expired accounts cannot reactivate.';
comment on function public.staff_management_revoke_staff_account_v1(uuid,bigint,text,uuid) is
  'P3B authenticated terminal account-revocation operator with exact status-version CAS and no deletion.';

revoke all on function admin_internal.prevent_staff_account_reactivation_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.lock_current_staff_management_actor_v1(text)
  from public, anon, authenticated, authenticator, service_role,
       staff_account_write_authority;
revoke all on function admin_internal.staff_management_apply_account_operation_v1(
  text,uuid,uuid,timestamptz,timestamptz,bigint,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_link_staff_account_v1(
  uuid,timestamptz,timestamptz,text,uuid
) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_suspend_staff_account_v1(uuid,bigint,text,uuid)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_reactivate_staff_account_v1(uuid,bigint,text,uuid)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_revoke_staff_account_v1(uuid,bigint,text,uuid)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function admin_internal.lock_current_staff_management_actor_v1(text)
  to staff_account_write_authority;

grant execute on function public.staff_management_link_staff_account_v1(
  uuid,timestamptz,timestamptz,text,uuid
) to authenticated;
grant execute on function public.staff_management_suspend_staff_account_v1(uuid,bigint,text,uuid)
  to authenticated;
grant execute on function public.staff_management_reactivate_staff_account_v1(uuid,bigint,text,uuid)
  to authenticated;
grant execute on function public.staff_management_revoke_staff_account_v1(uuid,bigint,text,uuid)
  to authenticated;

grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant staff_account_write_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
grant create on schema admin_internal to staff_account_write_authority;
grant create on schema public to staff_account_write_authority;

alter function admin_internal.lock_current_staff_management_actor_v1(text)
  owner to staff_authority_write_authority;
alter function admin_internal.staff_management_apply_account_operation_v1(
  text,uuid,uuid,timestamptz,timestamptz,bigint,text,uuid
) owner to staff_account_write_authority;
alter function public.staff_management_link_staff_account_v1(
  uuid,timestamptz,timestamptz,text,uuid
) owner to staff_account_write_authority;
alter function public.staff_management_suspend_staff_account_v1(uuid,bigint,text,uuid)
  owner to staff_account_write_authority;
alter function public.staff_management_reactivate_staff_account_v1(uuid,bigint,text,uuid)
  owner to staff_account_write_authority;
alter function public.staff_management_revoke_staff_account_v1(uuid,bigint,text,uuid)
  owner to staff_account_write_authority;

revoke create on schema admin_internal from staff_authority_write_authority;
revoke create on schema admin_internal from staff_account_write_authority;
revoke create on schema public from staff_account_write_authority;
revoke staff_authority_write_authority from postgres granted by postgres;
revoke staff_account_write_authority from postgres granted by postgres;

commit;
