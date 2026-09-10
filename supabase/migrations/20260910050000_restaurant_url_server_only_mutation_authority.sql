begin;

-- RA-2I-URL-R2: canonical URL writes must cross the Restaurant Web WHATWG URL
-- boundary. Browser roles retain preview authority but cannot invoke either
-- mutation family. The service-only v2 functions receive an actor already
-- verified by the Route Handler and bridge it into the existing forced RLS
-- policies for the duration of one call.

create function restaurant_internal.restaurant_url_actor_v1()
returns uuid language plpgsql stable set search_path = '' as $$
declare v_actor text;
begin
  v_actor := nullif(pg_catalog.current_setting('restaurant.url_mutation_actor', true), '');
  if v_actor is null then
    v_actor := coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
    );
  end if;
  begin
    return v_actor::pg_catalog.uuid;
  exception when others then
    return null;
  end;
end;
$$;
revoke all on function restaurant_internal.restaurant_url_actor_v1()
  from public, anon, authenticated, authenticator, service_role;
grant execute on function restaurant_internal.restaurant_url_actor_v1()
  to restaurant_owner_public_website_write_authority,
    restaurant_owner_public_social_links_write_authority;

drop policy restaurants_owner_public_website_tenant_select on public.restaurants;
create policy restaurants_owner_public_website_tenant_select
  on public.restaurants as restrictive
  for select to restaurant_owner_public_website_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ));

drop policy restaurants_owner_public_website_tenant_update on public.restaurants;
create policy restaurants_owner_public_website_tenant_update
  on public.restaurants as restrictive
  for update to restaurant_owner_public_website_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ))
  with check (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurants.id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_website.write'
      and permission.permission_scope = 'restaurant'
  ));

drop policy restaurant_social_links_tenant_select on public.restaurant_public_social_links;
create policy restaurant_social_links_tenant_select
  on public.restaurant_public_social_links as restrictive
  for select to restaurant_owner_public_social_links_write_authority
  using (exists (
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles role on role.id = membership.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurant_public_social_links.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_social_links.write'
      and permission.permission_scope = 'restaurant'
  ));

drop policy restaurant_social_links_tenant_insert on public.restaurant_public_social_links;
create policy restaurant_social_links_tenant_insert
  on public.restaurant_public_social_links as restrictive
  for insert to restaurant_owner_public_social_links_write_authority
  with check (exists (
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles role on role.id = membership.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurant_public_social_links.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_social_links.write'
      and permission.permission_scope = 'restaurant'
  ));

drop policy restaurant_social_links_tenant_update on public.restaurant_public_social_links;
create policy restaurant_social_links_tenant_update
  on public.restaurant_public_social_links as restrictive
  for update to restaurant_owner_public_social_links_write_authority
  using (exists (
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles role on role.id = membership.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurant_public_social_links.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_social_links.write'
      and permission.permission_scope = 'restaurant'
  ))
  with check (exists (
    select 1 from public.restaurant_users caller
    join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles role on role.id = membership.role_id
    join public.role_permissions permission on permission.role_id = role.id
    where caller.auth_user_id = restaurant_internal.restaurant_url_actor_v1()
      and caller.login_status = 'enabled' and membership.status = 'active'
      and membership.restaurant_id = restaurant_public_social_links.restaurant_id
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'restaurant.profile.public_social_links.write'
      and permission.permission_scope = 'restaurant'
  ));

grant restaurant_owner_public_website_write_authority to postgres
  with admin false, inherit false, set true;
grant create on schema public to restaurant_owner_public_website_write_authority;

