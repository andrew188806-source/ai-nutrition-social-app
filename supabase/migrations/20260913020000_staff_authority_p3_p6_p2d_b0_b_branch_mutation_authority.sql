-- RA-3-IA-P3-P6-P2D-B0-B: staff-native Branch status mutation authority.
-- The legacy mutation, shared receipt table, version trigger, and B0-A actor lock remain frozen.

begin;

create role staff_admin_branch_status_authority
  nologin
  noinherit
  nobypassrls;

comment on role staff_admin_branch_status_authority is
  'P2D-B0-B sealed staff writer for one Branch status operation. No login, membership, generic write, or independent idempotency namespace.';

grant usage on schema admin_internal to staff_admin_branch_status_authority;
grant usage, create on schema public to staff_admin_branch_status_authority;
grant select (id, restaurant_id, name, status, status_version), update (status)
  on table public.restaurant_branches to staff_admin_branch_status_authority;
grant select, insert on table admin_internal.platform_admin_operation_receipts
  to staff_admin_branch_status_authority;

create policy staff_admin_branch_status_authority_select
  on public.restaurant_branches
  for select to staff_admin_branch_status_authority using (true);
create policy staff_admin_branch_status_authority_update
  on public.restaurant_branches
  for update to staff_admin_branch_status_authority using (true) with check (true);
create policy staff_admin_branch_receipts_select
  on admin_internal.platform_admin_operation_receipts
  for select to staff_admin_branch_status_authority using (true);
create policy staff_admin_branch_receipts_insert
  on admin_internal.platform_admin_operation_receipts
  for insert to staff_admin_branch_status_authority with check (true);

create function public.staff_admin_set_restaurant_branch_status_v1(
  p_restaurant_id text, p_branch_id text, p_expected_status text, p_requested_status text,
  p_expected_version bigint, p_reason_code text, p_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' set row_security = 'on' as $$
declare v_actor uuid; v_branch_restaurant_id text; v_before_status text; v_before_version bigint;
        v_prior admin_internal.platform_admin_operation_receipts%rowtype;
        v_result text; v_error text; v_after_version bigint; v_created_at timestamptz;
begin
  v_actor := admin_internal.lock_current_staff_branch_status_actor_v1();
  if v_actor is null then return pg_catalog.jsonb_build_object('ok',false,'errorCode','permission_denied'); end if;
  if p_restaurant_id is null or p_branch_id is null or pg_catalog.length(p_restaurant_id) not between 1 and 200
    or pg_catalog.length(p_branch_id) not between 1 and 200 or p_restaurant_id <> pg_catalog.btrim(p_restaurant_id)
    or p_branch_id <> pg_catalog.btrim(p_branch_id) or p_expected_status not in ('active','inactive')
    or p_requested_status not in ('active','inactive') or p_expected_version is null or p_expected_version < 0
    or p_request_id is null or (get_byte(uuid_send(p_request_id), 6) >> 4) <> 4
    or not ((p_requested_status='inactive' and p_reason_code='operational_pause')
         or (p_requested_status='active' and p_reason_code='operational_resume'))
  then return pg_catalog.jsonb_build_object('ok',false,'errorCode','invalid_request'); end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_request_id::text, 0));
  select * into v_prior from admin_internal.platform_admin_operation_receipts
    where actor_auth_user_id=v_actor and request_id=p_request_id;
  if found then
    if (v_prior.restaurant_id,v_prior.branch_id,v_prior.expected_status,v_prior.requested_status,
        v_prior.expected_version,v_prior.reason_code) is distinct from
       (p_restaurant_id,p_branch_id,p_expected_status,p_requested_status,p_expected_version,p_reason_code)
    then return pg_catalog.jsonb_build_object('ok',false,'errorCode','idempotency_conflict'); end if;
    return pg_catalog.jsonb_build_object('ok',v_prior.result in ('applied','noop'),'outcome',v_prior.result,
      'errorCode',v_prior.error_code,'status',v_prior.after_status,'version',v_prior.after_version::text,
      'occurredAt',v_prior.created_at);
  end if;

  select branch.restaurant_id,branch.status,branch.status_version
    into v_branch_restaurant_id,v_before_status,v_before_version
    from public.restaurant_branches branch where branch.id=p_branch_id for update;
  if not found or v_branch_restaurant_id <> p_restaurant_id then v_result:='rejected'; v_error:='target_not_found';
  elsif v_before_status not in ('active','inactive') then v_result:='rejected'; v_error:='mutation_rejected';
  elsif v_before_status <> p_expected_status or v_before_version <> p_expected_version then v_result:='rejected'; v_error:='stale_state';
  elsif v_before_status = p_requested_status then v_result:='noop'; v_after_version:=v_before_version;
  else
    update public.restaurant_branches set status=p_requested_status where id=p_branch_id
      returning status_version into v_after_version;
    v_result:='applied';
  end if;
  if v_after_version is null then v_after_version:=v_before_version; end if;
  insert into admin_internal.platform_admin_operation_receipts
    (actor_auth_user_id,request_id,action,target_type,restaurant_id,branch_id,expected_status,requested_status,
     expected_version,reason_code,result,error_code,before_status,after_status,before_version,after_version)
  values (v_actor,p_request_id,'set_restaurant_branch_status','restaurant_branch',p_restaurant_id,p_branch_id,
    p_expected_status,p_requested_status,p_expected_version,p_reason_code,v_result,v_error,v_before_status,
    case when v_result='applied' then p_requested_status else v_before_status end,v_before_version,v_after_version)
  returning created_at into v_created_at;
  return pg_catalog.jsonb_build_object('ok',v_result in ('applied','noop'),'outcome',v_result,'errorCode',v_error,
    'status',case when v_result='applied' then p_requested_status else v_before_status end,
    'version',v_after_version::text,'occurredAt',v_created_at);
end;
$$;

comment on function public.staff_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) is
  'P2D-B0-B staff-authorized Branch status mutation using the frozen staff actor lock and shared cross-mode receipt namespace.';

revoke all on function public.staff_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)
  from public, anon, authenticated, authenticator, service_role;
grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
set role staff_authority_write_authority;
revoke all on function admin_internal.lock_current_staff_branch_status_actor_v1()
  from staff_admin_branch_status_authority;
grant execute on function admin_internal.lock_current_staff_branch_status_actor_v1()
  to staff_admin_branch_status_authority;
reset role;
grant execute on function public.staff_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)
  to authenticated;

grant staff_admin_branch_status_authority to postgres with admin false, inherit false, set true;
alter function public.staff_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)
  owner to staff_admin_branch_status_authority;

revoke create on schema public from staff_admin_branch_status_authority;
revoke staff_authority_write_authority from postgres granted by postgres;
revoke staff_admin_branch_status_authority from postgres granted by postgres;

commit;
