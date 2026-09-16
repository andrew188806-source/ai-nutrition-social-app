-- RA-3-IA-P3-P6-P3I: Platform Management read authority.
--
-- Promotes the three already-planned management read permission keys to CURRENT and
-- exposes narrow, permission-gated read RPCs over the staff authority tables so the
-- Admin workspace can operate without raw SQL. Grants no new write authority and adds
-- no new sealed writer role. admin.management.staff.bundle.write remains PLANNED and
-- is not touched by this migration.

begin;

-- Promote only the exact three read keys. The catalogue FORCEs RLS, so use the frozen
-- catalogue writer for this bounded transition and release SET membership immediately.
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
set role staff_authority_write_authority;
do $$
declare
  v_updated integer;
begin
  update admin_internal.staff_permission_catalog
  set readiness_status = 'current', updated_at = pg_catalog.statement_timestamp()
  where permission_key = any(array[
      'admin.management.read',
      'admin.management.permissions.read',
      'admin.management.staff.read'
    ])
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
  if v_updated <> 3 then
    raise exception using errcode = '23514', message = 'management_read_promotion_mismatch';
  end if;
end;
$$;
reset role;
revoke staff_authority_write_authority from postgres granted by postgres;

-- Sealed read-only authority. No LOGIN, no INHERIT, no BYPASSRLS: reachable only through
-- its own SECURITY DEFINER RPCs, each of which re-checks the caller's effective permission
-- via the frozen public.staff_has_permission_v1 before returning any row.
create role staff_management_read_authority
  nologin
  noinherit
  nobypassrls;

comment on role staff_management_read_authority is
  'P3I sealed staff-management read authority. Read-only across staff_accounts, entitlements, delegations, console admission grants, privileged permission grants, and the permission catalogue. Holds no write privilege on any table and cannot call any P3B/P3C/P3E/P3F/P3H protected function.';

grant usage on schema admin_internal to staff_management_read_authority;
grant usage, create on schema public to staff_management_read_authority;

grant select on table admin_internal.staff_accounts to staff_management_read_authority;
grant select on table admin_internal.staff_permission_entitlements to staff_management_read_authority;
grant select on table admin_internal.staff_permission_delegations to staff_management_read_authority;
grant select on table admin_internal.staff_console_admission_grants to staff_management_read_authority;
grant select on table admin_internal.staff_privileged_permission_grants to staff_management_read_authority;
grant select on table admin_internal.staff_permission_catalog to staff_management_read_authority;

create policy staff_management_read_authority_accounts_select
  on admin_internal.staff_accounts
  for select to staff_management_read_authority using (true);
create policy staff_management_read_authority_entitlements_select
  on admin_internal.staff_permission_entitlements
  for select to staff_management_read_authority using (true);
create policy staff_management_read_authority_delegations_select
  on admin_internal.staff_permission_delegations
  for select to staff_management_read_authority using (true);
create policy staff_management_read_authority_console_admissions_select
  on admin_internal.staff_console_admission_grants
  for select to staff_management_read_authority using (true);
create policy staff_management_read_authority_privileged_grants_select
  on admin_internal.staff_privileged_permission_grants
  for select to staff_management_read_authority using (true);
create policy staff_management_read_authority_catalog_select
  on admin_internal.staff_permission_catalog
  for select to staff_management_read_authority using (true);

-- The RPCs additionally call the frozen public.staff_has_permission_v1, which they do not
-- own; grant EXECUTE on it to the new role before creating anything that calls it.
grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
set role staff_authority_context_reader;
grant execute on function public.staff_has_permission_v1(text) to staff_management_read_authority;
reset role;

