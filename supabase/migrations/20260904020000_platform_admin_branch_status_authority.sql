-- RA-1C-P0: one governed Platform Admin mutation: active/inactive for one branch.
-- No restaurant-owner, Nutritionist, membership-management, generic patch, or delete authority.
begin;

alter table admin_internal.platform_admin_role_permissions
  drop constraint platform_admin_role_permissions_permission_key_check,
  drop constraint platform_admin_role_permissions_permission_scope_check;
alter table admin_internal.platform_admin_role_permissions
  add constraint platform_admin_role_permissions_key_scope_check check (
    (permission_key = 'admin_context.read' and permission_scope = 'self') or
    (permission_key = 'admin_audit.read' and permission_scope = 'platform') or
    (permission_key = 'admin_restaurant_branch.status.write' and permission_scope = 'platform')
  );
grant platform_admin_write_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to platform_admin_write_authority;
create policy platform_admin_role_permissions_writer_insert
  on admin_internal.platform_admin_role_permissions
  for insert to platform_admin_write_authority with check (true);
grant insert on admin_internal.platform_admin_role_permissions to platform_admin_write_authority;
set role platform_admin_write_authority;
insert into admin_internal.platform_admin_role_permissions (role_id, permission_key, permission_scope)
values ('00000000-0000-4000-8000-00000000ad01', 'admin_restaurant_branch.status.write', 'platform');
reset role;

-- Keep the RA-1A/RA-1B v1 DTO closed to its original two read permissions. The new operation
-- permission is evaluated by the exact permission predicate and never changes RA-1B's wire shape.
grant platform_admin_context_reader to postgres with admin false, inherit false, set true;
grant create on schema public to platform_admin_context_reader;
set role platform_admin_context_reader;
create or replace function public.platform_admin_current_context_v1()
returns table (role_key text, permission_key text, permission_scope text)
language sql stable security definer set search_path = '' set row_security = 'on'
as $$
  with request_actor as (
    select coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    )::pg_catalog.uuid as auth_user_id
  )
  select role.role_key, permission.permission_key, permission.permission_scope
  from request_actor
  join admin_internal.platform_admin_memberships membership
    on membership.auth_user_id = request_actor.auth_user_id and membership.status = 'active'
  join admin_internal.platform_admin_roles role
    on role.id = membership.role_id and role.status = 'active'
  join admin_internal.platform_admin_role_permissions permission on permission.role_id = role.id
  where permission.permission_key in ('admin_context.read', 'admin_audit.read');
$$;
reset role;

alter table public.restaurant_branches add column status_version bigint not null default 0;
alter table public.restaurant_branches add constraint restaurant_branches_status_version_check
  check (status_version >= 0);

create function public.bump_restaurant_branch_status_version_v1()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.status_version := old.status_version + 1;
  return new;
end;
$$;
create trigger restaurant_branches_status_version_trigger
before update of status on public.restaurant_branches
for each row when (old.status is distinct from new.status)
execute function public.bump_restaurant_branch_status_version_v1();

create table admin_internal.platform_admin_operation_receipts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  request_id uuid not null,
  action text not null check (action = 'set_restaurant_branch_status'),
  target_type text not null check (target_type = 'restaurant_branch'),
  restaurant_id text not null,
  branch_id text not null,
  expected_status text not null check (expected_status in ('active', 'inactive')),
  requested_status text not null check (requested_status in ('active', 'inactive')),
  expected_version bigint not null check (expected_version >= 0),
  reason_code text not null check (reason_code in ('operational_pause', 'operational_resume')),
  result text not null check (result in ('applied', 'noop', 'rejected')),
  error_code text check (error_code is null or error_code in ('target_not_found','stale_state','mutation_rejected')),
  before_status text check (before_status is null or before_status in ('active','inactive','temporary_closed','archived')),
  after_status text check (after_status is null or after_status in ('active','inactive','temporary_closed','archived')),
  before_version bigint check (before_version is null or before_version >= 0),
  after_version bigint check (after_version is null or after_version >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint platform_admin_operation_receipts_actor_request_key unique (actor_auth_user_id, request_id),
  constraint platform_admin_operation_receipts_result_shape check (
    (result = 'rejected' and error_code is not null) or (result in ('applied','noop') and error_code is null)
  )
);
create index platform_admin_operation_receipts_created_at_idx
  on admin_internal.platform_admin_operation_receipts (created_at desc, id desc);
alter table admin_internal.platform_admin_operation_receipts enable row level security;
alter table admin_internal.platform_admin_operation_receipts force row level security;

create role platform_admin_branch_status_authority nologin noinherit nobypassrls;
comment on role platform_admin_branch_status_authority is
  'RA-1C-P0 sealed writer for one branch status operation; no login, membership, delete, or generic write path.';