create function public.restaurant_owner_set_public_website_v2(
  p_actor_auth_user_id uuid, p_restaurant_id text, p_operation text,
  p_expected_public_website_url text, p_next_public_website_url text,
  p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare
  v_membership_id uuid; v_target record; v_next text; v_next_version bigint;
  v_audit_id uuid; v_result jsonb;
begin
  if p_actor_auth_user_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_operation is null or p_operation not in ('set', 'clear')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'set' and p_next_public_website_url is null)
    or (p_operation = 'clear' and p_next_public_website_url is not null)
  then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request'); end if;

  v_next := case when p_operation = 'set' then pg_catalog.btrim(p_next_public_website_url) else null end;
  if p_operation = 'set' and (
    pg_catalog.char_length(v_next) < 1 or pg_catalog.char_length(v_next) > 2048
    or v_next ~ '[\x00-\x1F\x7F-\x9F]' or v_next ~ '[[:space:]]'
    or v_next !~ '^https?://[^/@[:space:]]+([/?#]|$)'
  ) then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request'); end if;

  select membership.id into v_membership_id
  from public.restaurant_users caller
  join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
  join public.restaurant_roles role on role.id = membership.role_id
  join public.role_permissions permission on permission.role_id = role.id
  where caller.auth_user_id = p_actor_auth_user_id and caller.login_status = 'enabled'
    and membership.status = 'active' and membership.restaurant_id = p_restaurant_id
    and role.status = 'active' and role.role_key = 'owner'
    and permission.permission_key = 'restaurant.profile.public_website.write'
    and permission.permission_scope = 'restaurant';
  if not found then
    if exists (select 1 from public.restaurant_users
      where auth_user_id = p_actor_auth_user_id and login_status = 'enabled') then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  perform pg_catalog.set_config('restaurant.url_mutation_actor', p_actor_auth_user_id::text, true);
  begin
    select restaurant.id, restaurant.public_website_url, restaurant.public_website_url_version
    into v_target from public.restaurants restaurant
    where restaurant.id = p_restaurant_id for update;
    if not found then
      v_result := pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
    elsif v_target.public_website_url is distinct from p_expected_public_website_url
      or v_target.public_website_url_version <> p_expected_version then
      v_result := pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
    elsif v_target.public_website_url is not distinct from v_next then
      v_result := pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
    else
      update public.restaurants set public_website_url = v_next where id = v_target.id
      returning public_website_url_version into v_next_version;
      insert into restaurant_internal.restaurant_public_website_audit_log
        (actor_auth_user_id, membership_id, restaurant_id, action,
          previous_public_website_url, next_public_website_url, previous_version, next_version)
      values (p_actor_auth_user_id, v_membership_id, v_target.id,
        case when p_operation = 'set' then 'SET' else 'CLEAR' end,
        v_target.public_website_url, v_next, v_target.public_website_url_version, v_next_version)
      returning id into v_audit_id;
      v_result := pg_catalog.jsonb_build_object('ok', true, 'state', 'applied',
        'restaurantId', v_target.id, 'publicWebsiteUrl', v_next,
        'publicWebsiteUrlVersion', v_next_version::text, 'auditId', v_audit_id);
    end if;
  exception when others then
    perform pg_catalog.set_config('restaurant.url_mutation_actor', '', true);
    raise;
  end;
  perform pg_catalog.set_config('restaurant.url_mutation_actor', '', true);
  return v_result;
end;
$$;

