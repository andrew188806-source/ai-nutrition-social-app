begin;

alter table public.role_permissions drop constraint role_permissions_permission_key_check;
alter table public.role_permissions add constraint role_permissions_permission_key_check
check (permission_key in (
  'access_context.read','restaurant.read','branch.read','menu.read','nutrition.read',
  'branch_menu_item.sold_out.write','branch_menu_item.availability.write',
  'branch_menu_item.price.write','branch_menu_item.visibility.write',
  'branch.profile.display_name.write','branch_menu_item.display_name.write',
  'branch.hours.weekly.write','branch.hours.special.write','branch.operational_closure.write',
  'branch.profile.public_phone.write','restaurant.profile.public_website.write',
  'restaurant.profile.public_social_links.write'
));
alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;
insert into public.role_permissions(role_id,permission_key,permission_scope)
select id,'restaurant.profile.public_social_links.write','restaurant'
from public.restaurant_roles where role_key='owner';
do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count from public.role_permissions p
  join public.restaurant_roles r on r.id=p.role_id
  where p.permission_key='restaurant.profile.public_social_links.write'
    and p.permission_scope='restaurant' and r.role_key='owner' and r.status='active';
  if v_count<>1 then raise exception 'RA-2I-P2: expected one active owner/restaurant social-links permission'; end if;
end $$;
alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

create function restaurant_internal.restaurant_public_social_link_url_allowed_v1(
  p_provider text,p_url text
) returns boolean language sql immutable strict set search_path='' as $$
  select p_provider in ('instagram','facebook','line','threads','tiktok','youtube')
    and p_url=pg_catalog.btrim(p_url)
    and pg_catalog.char_length(p_url) between 1 and 2048
    and p_url !~ '[\x00-\x1F\x7F-\x9F]'
    and p_url !~ '[[:space:]]'
    and pg_catalog.left(p_url,8)='https://'
    and pg_catalog.split_part(
      pg_catalog.split_part(pg_catalog.split_part(pg_catalog.substring(p_url, 9), '/', 1), '?', 1),
      '#',1
    ) !~ '@'
    and pg_catalog.lower(pg_catalog.split_part(
      pg_catalog.split_part(
        pg_catalog.split_part(pg_catalog.split_part(pg_catalog.substring(p_url, 9), '/', 1), '?', 1),
        '#',1
      ),':',1
    ))=any(case p_provider
      when 'instagram' then array['instagram.com','www.instagram.com']
      when 'facebook' then array['facebook.com','www.facebook.com']
      when 'line' then array['line.me','www.line.me','page.line.me','lin.ee']
      when 'threads' then array['threads.net','www.threads.net']
      when 'tiktok' then array['tiktok.com','www.tiktok.com']
      when 'youtube' then array['youtube.com','www.youtube.com']
      else array[]::text[]
    end);
$$;
revoke all on function restaurant_internal.restaurant_public_social_link_url_allowed_v1(text,text)
  from public,anon,authenticated,authenticator,service_role;

