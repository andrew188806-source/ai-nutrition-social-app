-- H3 (pre-Admin hardening) -- outer EXECUTE ACL of the ten privileged staff_management_*_v2 wrappers.
--
-- Defect: the P3H migration (20260916020000) issues `revoke all ... from public, anon, authenticated,
-- authenticator, service_role` and `grant execute ... to authenticated` on these ten functions AFTER
-- transferring their ownership to staff_step_up_gate_authority. Those statements ran as `postgres`,
-- which holds only an INHERIT-FALSE membership in the sealed owner role, so PostgreSQL treated them as
-- issued by a non-owner and silently changed nothing. The live ACL is therefore the creation default,
-- `{=X/owner, owner=X/owner}`: PUBLIC (and so anon, service_role, authenticator) may EXECUTE. The
-- in-function gate (live AAL2 step-up receipt, then the frozen _v1 authority checks) was never
-- bypassable, but the outer ACL layer the P3H contract intended did not exist.
--
-- This migration realizes the intended outer ACL, as the owner: anonymous callers and PUBLIC lose
-- EXECUTE; `authenticated` (the only role admin-web calls them as, via the signed-in user session)
-- keeps it. It changes NO function body, NO input/output contract, NO step-up / AAL2 / audit / v1
-- authority semantics, and touches no other function.
begin;

-- Enabling membership: same shape the P3H migration uses for ownership work. postgres holds ADMIN
-- OPTION on every sealed role (platform-recorded creator grant), so it may grant itself a SET-only
-- edge; it is removed again at the end of this migration.
grant staff_step_up_gate_authority to postgres with admin false, inherit false, set true;

set local role staff_step_up_gate_authority;

revoke all on function
  public.staff_management_link_staff_account_v2(uuid,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_suspend_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text),
  public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_privileged_permission_v2(uuid,bigint,text,uuid,uuid,text)
from public, anon, authenticated, authenticator, service_role;

grant execute on function
  public.staff_management_link_staff_account_v2(uuid,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_suspend_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text),
  public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_privileged_permission_v2(uuid,bigint,text,uuid,uuid,text)
to authenticated;

reset role;

revoke staff_step_up_gate_authority from postgres granted by postgres;

-- Fail-closed epilogue: the migration cannot commit unless the intended outer ACL is EFFECTIVE (a
-- privilege change postgres is not entitled to make is dropped without error, so absence of an error
-- proves nothing). Verified against the catalog after the change.
do $$
declare
  v_expected text[] := array[
    'staff_management_link_staff_account_v2','staff_management_suspend_staff_account_v2',
    'staff_management_reactivate_staff_account_v2','staff_management_revoke_staff_account_v2',
    'staff_management_grant_permission_delegation_v2','staff_management_revoke_permission_delegation_v2',
    'staff_management_grant_console_admission_v2','staff_management_revoke_console_admission_v2',
    'staff_management_grant_privileged_permission_v2','staff_management_revoke_privileged_permission_v2'];
  v_fn record;
  v_seen integer := 0;
begin
  for v_fn in
    select p.oid, p.proname, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner_name
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'staff\_management\_%\_v2' escape '\'
  loop
    v_seen := v_seen + 1;
    if not (v_fn.proname = any (v_expected)) then
      raise exception 'H3: unexpected staff_management_*_v2 function %', v_fn.proname;
    end if;
    if not v_fn.prosecdef or v_fn.owner_name <> 'staff_step_up_gate_authority' then
      raise exception 'H3: % must remain SECURITY DEFINER owned by staff_step_up_gate_authority', v_fn.proname;
    end if;
    if not (v_fn.proconfig @> array['search_path=""', 'row_security=on']) then
      raise exception 'H3: % lost its search_path/row_security settings', v_fn.proname;
    end if;
    if exists (select 1 from pg_catalog.aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_fn.oid), '{}'::aclitem[])) a where a.grantee = 0) then
      raise exception 'H3: % is still executable by PUBLIC', v_fn.proname;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticator', v_fn.oid, 'EXECUTE') then
      raise exception 'H3: % is still executable by anon/service_role/authenticator', v_fn.proname;
    end if;
    if not pg_catalog.has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception 'H3: % must remain executable by authenticated (admin-web calls it as the signed-in user)', v_fn.proname;
    end if;
  end loop;
  if v_seen <> 10 then
    raise exception 'H3: expected exactly 10 staff_management_*_v2 functions, found %', v_seen;
  end if;
  -- The protected mutating _v1 layer beneath them stays closed to every client role (unchanged).
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('staff_management_link_staff_account_v1','staff_management_suspend_staff_account_v1',
        'staff_management_reactivate_staff_account_v1','staff_management_revoke_staff_account_v1',
        'staff_management_grant_permission_delegation_v1','staff_management_revoke_permission_delegation_v1',
        'staff_management_grant_console_admission_v1','staff_management_revoke_console_admission_v1',
        'staff_management_grant_privileged_permission_v1','staff_management_revoke_privileged_permission_v1')
      and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then
    raise exception 'H3: a protected mutating _v1 function is executable by a client role';
  end if;
  -- The temporary SET edge to the sealed owner must be gone: postgres must not keep the ability to assume it.
  if pg_catalog.pg_has_role('postgres', 'staff_step_up_gate_authority', 'SET') then
    raise exception 'H3: postgres retained a SET edge to staff_step_up_gate_authority';
  end if;
end;
$$;

commit;