grant platform_admin_branch_status_authority to postgres with admin false, inherit false, set true;
grant usage on schema admin_internal to platform_admin_branch_status_authority;
grant usage, create on schema public to platform_admin_branch_status_authority;
grant select (id, restaurant_id, name, status, status_version), update (status)
  on public.restaurant_branches to platform_admin_branch_status_authority;
grant select, insert on admin_internal.platform_admin_operation_receipts
  to platform_admin_branch_status_authority;

create policy platform_admin_branch_status_select on public.restaurant_branches
  for select to platform_admin_branch_status_authority using (true);
create policy platform_admin_branch_status_update on public.restaurant_branches
  for update to platform_admin_branch_status_authority using (true) with check (true);
create policy platform_admin_operation_receipts_select on admin_internal.platform_admin_operation_receipts
  for select to platform_admin_branch_status_authority using (true);
create policy platform_admin_operation_receipts_insert on admin_internal.platform_admin_operation_receipts
  for insert to platform_admin_branch_status_authority with check (true);

-- Owned by the RA-1A provisioning authority because SELECT FOR UPDATE requires UPDATE privilege.
-- It cannot grant/revoke or accept an actor parameter; it returns only the verified current actor.
create function admin_internal.lock_current_platform_admin_branch_status_actor_v1()
returns uuid language plpgsql volatile security definer set search_path = '' set row_security = 'on' as $$
declare v_actor_text text; v_actor uuid;
begin
  v_actor_text := coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub');
  if v_actor_text is null or v_actor_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  select membership.auth_user_id into v_actor
  from admin_internal.platform_admin_memberships membership
  join admin_internal.platform_admin_roles role on role.id = membership.role_id and role.status = 'active'
  join admin_internal.platform_admin_role_permissions permission
    on permission.role_id = role.id
   and permission.permission_key = 'admin_restaurant_branch.status.write'
   and permission.permission_scope = 'platform'
  where membership.auth_user_id = v_actor_text::uuid and membership.status = 'active'
  for update of membership;
  return v_actor;
end;
$$;

create function public.platform_admin_restaurant_branch_status_v1(p_restaurant_id text, p_branch_id text)
returns table (restaurant_id text, branch_id text, branch_name text, status text, status_version text)
language plpgsql volatile security definer set search_path = '' set row_security = 'on' as $$
begin
  if admin_internal.lock_current_platform_admin_branch_status_actor_v1() is null then return; end if;
  if p_restaurant_id is null or p_branch_id is null or pg_catalog.length(p_restaurant_id) not between 1 and 200
     or pg_catalog.length(p_branch_id) not between 1 and 200 or p_restaurant_id <> pg_catalog.btrim(p_restaurant_id)
     or p_branch_id <> pg_catalog.btrim(p_branch_id) then return; end if;
  return query select branch.restaurant_id, branch.id, branch.name, branch.status,
    branch.status_version::text from public.restaurant_branches branch
    where branch.id = p_branch_id and branch.restaurant_id = p_restaurant_id;
end;
$$;

create function public.platform_admin_set_restaurant_branch_status_v1(
  p_restaurant_id text, p_branch_id text, p_expected_status text, p_requested_status text,
  p_expected_version bigint, p_reason_code text, p_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' set row_security = 'on' as $$
declare v_actor uuid; v_branch_restaurant_id text; v_before_status text; v_before_version bigint;
        v_prior admin_internal.platform_admin_operation_receipts%rowtype;
        v_result text; v_error text; v_after_version bigint; v_created_at timestamptz;
begin
  v_actor := admin_internal.lock_current_platform_admin_branch_status_actor_v1();
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

revoke all on admin_internal.platform_admin_operation_receipts from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.lock_current_platform_admin_branch_status_actor_v1() from public, anon, authenticated, authenticator, service_role;
revoke all on function public.platform_admin_restaurant_branch_status_v1(text,text) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) from public, anon, authenticated, authenticator, service_role;
revoke all on function public.bump_restaurant_branch_status_version_v1() from public, anon, authenticated, authenticator, service_role;
grant execute on function admin_internal.lock_current_platform_admin_branch_status_actor_v1() to platform_admin_branch_status_authority;
grant execute on function public.platform_admin_restaurant_branch_status_v1(text,text) to authenticated;
grant execute on function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) to authenticated;

alter function admin_internal.lock_current_platform_admin_branch_status_actor_v1() owner to platform_admin_write_authority;
alter function public.platform_admin_restaurant_branch_status_v1(text,text) owner to platform_admin_branch_status_authority;
alter function public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid) owner to platform_admin_branch_status_authority;
alter function public.bump_restaurant_branch_status_version_v1() owner to platform_admin_branch_status_authority;
revoke create on schema public from platform_admin_branch_status_authority;
revoke create on schema public from platform_admin_context_reader;
revoke create on schema admin_internal from platform_admin_write_authority;
revoke platform_admin_branch_status_authority from postgres granted by postgres;
revoke platform_admin_context_reader from postgres granted by postgres;
revoke platform_admin_write_authority from postgres granted by postgres;
commit;