create table public.restaurant_public_social_links(
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  provider text not null check(provider in ('instagram','facebook','line','threads','tiktok','youtube')),
  public_url text,
  public_url_version bigint not null default 0 check(public_url_version>=0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(restaurant_id,provider),
  constraint restaurant_public_social_links_url_check check(
    public_url is null
    or restaurant_internal.restaurant_public_social_link_url_allowed_v1(provider,public_url)
  )
);
revoke all on table public.restaurant_public_social_links
  from public,anon,authenticated,authenticator,service_role;
alter table public.restaurant_public_social_links enable row level security;
alter table public.restaurant_public_social_links force row level security;

create function public.bump_restaurant_public_social_link_version_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  new.public_url_version:=old.public_url_version+1;
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end $$;
create trigger restaurant_public_social_links_version_trigger
before update of public_url on public.restaurant_public_social_links
for each row when(old.public_url is distinct from new.public_url)
execute function public.bump_restaurant_public_social_link_version_v1();

create role restaurant_owner_public_social_links_write_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_public_social_links_write_authority is
  'RA-2I-P2 sealed restaurant social-link writer. It may initialize and update governed provider URLs only.';
grant restaurant_owner_public_social_links_write_authority to postgres
  with admin false,inherit false,set true;
grant usage on schema restaurant_internal to restaurant_owner_public_social_links_write_authority;
grant execute on function restaurant_internal.restaurant_public_social_link_url_allowed_v1(text,text)
  to restaurant_owner_public_social_links_write_authority;

create table restaurant_internal.restaurant_public_social_link_audit_log(
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  provider text not null check(provider in ('instagram','facebook','line','threads','tiktok','youtube')),
  action text not null check(action in ('SET','CLEAR')),
  previous_public_url text,
  next_public_url text,
  previous_version bigint not null,
  next_version bigint not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint restaurant_social_audit_transition check(previous_public_url is distinct from next_public_url),
  constraint restaurant_social_audit_action check(
    (action='SET' and next_public_url is not null) or (action='CLEAR' and next_public_url is null)),
  constraint restaurant_social_audit_version check(previous_version>=0 and next_version=previous_version+1)
);
create index restaurant_public_social_link_audit_target_idx
  on restaurant_internal.restaurant_public_social_link_audit_log(restaurant_id,provider,created_at desc);
alter table restaurant_internal.restaurant_public_social_link_audit_log enable row level security;
alter table restaurant_internal.restaurant_public_social_link_audit_log force row level security;
create policy restaurant_social_audit_writer_select
  on restaurant_internal.restaurant_public_social_link_audit_log
  for select to restaurant_owner_public_social_links_write_authority using(true);
create policy restaurant_social_audit_writer_insert
  on restaurant_internal.restaurant_public_social_link_audit_log
  for insert to restaurant_owner_public_social_links_write_authority with check(true);
revoke all on table restaurant_internal.restaurant_public_social_link_audit_log
  from public,anon,authenticated,authenticator,service_role;
grant select,insert on restaurant_internal.restaurant_public_social_link_audit_log
  to restaurant_owner_public_social_links_write_authority;

grant select(id,auth_user_id,login_status) on public.restaurant_users
  to restaurant_owner_public_social_links_write_authority;
grant select(id,restaurant_user_id,restaurant_id,role_id,status) on public.restaurant_memberships
  to restaurant_owner_public_social_links_write_authority;
grant select(id,role_key,status) on public.restaurant_roles
  to restaurant_owner_public_social_links_write_authority;
grant select(role_id,permission_key,permission_scope) on public.role_permissions
  to restaurant_owner_public_social_links_write_authority;
grant select(id) on public.restaurants to restaurant_owner_public_social_links_write_authority;
grant select(restaurant_id,provider,public_url,public_url_version)
  on public.restaurant_public_social_links to restaurant_owner_public_social_links_write_authority;
grant insert(restaurant_id,provider,public_url,public_url_version)
  on public.restaurant_public_social_links to restaurant_owner_public_social_links_write_authority;
grant update(public_url)
  on public.restaurant_public_social_links to restaurant_owner_public_social_links_write_authority;

create policy restaurant_users_owner_social_context_select on public.restaurant_users
  for select to restaurant_owner_public_social_links_write_authority using(true);
create policy restaurant_memberships_owner_social_context_select on public.restaurant_memberships
  for select to restaurant_owner_public_social_links_write_authority using(true);
create policy restaurant_roles_owner_social_context_select on public.restaurant_roles
  for select to restaurant_owner_public_social_links_write_authority using(true);
create policy role_permissions_owner_social_context_select on public.role_permissions
  for select to restaurant_owner_public_social_links_write_authority using(true);
create policy restaurants_owner_social_context_select on public.restaurants
  for select to restaurant_owner_public_social_links_write_authority using(true);

create policy restaurant_social_links_writer_select on public.restaurant_public_social_links
  for select to restaurant_owner_public_social_links_write_authority using(true);
create policy restaurant_social_links_writer_insert on public.restaurant_public_social_links
  for insert to restaurant_owner_public_social_links_write_authority
  with check(restaurant_internal.restaurant_public_social_link_url_allowed_v1(provider,public_url));
create policy restaurant_social_links_writer_update on public.restaurant_public_social_links
  for update to restaurant_owner_public_social_links_write_authority using(true)
  with check(public_url is null or restaurant_internal.restaurant_public_social_link_url_allowed_v1(provider,public_url));

create policy restaurant_social_links_tenant_select on public.restaurant_public_social_links
  as restrictive for select to restaurant_owner_public_social_links_write_authority
  using(exists(
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id=caller.id
    join public.restaurant_roles role on role.id=membership.role_id
    join public.role_permissions permission on permission.role_id=role.id
    where caller.auth_user_id=(coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
      nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::pg_catalog.jsonb->>'sub'
    ))::pg_catalog.uuid
      and caller.login_status='enabled' and membership.status='active'
      and membership.restaurant_id=restaurant_public_social_links.restaurant_id
      and role.status='active' and role.role_key='owner'
      and permission.permission_key='restaurant.profile.public_social_links.write'
      and permission.permission_scope='restaurant'
  ));