-- restaurant_owner_set_public_website_v1 is already owned by the sealed writer role
-- (transferred in the P1B migration), so plain `postgres` -- a non-superuser that only holds
-- non-inheriting membership in that role -- cannot REVOKE on it without first assuming the role.
set role restaurant_owner_public_website_write_authority;
revoke all on function public.restaurant_owner_set_public_website_v1(text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
reset role;
revoke all on function public.restaurant_owner_set_public_website_v2(uuid, text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_set_public_website_v2(uuid, text, text, text, text, bigint)
  to service_role;
alter function public.restaurant_owner_set_public_website_v2(uuid, text, text, text, text, bigint)
  owner to restaurant_owner_public_website_write_authority;
revoke create on schema public from restaurant_owner_public_website_write_authority;
revoke restaurant_owner_public_website_write_authority from postgres granted by postgres;

grant restaurant_owner_public_social_links_write_authority to postgres
  with admin false, inherit false, set true;
grant create on schema public to restaurant_owner_public_social_links_write_authority;

create function public.restaurant_owner_set_public_social_link_v2(
  p_actor_auth_user_id uuid, p_restaurant_id text, p_provider text, p_operation text,
  p_expected_public_url text, p_next_public_url text, p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare
  v_membership_id uuid; v_current text; v_version bigint; v_next text;
  v_next_version bigint; v_audit uuid; v_exists boolean; v_result jsonb;
begin
  if p_actor_auth_user_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_provider is null
    or p_provider not in ('instagram', 'facebook', 'line', 'threads', 'tiktok', 'youtube')
    or p_operation is null or p_operation not in ('set', 'clear')
    or p_expected_version is null or p_expected_version < 0
    or (p_operation = 'set' and p_next_public_url is null)
    or (p_operation = 'clear' and p_next_public_url is not null)
  then return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request'); end if;

  v_next := case when p_operation = 'set' then pg_catalog.btrim(p_next_public_url) else null end;
  if p_operation = 'set'
    and not restaurant_internal.restaurant_public_social_link_url_allowed_v1(p_provider, v_next) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  if p_operation = 'set' and p_next_public_url ~ '[\x00-\x1F\x7F-\x9F]' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  select membership.id into v_membership_id
  from public.restaurant_users caller
  join public.restaurant_memberships membership on membership.restaurant_user_id = caller.id
  join public.restaurant_roles role on role.id = membership.role_id
  join public.role_permissions permission on permission.role_id = role.id
  where caller.auth_user_id = p_actor_auth_user_id and caller.login_status = 'enabled'
    and membership.status = 'active' and membership.restaurant_id = p_restaurant_id
    and role.status = 'active' and role.role_key = 'owner'
    and permission.permission_key = 'restaurant.profile.public_social_links.write'
    and permission.permission_scope = 'restaurant';
  if not found then
    if exists (select 1 from public.restaurant_users
      where auth_user_id = p_actor_auth_user_id and login_status = 'enabled') then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  perform pg_catalog.set_config('restaurant.url_mutation_actor', p_actor_auth_user_id::text, true);
  begin
    select public_url, public_url_version, true into v_current, v_version, v_exists
    from public.restaurant_public_social_links
    where restaurant_id = p_restaurant_id and provider = p_provider for update;
    if not found then v_current := null; v_version := 0; v_exists := false; end if;

    if v_current is distinct from p_expected_public_url or v_version <> p_expected_version then
      v_result := pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
    elsif v_current is not distinct from v_next then
      v_result := pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
    else
      if not v_exists then
        insert into public.restaurant_public_social_links
          (restaurant_id, provider, public_url, public_url_version)
        values (p_restaurant_id, p_provider, v_next, 1)
        returning public_url_version into v_next_version;
      else
        update public.restaurant_public_social_links set public_url = v_next
        where restaurant_id = p_restaurant_id and provider = p_provider
        returning public_url_version into v_next_version;
      end if;
      insert into restaurant_internal.restaurant_public_social_link_audit_log
        (actor_auth_user_id, membership_id, restaurant_id, provider, action,
          previous_public_url, next_public_url, previous_version, next_version)
      values (p_actor_auth_user_id, v_membership_id, p_restaurant_id, p_provider,
        case when p_operation = 'set' then 'SET' else 'CLEAR' end,
        v_current, v_next, v_version, v_next_version)
      returning id into v_audit;
      v_result := pg_catalog.jsonb_build_object('ok', true, 'state', 'applied',
        'restaurantId', p_restaurant_id, 'provider', p_provider, 'publicUrl', v_next,
        'publicUrlVersion', v_next_version::text, 'auditId', v_audit);
    end if;
  exception when others then
    perform pg_catalog.set_config('restaurant.url_mutation_actor', '', true);
    raise;
  end;
  perform pg_catalog.set_config('restaurant.url_mutation_actor', '', true);
  return v_result;
end;
$$;

-- Same reasoning as the website v1 revoke above: v1 is already owned by the sealed social
-- writer role from the P2 migration, so postgres must assume it before revoking.
set role restaurant_owner_public_social_links_write_authority;
revoke all on function public.restaurant_owner_set_public_social_link_v1(text, text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
reset role;
revoke all on function public.restaurant_owner_set_public_social_link_v2(uuid, text, text, text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.restaurant_owner_set_public_social_link_v2(uuid, text, text, text, text, text, bigint)
  to service_role;
alter function public.restaurant_owner_set_public_social_link_v2(uuid, text, text, text, text, text, bigint)
  owner to restaurant_owner_public_social_links_write_authority;
revoke create on schema public from restaurant_owner_public_social_links_write_authority;
revoke restaurant_owner_public_social_links_write_authority from postgres granted by postgres;

do $$
declare v_ok boolean;
begin
  select not pg_catalog.has_function_privilege(
    'authenticated', 'public.restaurant_owner_set_public_website_v1(text,text,text,text,bigint)', 'EXECUTE')
    and not pg_catalog.has_function_privilege(
      'authenticated', 'public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)', 'EXECUTE')
    and pg_catalog.has_function_privilege(
      'service_role', 'public.restaurant_owner_set_public_website_v2(uuid,text,text,text,text,bigint)', 'EXECUTE')
    and pg_catalog.has_function_privilege(
      'service_role', 'public.restaurant_owner_set_public_social_link_v2(uuid,text,text,text,text,text,bigint)', 'EXECUTE')
  into v_ok;
  if not v_ok then raise exception 'RA-2I-URL-R2: mutation execute boundary invalid'; end if;
end;
$$;

commit;
