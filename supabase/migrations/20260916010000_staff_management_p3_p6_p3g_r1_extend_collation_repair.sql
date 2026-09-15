-- RA-3-IA-P3-P6-P3G-R1: make the break-glass extension source-set proof collation-independent.
--
-- The frozen P3G extend operator compared array_agg(permission_key ORDER BY permission_key)
-- against a hardcoded literal array. ORDER BY follows database collation, so under
-- en_US.UTF-8 (Development's actual collation) the four exact permission strings sort
-- differently than under the disposable local harness's C locale, and the literal-array
-- comparison never matches even when the underlying source set is perfectly valid. This is
-- an availability defect (fail-closed), not an authority leak: the extend transaction rolled
-- back atomically on every occurrence, with zero partial mutation.
--
-- This migration replaces ONLY the internal source-set proof inside
-- admin_internal.staff_break_glass_extend_activation_v1 with an order-independent relational
-- proof: exact row count, exact distinct-key count, zero unexpected keys, zero missing keys.
-- Every other invariant, the CAS/window/caller/time-policy semantics, and every other P3G
-- object are byte-for-byte unchanged.
--
-- HIGH_PRIVILEGE_STEP_UP_STILL_DEFERRED_TO_P3H
-- DO_NOT_OPERATIONALLY_BOOTSTRAP_REAL_PRIMARY_BEFORE_P3H_ACCEPTANCE
-- BREAK_GLASS_PRINCIPAL_NOT_SEEDED

begin;

grant staff_break_glass_control_authority to postgres
  with admin false, inherit false, set true;
grant create on schema admin_internal to staff_break_glass_control_authority;
set role staff_break_glass_control_authority;

create or replace function admin_internal.staff_break_glass_extend_activation_v1(
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
  v_distinct_count integer;
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

  -- Order-independent exact-set proof: exact row count, exact distinct-key count, zero
  -- unexpected keys, zero missing keys. Every predicate here is plain equality/IN/NOT IN
  -- membership, never ORDER BY or a range comparison, so the result cannot depend on
  -- database collation. This deliberately replaces the frozen migration's order-sensitive
  -- array_agg(... order by permission_key) <> ARRAY[...] comparison.
  select pg_catalog.count(*)::integer,
    pg_catalog.count(distinct grant_row.permission_key)::integer
  into v_count, v_distinct_count
  from admin_internal.staff_break_glass_activation_grants grant_row
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.entitlement_id = grant_row.entitlement_id
  where grant_row.activation_id = p_activation_id
    and grant_row.status = 'active'
    and entitlement.status = 'active'
    and entitlement.staff_account_id = v_principal.staff_account_id
    and entitlement.source_type = 'direct_grant'
    and entitlement.source_bundle_assignment_id is null
    and entitlement.effective_from = v_activation.effective_from
    and entitlement.effective_until = v_activation.effective_until;
  if v_count <> 4 or v_distinct_count <> 4 then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;
  if exists (
    select 1
    from admin_internal.staff_break_glass_activation_grants grant_row
    join admin_internal.staff_permission_entitlements entitlement
      on entitlement.entitlement_id = grant_row.entitlement_id
    where grant_row.activation_id = p_activation_id
      and grant_row.status = 'active'
      and entitlement.status = 'active'
      and entitlement.staff_account_id = v_principal.staff_account_id
      and entitlement.source_type = 'direct_grant'
      and entitlement.source_bundle_assignment_id is null
      and entitlement.effective_from = v_activation.effective_from
      and entitlement.effective_until = v_activation.effective_until
      and grant_row.permission_key not in (
        'admin_context.read',
        'admin.management.staff.account.write',
        'admin.management.staff.console_admission.write',
        'admin.management.staff.permission.write'
      )
  ) then
    raise exception using errcode = '23514', message = 'break_glass_activation_source_set_mismatch';
  end if;
  if exists (
    select expected.permission_key
    from unnest(array[
      'admin_context.read',
      'admin.management.staff.account.write',
      'admin.management.staff.console_admission.write',
      'admin.management.staff.permission.write'
    ]::text[]) expected(permission_key)
    where not exists (
      select 1
      from admin_internal.staff_break_glass_activation_grants grant_row
      join admin_internal.staff_permission_entitlements entitlement
        on entitlement.entitlement_id = grant_row.entitlement_id
      where grant_row.activation_id = p_activation_id
        and grant_row.status = 'active'
        and entitlement.status = 'active'
        and entitlement.staff_account_id = v_principal.staff_account_id
        and entitlement.source_type = 'direct_grant'
        and entitlement.source_bundle_assignment_id is null
        and entitlement.effective_from = v_activation.effective_from
        and entitlement.effective_until = v_activation.effective_until
        and grant_row.permission_key = expected.permission_key
    )
  ) then
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

comment on function admin_internal.staff_break_glass_extend_activation_v1(uuid,bigint,text,uuid) is
  'P3G-R1: postgres-only +30-minute activation extension with a collation-independent exact
   four-key source-set proof (row count, distinct count, zero unexpected, zero missing keys),
   bounded to the frozen 2-hour continuous cap and finite staff effective_until.';

reset role;
revoke create on schema admin_internal from staff_break_glass_control_authority;
revoke staff_break_glass_control_authority from postgres granted by postgres;

commit;
