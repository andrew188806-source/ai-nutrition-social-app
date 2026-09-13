-- RA-3-IA-P3-P6-P2D-B0-A: parallel staff-native protected READ authority.
-- Legacy Audit/Branch RPCs and the legacy Branch mutation remain byte-frozen.

begin;

create role staff_admin_audit_reader
  nologin
  noinherit
  nobypassrls;

create role staff_admin_branch_status_reader
  nologin
  noinherit
  nobypassrls;

comment on role staff_admin_audit_reader is
  'P2D-B0-A sealed staff Audit reader. Exact Audit columns and no write privilege; callable only through its authenticated public RPC.';
comment on role staff_admin_branch_status_reader is
  'P2D-B0-A sealed staff Branch preview reader. Exact Branch projection and no UPDATE or receipt privilege.';

grant usage on schema admin_internal to staff_admin_audit_reader;
grant usage on schema admin_internal to staff_admin_branch_status_reader;
grant create on schema admin_internal to staff_authority_write_authority;
grant usage, create on schema public to staff_admin_audit_reader;
grant usage, create on schema public to staff_admin_branch_status_reader;

grant select (id, actor_auth_user_id, action, target_type, target_id, result, reason, created_at)
  on table admin_internal.platform_admin_audit_log to staff_admin_audit_reader;
grant select (id, restaurant_id, name, status, status_version)
  on table public.restaurant_branches to staff_admin_branch_status_reader;

create policy staff_admin_audit_reader_select
  on admin_internal.platform_admin_audit_log
  for select to staff_admin_audit_reader using (true);

create policy staff_admin_branch_status_reader_select
  on public.restaurant_branches
  for select to staff_admin_branch_status_reader using (true);

-- The new Audit owner invokes only the frozen exact staff predicate. The private locked helper
-- invokes only the frozen claim parser and effective-permission resolver. Settle these grants as
-- their sealed owner, then release the transient SET path below.
grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
set role staff_authority_context_reader;
grant execute on function public.staff_has_permission_v1(text)
  to staff_admin_audit_reader;
grant execute on function admin_internal.staff_request_subject_v1()
  to staff_authority_write_authority;
grant execute on function admin_internal.staff_effective_permissions_for_subject_v1(uuid, timestamptz)
  to staff_authority_write_authority;
reset role;

-- Lock order is compatible with the frozen writers:
--   account -> catalog keys -> Bundle assignments -> entitlements.
-- P1C materialization takes account first; P1C revocation takes assignment then entitlements;
-- P2B touches compatibility entitlements without holding a later row in this sequence.
create function admin_internal.lock_current_staff_branch_status_actor_v1()
returns uuid
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
  v_actor := admin_internal.staff_request_subject_v1();
  if v_actor is null then
    return null;
  end if;

  select account.id
    into v_staff_account_id
  from admin_internal.staff_accounts account
  where account.auth_user_id = v_actor
  for update;
  if not found then
    return null;
  end if;

  for v_row in
    select permission.permission_key
    from admin_internal.staff_permission_catalog permission
    where permission.permission_key in (
      'admin_context.read',
      'admin_restaurant_branch.status.write'
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
          'admin_context.read',
          'admin_restaurant_branch.status.write'
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
        'admin_context.read',
        'admin_restaurant_branch.status.write'
      )
    order by entitlement.entitlement_id
    for update
  loop
    v_locked_entitlement_ids := pg_catalog.array_append(
      v_locked_entitlement_ids, v_row.entitlement_id
    );
  end loop;

  -- The frozen resolver remains the authority decision. Rows discovered after locking cannot
  -- authorize this request unless the same effective permission is also backed by locked rows.
  select pg_catalog.count(distinct effective.permission_key)::integer
    into v_effective_count
  from admin_internal.staff_effective_permissions_for_subject_v1(
    v_actor, v_database_now
  ) effective
  where effective.permission_key in (
    'admin_context.read',
    'admin_restaurant_branch.status.write'
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
      (
        entitlement.source_type in ('direct_grant', 'migration_backfill')
        and entitlement.source_bundle_assignment_id is null
      )
      or
      (
        entitlement.source_type = 'bundle_assignment'
        and assignment.assignment_id = any(v_locked_assignment_ids)
        and assignment.staff_account_id = entitlement.staff_account_id
        and assignment.status = 'active'
        and assignment.effective_from <= v_database_now
        and (assignment.effective_until is null or v_database_now < assignment.effective_until)
      )
    );

  if v_effective_count <> 2 or v_locked_effective_count <> 2 then
    return null;
  end if;
  return v_actor;