create policy restaurant_social_links_tenant_insert on public.restaurant_public_social_links
  as restrictive for insert to restaurant_owner_public_social_links_write_authority
  with check(exists(
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id=caller.id
    join public.restaurant_roles role on role.id=membership.role_id
    join public.role_permissions permission on permission.role_id=role.id
    where caller.auth_user_id=(coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
      nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::pg_catalog.jsonb->>'sub'
    ))::pg_catalog.uuid
      and caller.login_status='enabled' and membership.status='active'
      and membership.restaurant_id=restaurant_public_social_links.restaurant_id
      and role.status='active' and role.role_key='owner'
      and permission.permission_key='restaurant.profile.public_social_links.write'
      and permission.permission_scope='restaurant'
  ));
create policy restaurant_social_links_tenant_update on public.restaurant_public_social_links
  as restrictive for update to restaurant_owner_public_social_links_write_authority
  using(exists(
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id=caller.id
    join public.restaurant_roles role on role.id=membership.role_id
    join public.role_permissions permission on permission.role_id=role.id
    where caller.auth_user_id=(coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
      nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::pg_catalog.jsonb->>'sub'
    ))::pg_catalog.uuid
      and caller.login_status='enabled' and membership.status='active'
      and membership.restaurant_id=restaurant_public_social_links.restaurant_id
      and role.status='active' and role.role_key='owner'
      and permission.permission_key='restaurant.profile.public_social_links.write'
      and permission.permission_scope='restaurant'
  ))
  with check(exists(
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id=caller.id
    join public.restaurant_roles role on role.id=membership.role_id
    join public.role_permissions permission on permission.role_id=role.id
    where caller.auth_user_id=(coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
      nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::pg_catalog.jsonb->>'sub'
    ))::pg_catalog.uuid
      and caller.login_status='enabled' and membership.status='active'
      and membership.restaurant_id=restaurant_public_social_links.restaurant_id
      and role.status='active' and role.role_key='owner'
      and permission.permission_key='restaurant.profile.public_social_links.write'
      and permission.permission_scope='restaurant'
  ));

grant create on schema public to restaurant_owner_public_social_links_write_authority;
create function public.restaurant_owner_preview_public_social_link_v1(
  p_restaurant_id text,p_provider text
) returns jsonb language plpgsql stable security definer
set search_path='' set row_security='on' as $$
declare v_actor uuid;v_url text;v_version bigint;
begin
  begin
    v_actor:=(coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
      nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::pg_catalog.jsonb->>'sub'))::pg_catalog.uuid;
  exception when others then v_actor:=null;end;
  if v_actor is null then return pg_catalog.jsonb_build_object('ok',false,'errorCode','unauthenticated');end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id)=0
    or p_provider is null
    or p_provider not in ('instagram','facebook','line','threads','tiktok','youtube') then
    return pg_catalog.jsonb_build_object('ok',false,'errorCode','invalid_request');
  end if;
  if not exists(
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id=caller.id
    join public.restaurant_roles role on role.id=membership.role_id
    join public.role_permissions permission on permission.role_id=role.id
    where caller.auth_user_id=v_actor and caller.login_status='enabled'
      and membership.status='active' and membership.restaurant_id=p_restaurant_id
      and role.status='active' and role.role_key='owner'
      and permission.permission_key='restaurant.profile.public_social_links.write'
      and permission.permission_scope='restaurant'
  ) then
    if exists(select 1 from public.restaurant_users where auth_user_id=v_actor and login_status='enabled')
      then return pg_catalog.jsonb_build_object('ok',false,'errorCode','target_not_found');
      else return pg_catalog.jsonb_build_object('ok',false,'errorCode','permission_denied');
    end if;
  end if;
  select public_url,public_url_version into v_url,v_version
  from public.restaurant_public_social_links
  where restaurant_id=p_restaurant_id and provider=p_provider;
  if not found then v_url:=null;v_version:=0;end if;
  return pg_catalog.jsonb_build_object('ok',true,'state','ready','restaurantId',p_restaurant_id,
    'provider',p_provider,'publicUrl',v_url,'publicUrlVersion',v_version::text);