create function public.staff_management_list_staff_v1()
returns table (
  staff_account_id uuid,
  auth_user_id uuid,
  status text,
  effective_from timestamptz,
  effective_until timestamptz,
  status_version bigint,
  console_admission_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    account.id,
    account.auth_user_id,
    account.status,
    account.effective_from,
    account.effective_until,
    account.status_version,
    exists (
      select 1
      from admin_internal.staff_console_admission_grants grant_row
      where grant_row.target_staff_account_id = account.id
        and grant_row.status = 'active'
    ) as console_admission_active,
    account.created_at,
    account.updated_at
  from admin_internal.staff_accounts account
  where public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin.management.staff.read')
  order by account.created_at desc, account.id;
$$;

comment on function public.staff_management_list_staff_v1() is
  'P3I read-only staff roster for Platform Management. Requires exact effective admin_context.read and admin.management.staff.read; returns zero rows for any other caller. No job title, name, or private product-domain data is exposed.';

create function public.staff_management_staff_detail_v1(p_staff_account_id uuid)
returns table (
  staff_account_id uuid,
  auth_user_id uuid,
  status text,
  effective_from timestamptz,
  effective_until timestamptz,
  status_version bigint,
  console_admission_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    account.id,
    account.auth_user_id,
    account.status,
    account.effective_from,
    account.effective_until,
    account.status_version,
    exists (
      select 1
      from admin_internal.staff_console_admission_grants grant_row
      where grant_row.target_staff_account_id = account.id
        and grant_row.status = 'active'
    ) as console_admission_active,
    account.created_at,
    account.updated_at
  from admin_internal.staff_accounts account
  where account.id = p_staff_account_id
    and public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin.management.staff.read');
$$;

comment on function public.staff_management_staff_detail_v1(uuid) is
  'P3I read-only single staff account lifecycle detail for Platform Management. Requires exact effective admin_context.read and admin.management.staff.read; returns zero rows for any other caller or unknown target.';

create function public.staff_management_staff_authority_v1(p_staff_account_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select case
    when not (public.staff_has_permission_v1('admin_context.read')
      and public.staff_has_permission_v1('admin.management.permissions.read'))
    then null
    else pg_catalog.jsonb_build_object(
      'entitlements', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'entitlementId', entitlement.entitlement_id,
          'permissionKey', entitlement.permission_key,
          'sourceType', entitlement.source_type,
          'status', entitlement.status,
          'effectiveFrom', entitlement.effective_from,
          'effectiveUntil', entitlement.effective_until
        ) order by entitlement.created_at desc)
        from admin_internal.staff_permission_entitlements entitlement
        where entitlement.staff_account_id = p_staff_account_id
      ), '[]'::jsonb),
      'delegationsHeld', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'delegationId', delegation.delegation_id,
          'permissionKey', delegation.permission_key,
          'canGrant', delegation.can_grant,
          'canRevoke', delegation.can_revoke,
          'canSetTemporary', delegation.can_set_temporary,
          'status', delegation.status,
          'effectiveFrom', delegation.effective_from,
          'effectiveUntil', delegation.effective_until
        ) order by delegation.granted_at desc)
        from admin_internal.staff_permission_delegations delegation
        where delegation.delegate_staff_account_id = p_staff_account_id
      ), '[]'::jsonb),
      'privilegedGrants', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'privilegedPermissionGrantId', grant_row.privileged_permission_grant_id,
          'permissionKey', grant_row.permission_key,
          'status', grant_row.status,
          'statusVersion', grant_row.status_version,
          'createdAt', grant_row.created_at
        ) order by grant_row.created_at desc)
        from admin_internal.staff_privileged_permission_grants grant_row
        where grant_row.target_staff_account_id = p_staff_account_id
      ), '[]'::jsonb),
      'consoleAdmissions', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'consoleAdmissionGrantId', admission.console_admission_grant_id,
          'status', admission.status,
          'statusVersion', admission.status_version,
          'createdAt', admission.created_at
        ) order by admission.created_at desc)
        from admin_internal.staff_console_admission_grants admission
        where admission.target_staff_account_id = p_staff_account_id
      ), '[]'::jsonb)
    )
  end;
$$;

comment on function public.staff_management_staff_authority_v1(uuid) is
  'P3I read-only aggregate of one staff account''s entitlements, held delegations, privileged permission grants, and console admission grants. Requires exact effective admin_context.read and admin.management.permissions.read; returns null for any other caller.';

create function public.staff_management_permission_catalog_v1()
returns table (
  permission_key text,
  lifecycle_status text,
  readiness_status text,
  sensitivity_class text,
  individually_provisionable boolean,
  temporary_grantable boolean,
  ordinary_supervisor_delegable boolean,
  privileged_only boolean,
  console_admission_required boolean
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    catalog_row.permission_key,
    catalog_row.lifecycle_status,
    catalog_row.readiness_status,
    catalog_row.sensitivity_class,
    catalog_row.individually_provisionable,
    catalog_row.temporary_grantable,
    catalog_row.ordinary_supervisor_delegable,
    catalog_row.privileged_only,
    catalog_row.console_admission_required
  from admin_internal.staff_permission_catalog catalog_row
  where public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin.management.permissions.read')
    and catalog_row.deferred = false
  order by catalog_row.permission_key;
$$;

comment on function public.staff_management_permission_catalog_v1() is
  'P3I read-only non-deferred permission catalogue metadata. Requires exact effective admin_context.read and admin.management.permissions.read; returns zero rows for any other caller.';

-- Settle every function ACL before ownership transfers. PUBLIC EXECUTE is never retained.
revoke all on function public.staff_management_list_staff_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_staff_detail_v1(uuid)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_staff_authority_v1(uuid)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_permission_catalog_v1()
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.staff_management_list_staff_v1() to authenticated;
grant execute on function public.staff_management_staff_detail_v1(uuid) to authenticated;
grant execute on function public.staff_management_staff_authority_v1(uuid) to authenticated;
grant execute on function public.staff_management_permission_catalog_v1() to authenticated;

grant staff_management_read_authority to postgres with admin false, inherit false, set true;
alter function public.staff_management_list_staff_v1()
  owner to staff_management_read_authority;
alter function public.staff_management_staff_detail_v1(uuid)
  owner to staff_management_read_authority;
alter function public.staff_management_staff_authority_v1(uuid)
  owner to staff_management_read_authority;
alter function public.staff_management_permission_catalog_v1()
  owner to staff_management_read_authority;

revoke create on schema public from staff_management_read_authority;
revoke staff_management_read_authority from postgres granted by postgres;

commit;
