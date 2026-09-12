-- RA-3-IA-P3-P6-P2A: current-caller exact staff permission resolution.
--
-- Bundle templates remain provisioning inputs only. Runtime authority is derived exclusively from
-- effective exact entitlements, with Bundle assignment checks applied only as defense in depth.

begin;

create function admin_internal.staff_request_subject_v1()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_subject text;
  v_claims text;
begin
  v_subject := nullif(
    pg_catalog.current_setting('request.jwt.claim.sub', true), ''
  );

  if v_subject is null then
    v_claims := nullif(
      pg_catalog.current_setting('request.jwt.claims', true), ''
    );
    if v_claims is not null then
      begin
        v_subject := v_claims::pg_catalog.jsonb ->> 'sub';
      exception when others then
        v_subject := null;
      end;
    end if;
  end if;

  if v_subject is null
    or v_subject !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return null;
  end if;

  return v_subject::uuid;
end;
$$;

create function admin_internal.staff_effective_permissions_for_subject_v1(
  p_auth_user_id uuid,
  p_database_now timestamptz
)
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select distinct entitlement.permission_key
  from admin_internal.staff_accounts account
  join admin_internal.staff_permission_entitlements entitlement
    on entitlement.staff_account_id = account.id
  join admin_internal.staff_permission_catalog permission
    on permission.permission_key = entitlement.permission_key
  left join admin_internal.staff_bundle_assignments assignment
    on assignment.assignment_id = entitlement.source_bundle_assignment_id
  where p_auth_user_id is not null
    and p_database_now is not null
    and account.auth_user_id = p_auth_user_id
    and account.status = 'active'
    and account.effective_from <= p_database_now
    and (account.effective_until is null or p_database_now < account.effective_until)
    and permission.lifecycle_status = 'active'
    and permission.readiness_status = 'current'
    and entitlement.status = 'active'
    and entitlement.effective_from <= p_database_now
    and (entitlement.effective_until is null or p_database_now < entitlement.effective_until)
    and (
      (
        entitlement.source_type in ('direct_grant', 'migration_backfill')
        and entitlement.source_bundle_assignment_id is null
      )
      or
      (
        entitlement.source_type = 'bundle_assignment'
        and assignment.assignment_id = entitlement.source_bundle_assignment_id
        and assignment.staff_account_id = entitlement.staff_account_id
        and assignment.status = 'active'
        and assignment.effective_from <= p_database_now
        and (assignment.effective_until is null or p_database_now < assignment.effective_until)
      )
    )
  order by entitlement.permission_key;
$$;

create function public.staff_current_context_v1()
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select effective.permission_key
  from admin_internal.staff_effective_permissions_for_subject_v1(
    admin_internal.staff_request_subject_v1(),
    pg_catalog.statement_timestamp()
  ) effective
  order by effective.permission_key;
$$;

create function public.staff_has_permission_v1(p_requested_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select case
    when p_requested_permission_key is null or p_requested_permission_key = '' then false
    else exists (
      select 1
      from admin_internal.staff_effective_permissions_for_subject_v1(
        admin_internal.staff_request_subject_v1(),
        pg_catalog.statement_timestamp()
      ) effective
      where effective.permission_key = p_requested_permission_key
    )
  end;
$$;

comment on function public.staff_current_context_v1() is
  'Returns the current verified staff caller effective exact permission keys only. Empty context is represented by zero rows.';
comment on function public.staff_has_permission_v1(text) is
  'Returns whether the current verified staff caller holds one exact effective permission key. Null, empty, and unknown keys are false.';

-- Functions receive PUBLIC EXECUTE by default. Settle every ACL before transferring ownership.
revoke all on function admin_internal.staff_request_subject_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.staff_effective_permissions_for_subject_v1(uuid, timestamptz)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_current_context_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_has_permission_v1(text)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.staff_current_context_v1() to authenticated;
grant execute on function public.staff_has_permission_v1(text) to authenticated;

grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_context_reader;
grant create on schema public to staff_authority_context_reader;
alter function admin_internal.staff_request_subject_v1()
  owner to staff_authority_context_reader;
alter function admin_internal.staff_effective_permissions_for_subject_v1(uuid, timestamptz)
  owner to staff_authority_context_reader;
alter function public.staff_current_context_v1()
  owner to staff_authority_context_reader;
alter function public.staff_has_permission_v1(text)
  owner to staff_authority_context_reader;
revoke create on schema public from staff_authority_context_reader;
revoke create on schema admin_internal from staff_authority_context_reader;
revoke staff_authority_context_reader from postgres granted by postgres;

commit;