end $$;

create function public.restaurant_owner_set_public_social_link_v1(
  p_restaurant_id text,p_provider text,p_operation text,p_expected_public_url text,
  p_next_public_url text,p_expected_version bigint
) returns jsonb language plpgsql volatile security definer
set search_path='' set row_security='on' as $$
declare v_actor uuid;v_membership_id uuid;v_current text;v_version bigint;v_next text;
  v_next_version bigint;v_audit uuid;v_exists boolean;
begin
  begin
    v_actor:=(coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
      nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::pg_catalog.jsonb->>'sub'))::pg_catalog.uuid;
  exception when others then v_actor:=null;end;
  if v_actor is null then return pg_catalog.jsonb_build_object('ok',false,'errorCode','unauthenticated');end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id)=0
    or p_provider is null
    or p_provider not in ('instagram','facebook','line','threads','tiktok','youtube')
    or p_operation is null or p_operation not in ('set','clear') or p_expected_version is null or p_expected_version<0
    or (p_operation='set' and p_next_public_url is null)
    or (p_operation='clear' and p_next_public_url is not null) then
    return pg_catalog.jsonb_build_object('ok',false,'errorCode','invalid_request');
  end if;
  select membership.id into v_membership_id
  from public.restaurant_users caller
  join public.restaurant_memberships membership on membership.restaurant_user_id=caller.id
  join public.restaurant_roles role on role.id=membership.role_id
  join public.role_permissions permission on permission.role_id=role.id
  where caller.auth_user_id=v_actor and caller.login_status='enabled'
    and membership.status='active' and membership.restaurant_id=p_restaurant_id
    and role.status='active' and role.role_key='owner'
    and permission.permission_key='restaurant.profile.public_social_links.write'
    and permission.permission_scope='restaurant';
  if not found then
    if exists(select 1 from public.restaurant_users where auth_user_id=v_actor and login_status='enabled')
      then return pg_catalog.jsonb_build_object('ok',false,'errorCode','target_not_found');
      else return pg_catalog.jsonb_build_object('ok',false,'errorCode','permission_denied');
    end if;
  end if;
  select public_url,public_url_version,true into v_current,v_version,v_exists
  from public.restaurant_public_social_links where restaurant_id=p_restaurant_id and provider=p_provider
  for update;
  if not found then v_current:=null;v_version:=0;v_exists:=false;end if;
  if v_current is distinct from p_expected_public_url or v_version<>p_expected_version then
    return pg_catalog.jsonb_build_object('ok',false,'errorCode','stale_state');
  end if;
  v_next:=case when p_operation='set' then pg_catalog.btrim(p_next_public_url) else null end;
  if p_operation='set' and not restaurant_internal.restaurant_public_social_link_url_allowed_v1(p_provider,v_next) then
    return pg_catalog.jsonb_build_object('ok',false,'errorCode','invalid_request');
  end if;
  if p_operation='set' and p_next_public_url ~ '[\x00-\x1F\x7F-\x9F]' then
    return pg_catalog.jsonb_build_object('ok',false,'errorCode','invalid_request');
  end if;
  if v_current is not distinct from v_next then
    return pg_catalog.jsonb_build_object('ok',false,'errorCode','no_change');
  end if;
  if not v_exists then
    insert into public.restaurant_public_social_links(restaurant_id,provider,public_url,public_url_version)
    values(p_restaurant_id,p_provider,v_next,1)
    returning public_url_version into v_next_version;
  else
    update public.restaurant_public_social_links set public_url=v_next
    where restaurant_id=p_restaurant_id and provider=p_provider
    returning public_url_version into v_next_version;
  end if;
  insert into restaurant_internal.restaurant_public_social_link_audit_log(
    actor_auth_user_id,membership_id,restaurant_id,provider,action,previous_public_url,
    next_public_url,previous_version,next_version
  ) values(v_actor,v_membership_id,p_restaurant_id,p_provider,
    case when p_operation='set' then 'SET' else 'CLEAR' end,
    v_current,v_next,v_version,v_next_version) returning id into v_audit;
  return pg_catalog.jsonb_build_object('ok',true,'state','applied','restaurantId',p_restaurant_id,
    'provider',p_provider,'publicUrl',v_next,'publicUrlVersion',v_next_version::text,'auditId',v_audit);