end;
$$;

comment on function admin_internal.lock_current_staff_branch_status_actor_v1() is
  'P2D-B0-A private no-argument staff Branch authority lock. Requires exact effective admin_context.read plus admin_restaurant_branch.status.write and returns only the verified request subject.';

create function public.staff_admin_audit_log_v1(
  requested_limit integer default 100
)
returns table (
  id uuid,
  actor_auth_user_id uuid,
  action text,
  target_type text,
  target_id text,
  result text,
  reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    entry.id,
    entry.actor_auth_user_id,
    entry.action,
    entry.target_type,
    entry.target_id,
    entry.result,
    entry.reason,
    entry.created_at
  from admin_internal.platform_admin_audit_log entry
  where public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin_audit.read')
  order by entry.created_at desc, entry.id desc
  limit least(greatest(coalesce(requested_limit, 100), 1), 500);
$$;

comment on function public.staff_admin_audit_log_v1(integer) is
  'P2D-B0-A staff-authorized read of the unchanged Platform Admin membership audit dataset. Requires exact effective Admin context and Audit permissions.';

create function public.staff_admin_restaurant_branch_status_v1(
  p_restaurant_id text,
  p_branch_id text
)
returns table (
  restaurant_id text,
  branch_id text,
  branch_name text,
  status text,
  status_version text
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
begin
  if admin_internal.lock_current_staff_branch_status_actor_v1() is null then
    return;
  end if;
  if p_restaurant_id is null or p_branch_id is null
    or pg_catalog.length(p_restaurant_id) not between 1 and 200
    or pg_catalog.length(p_branch_id) not between 1 and 200
    or p_restaurant_id <> pg_catalog.btrim(p_restaurant_id)
    or p_branch_id <> pg_catalog.btrim(p_branch_id)
  then
    return;
  end if;
  return query
    select branch.restaurant_id, branch.id, branch.name, branch.status,
      branch.status_version::text
    from public.restaurant_branches branch
    where branch.id = p_branch_id
      and branch.restaurant_id = p_restaurant_id;
end;
$$;

comment on function public.staff_admin_restaurant_branch_status_v1(text, text) is
  'P2D-B0-A staff-authorized bounded Branch status preview. Requires exact effective Admin context and Branch status permissions; performs no mutation.';

-- Settle every function ACL before ownership transfers. PUBLIC EXECUTE is never retained.
revoke all on function admin_internal.lock_current_staff_branch_status_actor_v1()
  from public, anon, authenticated, authenticator, service_role,
       staff_admin_audit_reader, staff_admin_branch_status_reader,
       staff_authority_context_reader;
revoke all on function public.staff_admin_audit_log_v1(integer)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_admin_restaurant_branch_status_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function admin_internal.lock_current_staff_branch_status_actor_v1()
  to staff_admin_branch_status_reader;
grant execute on function public.staff_admin_audit_log_v1(integer)
  to authenticated;
grant execute on function public.staff_admin_restaurant_branch_status_v1(text, text)
  to authenticated;

grant staff_admin_audit_reader to postgres with admin false, inherit false, set true;
grant staff_admin_branch_status_reader to postgres with admin false, inherit false, set true;
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;

alter function admin_internal.lock_current_staff_branch_status_actor_v1()
  owner to staff_authority_write_authority;
alter function public.staff_admin_audit_log_v1(integer)
  owner to staff_admin_audit_reader;
alter function public.staff_admin_restaurant_branch_status_v1(text, text)
  owner to staff_admin_branch_status_reader;

revoke create on schema public from staff_admin_audit_reader;
revoke create on schema public from staff_admin_branch_status_reader;
revoke create on schema admin_internal from staff_authority_write_authority;

revoke staff_authority_context_reader from postgres granted by postgres;
revoke staff_authority_write_authority from postgres granted by postgres;
revoke staff_admin_audit_reader from postgres granted by postgres;
revoke staff_admin_branch_status_reader from postgres granted by postgres;

commit;