end $$;

revoke all on function public.restaurant_owner_preview_public_social_link_v1(text,text)
  from public,anon,authenticated,authenticator,service_role;
revoke all on function public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)
  from public,anon,authenticated,authenticator,service_role;
revoke all on function public.bump_restaurant_public_social_link_version_v1()
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.restaurant_owner_preview_public_social_link_v1(text,text) to authenticated;
grant execute on function public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint) to authenticated;
alter function public.restaurant_owner_preview_public_social_link_v1(text,text)
  owner to restaurant_owner_public_social_links_write_authority;
alter function public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)
  owner to restaurant_owner_public_social_links_write_authority;
revoke create on schema public from restaurant_owner_public_social_links_write_authority;
revoke restaurant_owner_public_social_links_write_authority from postgres granted by postgres;

grant select(restaurant_id,provider,public_url,public_url_version)
  on public.restaurant_public_social_links to restaurant_membership_context_reader;
create policy restaurant_social_links_owner_read_select on public.restaurant_public_social_links
  for select to restaurant_membership_context_reader using(true);
grant restaurant_membership_context_reader to postgres with admin false,inherit false,set true;
grant create on schema public to restaurant_membership_context_reader;
create function public.restaurant_internal_restaurant_public_social_links_v1(p_restaurant_id text)
returns table(restaurant_id text,provider text,public_url text,public_url_version text)
language sql stable security definer set search_path='' set row_security='on' as $$
  with authorized_scope as materialized(
    select access.restaurant_id from public.restaurant_current_access_context_v1() access
    where access.restaurant_id=p_restaurant_id and access.permission_key='access_context.read'
      and access.permission_scope='self'
  )
  select link.restaurant_id,link.provider,link.public_url,link.public_url_version::text
  from public.restaurant_public_social_links link
  join authorized_scope scope on scope.restaurant_id=link.restaurant_id
  order by case link.provider when 'instagram' then 1 when 'facebook' then 2
    when 'line' then 3 when 'threads' then 4 when 'tiktok' then 5 when 'youtube' then 6 end;
$$;
revoke all on function public.restaurant_internal_restaurant_public_social_links_v1(text)
  from public,anon,authenticated,authenticator,service_role;
grant execute on function public.restaurant_internal_restaurant_public_social_links_v1(text) to authenticated;
alter function public.restaurant_internal_restaurant_public_social_links_v1(text)
  owner to restaurant_membership_context_reader;
revoke create on schema public from restaurant_membership_context_reader;
grant restaurant_membership_context_reader to postgres with admin false,inherit false,set false;

create policy restaurant_social_links_public_projection_select
  on public.restaurant_public_social_links for select to postgres
  using(public_url is not null);
create view public.consumer_public_restaurant_social_links_v1
with(security_barrier=true) as
select restaurant_id,provider,public_url
from public.restaurant_public_social_links
where public_url is not null;
revoke all on public.consumer_public_restaurant_social_links_v1 from public,anon,authenticated;
grant select on public.consumer_public_restaurant_social_links_v1 to anon,authenticated;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count from pg_catalog.pg_policy
  where polrelid='public.restaurant_public_social_links'::pg_catalog.regclass
    and polname in('restaurant_social_links_tenant_select','restaurant_social_links_tenant_insert',
      'restaurant_social_links_tenant_update') and not polpermissive;
  if v_count<>3 then raise exception 'RA-2I-P2: tenant policies are not restrictive';end if;
  if pg_catalog.has_table_privilege('authenticated','public.restaurant_public_social_links','INSERT')
    or pg_catalog.has_table_privilege('authenticated','public.restaurant_public_social_links','UPDATE')
    or pg_catalog.has_table_privilege('authenticated','public.restaurant_public_social_links','DELETE')
    then raise exception 'RA-2I-P2: authenticated gained direct social DML';end if;
  if pg_catalog.has_table_privilege('restaurant_owner_public_social_links_write_authority','public.restaurants','UPDATE')
    or pg_catalog.has_table_privilege('restaurant_owner_public_social_links_write_authority','public.restaurant_branches','UPDATE')
    or pg_catalog.has_table_privilege('restaurant_owner_public_social_links_write_authority','public.restaurant_public_social_links','DELETE')
    then raise exception 'RA-2I-P2: sealed role scope is too broad';end if;
end $$;
commit;
