begin;

-- R2B-4: the governed Restaurant Owner Menu Item authoring authority (create, content edit,
-- lifecycle). menu_items.name is RESTAURANT-TENANT-LOCAL canonical content (R2A finding, frozen):
-- restaurant_id is a first-class direct FK on menu_items, independently enforced against the
-- menu_category/menu chain by the R2B-1 trigger, and there is no evidence anywhere of cross-
-- restaurant row sharing.
--
-- GOVERNED FIELDS EXCLUDED. nutrition_badge_status, badge_enabled, nutrition_id and tag_ids are
-- NOT parameters of any RPC in this migration, and none of the four appears in any INSERT/UPDATE
-- column-privilege grant below. This is structural, not merely a UI omission: even a defective RPC
-- body could not write them, because the sealed writer's own GRANT does not cover those columns.
-- image_url is likewise excluded -- media upload has no backend capability yet, and this round does
-- not make it a creation prerequisite.
--
-- CONTENT vs LIFECYCLE. name/description/allergens/menu_category_id share one content_version and
-- one edit RPC (they are all owned by the single menu_item.write permission and typically submitted
-- together from one form). status is independently versioned and has its own transition RPC, so a
-- pending content edit is never invalidated by an unrelated status change.

alter table public.role_permissions
  drop constraint role_permissions_permission_key_check;
alter table public.role_permissions
  add constraint role_permissions_permission_key_check
  check (permission_key in (
    'access_context.read', 'restaurant.read', 'branch.read', 'menu.read', 'nutrition.read',
    'branch_menu_item.sold_out.write', 'branch_menu_item.availability.write',
    'branch_menu_item.price.write', 'branch_menu_item.visibility.write',
    'branch.profile.display_name.write', 'branch_menu_item.display_name.write',
    'branch.hours.weekly.write', 'branch.hours.special.write',
    'branch.operational_closure.write', 'branch.profile.public_phone.write',
    'restaurant.profile.public_website.write', 'restaurant.profile.public_social_links.write',
    'restaurant.profile.about.write',
    'menu.write', 'menu_category.write', 'menu_item.write'
  ));

alter table public.restaurant_roles no force row level security;
alter table public.role_permissions no force row level security;

insert into public.role_permissions (role_id, permission_key, permission_scope)
select role.id, 'menu_item.write', 'restaurant'
from public.restaurant_roles as role
where role.role_key = 'owner';

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from public.role_permissions as permission
  join public.restaurant_roles as role on role.id = permission.role_id
  where permission.permission_key = 'menu_item.write'
    and permission.permission_scope = 'restaurant'
    and role.role_key = 'owner' and role.status = 'active';
  if v_count <> 1 then
    raise exception 'R2B-4: expected exactly one active owner/restaurant menu_item.write permission row';
  end if;
end
$$;

alter table public.role_permissions force row level security;
alter table public.restaurant_roles force row level security;

create function restaurant_internal.menu_item_name_allowed_v1(p_text text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_text = pg_catalog.btrim(p_text, ' ')
    and pg_catalog.char_length(p_text) between 1 and 120
    and p_text !~ '[\x00-\x1F\x7F-\x9F]';
$$;
revoke all on function restaurant_internal.menu_item_name_allowed_v1(text)
  from public, anon, authenticated, authenticator, service_role;

-- Description is optional prose. When present: outer-space-trim, 1-800 code points, all C0/C1
-- controls forbidden except LF, and a value that is entirely spaces/newlines is rejected -- the
-- exact restaurant_about_text_allowed_v1 shape (RA-2G-P1), reused as a design pattern, not by call.
create function restaurant_internal.menu_item_description_allowed_v1(p_text text)
returns boolean language sql immutable strict set search_path = '' as $$
  select p_text = pg_catalog.btrim(p_text, ' ')
    and pg_catalog.char_length(p_text) between 1 and 800
    and p_text !~ '[\x00-\x09\x0B-\x1F\x7F-\x9F]'
    and p_text !~ '^[ \n]+$';
$$;
revoke all on function restaurant_internal.menu_item_description_allowed_v1(text)
  from public, anon, authenticated, authenticator, service_role;

-- Allergens: advisory restaurant-entered data only, never verified nutrition/allergen authority
-- (that remains the separate candidate_allergen_facts system). No global vocabulary is enforced --
-- only sanity bounds, so this cannot become an unbounded-input vector: at most 50 entries, each an
-- outer-trimmed, control-character-free string of 1-40 code points, and no NULL element.
create function restaurant_internal.menu_item_allergens_allowed_v1(p_allergens text[])
returns boolean language sql immutable strict set search_path = '' as $$
  select p_allergens is null
    or (
      pg_catalog.array_length(p_allergens, 1) is null
      or (
        pg_catalog.array_length(p_allergens, 1) <= 50
        and not exists (
          select 1 from pg_catalog.unnest(p_allergens) as element(value)
          where element.value is null
            or element.value <> pg_catalog.btrim(element.value, ' ')
            or pg_catalog.char_length(element.value) not between 1 and 40
            or element.value ~ '[\x00-\x1F\x7F-\x9F]'
        )
      )
    );
$$;
revoke all on function restaurant_internal.menu_item_allergens_allowed_v1(text[])
  from public, anon, authenticated, authenticator, service_role;

alter table public.menu_items
  add column content_version bigint not null default 0,
  add column status_version bigint not null default 0;
alter table public.menu_items
  add constraint menu_items_content_version_non_negative check (content_version >= 0),
  add constraint menu_items_status_version_non_negative check (status_version >= 0),
  add constraint menu_items_name_check check (restaurant_internal.menu_item_name_allowed_v1(name)),
  add constraint menu_items_description_check
    check (description is null or restaurant_internal.menu_item_description_allowed_v1(description)),
  add constraint menu_items_allergens_check
    check (restaurant_internal.menu_item_allergens_allowed_v1(allergens));

create function restaurant_internal.menu_item_content_version_maintain()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 0;
    return new;
  end if;
  if new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.allergens is distinct from old.allergens
    or new.menu_category_id is distinct from old.menu_category_id then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$$;
create trigger menu_items_content_version_maintain
  before insert or update on public.menu_items
  for each row execute function restaurant_internal.menu_item_content_version_maintain();
revoke all on function restaurant_internal.menu_item_content_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

create function restaurant_internal.menu_item_status_version_maintain()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.status_version := 0;
    return new;
  end if;
  if new.status is distinct from old.status then
    new.status_version := old.status_version + 1;
  else
    new.status_version := old.status_version;
  end if;
  return new;
end;
$$;
create trigger menu_items_status_version_maintain
  before insert or update on public.menu_items
  for each row execute function restaurant_internal.menu_item_status_version_maintain();
revoke all on function restaurant_internal.menu_item_status_version_maintain()
  from public, anon, authenticated, authenticator, service_role;

create role restaurant_owner_menu_item_write_authority
  nologin noinherit nobypassrls;
comment on role restaurant_owner_menu_item_write_authority is
  'R2B-4 sealed writer. Owns menu_items CREATE, content UPDATE (name/description/allergens/menu_category_id) and status UPDATE RPCs. Cannot write nutrition_badge_status, badge_enabled, nutrition_id, tag_ids or image_url. Granted to no client role.';
grant restaurant_owner_menu_item_write_authority to postgres
  with admin false, inherit false, set true;
grant usage on schema restaurant_internal to restaurant_owner_menu_item_write_authority;

create table restaurant_internal.menu_item_authoring_audit_log (
  id uuid not null default pg_catalog.gen_random_uuid(),
  actor_auth_user_id uuid not null,
  membership_id uuid not null,
  restaurant_id text not null,
  menu_item_id text not null,
  action text not null check (action in ('CREATE', 'CONTENT_EDIT', 'STATUS_TRANSITION')),
  previous_name text,
  next_name text,
  previous_description text,
  next_description text,
  previous_allergens text[],
  next_allergens text[],
  previous_menu_category_id text,
  next_menu_category_id text,
  previous_status text,
  next_status text,
  previous_content_version bigint,
  next_content_version bigint,
  previous_status_version bigint,
  next_status_version bigint,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint menu_item_authoring_audit_log_pkey primary key (id),
  constraint menu_item_authoring_audit_log_create_shape check (
    action <> 'CREATE' or (
      previous_name is null and next_name is not null
      and previous_menu_category_id is null and next_menu_category_id is not null
      and previous_status is null and next_status = 'draft'
      and previous_content_version is null and next_content_version = 0
      and previous_status_version is null and next_status_version = 0
    )
  ),
  constraint menu_item_authoring_audit_log_content_edit_shape check (
    action <> 'CONTENT_EDIT' or (
      previous_name is not null and next_name is not null
      and previous_menu_category_id is not null and next_menu_category_id is not null
      and previous_status is null and next_status is null
      and previous_content_version is not null and next_content_version = previous_content_version + 1
      and previous_status_version is null and next_status_version is null
    )
  ),
  constraint menu_item_authoring_audit_log_transition_shape check (
    action <> 'STATUS_TRANSITION' or (
      previous_name is null and next_name is null
      and previous_menu_category_id is null and next_menu_category_id is null
      and previous_status is not null and next_status is not null and previous_status <> next_status
      and previous_content_version is null and next_content_version is null
      and previous_status_version is not null and next_status_version = previous_status_version + 1
    )
  )
);
create index menu_item_authoring_audit_log_target_idx
  on restaurant_internal.menu_item_authoring_audit_log (menu_item_id, created_at desc);
alter table restaurant_internal.menu_item_authoring_audit_log enable row level security;
alter table restaurant_internal.menu_item_authoring_audit_log force row level security;
create policy menu_item_authoring_audit_log_writer_select
  on restaurant_internal.menu_item_authoring_audit_log
  for select to restaurant_owner_menu_item_write_authority using (true);
create policy menu_item_authoring_audit_log_writer_insert
  on restaurant_internal.menu_item_authoring_audit_log
  for insert to restaurant_owner_menu_item_write_authority with check (true);
revoke all on table restaurant_internal.menu_item_authoring_audit_log
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table restaurant_internal.menu_item_authoring_audit_log
  to restaurant_owner_menu_item_write_authority;

grant select (id, auth_user_id, login_status)
  on table public.restaurant_users to restaurant_owner_menu_item_write_authority;
grant select (id, restaurant_user_id, restaurant_id, role_id, status)
  on table public.restaurant_memberships to restaurant_owner_menu_item_write_authority;
grant select (id, role_key, status)
  on table public.restaurant_roles to restaurant_owner_menu_item_write_authority;
grant select (role_id, permission_key, permission_scope)
  on table public.role_permissions to restaurant_owner_menu_item_write_authority;
grant select (id, restaurant_id, status)
  on table public.menus to restaurant_owner_menu_item_write_authority;
grant select (id, menu_id)
  on table public.menu_categories to restaurant_owner_menu_item_write_authority;
-- menu_categories has no restaurant_id column at all; the tenant chain is read via menu_id ->
-- public.menus.restaurant_id (granted above).
grant select (id, restaurant_id, menu_category_id, name, description, allergens, status,
              content_version, status_version)
  on table public.menu_items to restaurant_owner_menu_item_write_authority;
grant insert (id, restaurant_id, menu_category_id, name, description, allergens, status)
  on table public.menu_items to restaurant_owner_menu_item_write_authority;
grant update (name, description, allergens, menu_category_id, status)
  on table public.menu_items to restaurant_owner_menu_item_write_authority;

create policy menu_items_owner_write_select
  on public.menu_items for select to restaurant_owner_menu_item_write_authority using (true);
create policy menu_items_owner_write_insert
  on public.menu_items for insert to restaurant_owner_menu_item_write_authority
  with check (
    status = 'draft'
    and restaurant_internal.menu_item_name_allowed_v1(name)
    and (description is null or restaurant_internal.menu_item_description_allowed_v1(description))
    and restaurant_internal.menu_item_allergens_allowed_v1(allergens)
  );
create policy menu_items_owner_write_update
  on public.menu_items for update to restaurant_owner_menu_item_write_authority
  using (true)
  with check (
    restaurant_internal.menu_item_name_allowed_v1(name)
    and (description is null or restaurant_internal.menu_item_description_allowed_v1(description))
    and restaurant_internal.menu_item_allergens_allowed_v1(allergens)
    and status in ('draft', 'active', 'archived')
  );

create policy menu_items_owner_write_tenant_select
  on public.menu_items as restrictive for select to restaurant_owner_menu_item_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id and membership.restaurant_id = menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ));
create policy menu_items_owner_write_tenant_insert
  on public.menu_items as restrictive for insert to restaurant_owner_menu_item_write_authority
  with check (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id and membership.restaurant_id = menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ));
create policy menu_items_owner_write_tenant_update
  on public.menu_items as restrictive for update to restaurant_owner_menu_item_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id and membership.restaurant_id = menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ))
  with check (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id and membership.restaurant_id = menu_items.restaurant_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ));

grant execute on function restaurant_internal.menu_item_name_allowed_v1(text)
  to restaurant_owner_menu_item_write_authority;
grant execute on function restaurant_internal.menu_item_description_allowed_v1(text)
  to restaurant_owner_menu_item_write_authority;
grant execute on function restaurant_internal.menu_item_allergens_allowed_v1(text[])
  to restaurant_owner_menu_item_write_authority;

-- This role also needs to read the parent menu (status/archived check) and menu_categories (create
-- target and category-move target resolution) regardless of their own publication status, exactly
-- the same reasoning as R2B-3's equivalent addition -- permissive-only, narrows nothing.
create policy menus_item_authoring_context_select
  on public.menus for select to restaurant_owner_menu_item_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where membership.restaurant_id = menus.restaurant_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ));
create policy menu_categories_item_authoring_context_select
  on public.menu_categories for select to restaurant_owner_menu_item_write_authority
  using (exists (
    select 1
    from public.menus as menu
    join public.restaurant_memberships as membership on membership.restaurant_id = menu.restaurant_id
    join public.restaurant_users as caller on caller.id = membership.restaurant_user_id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where menu.id = menu_categories.menu_id
      and caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ));

grant create on schema public to restaurant_owner_menu_item_write_authority;

create function public.restaurant_owner_create_menu_item_v1(
  p_restaurant_id text,
  p_menu_category_id text,
  p_name text,
  p_description text default null,
  p_allergens text[] default null
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_category record;
  v_name text;
  v_description text;
  v_id text;
  v_content_version bigint;
  v_status_version bigint;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_menu_category_id is null or pg_catalog.length(p_menu_category_id) = 0
    or p_name is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_name := pg_catalog.btrim(p_name, ' ');
  if not restaurant_internal.menu_item_name_allowed_v1(v_name) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_description := nullif(pg_catalog.btrim(p_description, ' '), '');
  if v_description is not null and not restaurant_internal.menu_item_description_allowed_v1(v_description) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not restaurant_internal.menu_item_allergens_allowed_v1(p_allergens) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  -- The single gate: derive the parent restaurant from menu_category_id -> menu_id ->
  -- menus.restaurant_id, REQUIRE it to equal p_restaurant_id exactly, AND require an active owner
  -- membership holding menu_item.write for that same restaurant -- all in one join. Neither side of
  -- the restaurant_id equality is trusted alone: a caller who legitimately owns restaurant A cannot
  -- create an item by naming restaurant A while pointing menu_category_id at a category that
  -- actually belongs to restaurant B, because this join fails to find v_category at all then.
  select category.id, menu.id as menu_id, menu.restaurant_id, menu.status, membership.id as membership_id
  into v_category
  from public.menu_categories as category
  join public.menus as menu on menu.id = category.menu_id
  join public.restaurant_memberships as membership
    on membership.restaurant_id = menu.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  where category.id = p_menu_category_id and menu.restaurant_id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;
  if v_category.status = 'archived' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'parent_unavailable');
  end if;

  v_id := pg_catalog.gen_random_uuid()::text;

  -- restaurant_id is written as p_restaurant_id (== v_category.restaurant_id, already proven equal
  -- above); the R2B-1 trigger independently re-verifies this same equality at INSERT time.
  insert into public.menu_items
    (id, restaurant_id, menu_category_id, name, description, allergens, status)
  values (v_id, p_restaurant_id, v_category.id, v_name, v_description,
    coalesce(p_allergens, '{}'::text[]), 'draft')
  returning content_version, status_version into v_content_version, v_status_version;

  insert into restaurant_internal.menu_item_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_item_id, action,
     next_name, next_menu_category_id, next_status, next_content_version, next_status_version)
  values (v_actor, v_category.membership_id, p_restaurant_id, v_id, 'CREATE',
     v_name, v_category.id, 'draft', v_content_version, v_status_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'created',
    'menuItemId', v_id, 'restaurantId', p_restaurant_id, 'menuCategoryId', v_category.id,
    'name', v_name, 'description', v_description, 'allergens', coalesce(p_allergens, '{}'::text[]),
    'contentVersion', v_content_version::text,
    'status', 'draft', 'statusVersion', v_status_version::text,
    'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_create_menu_item_v1(text, text, text, text, text[]) is
  'R2B-4. Creates a new draft menu item. Never accepts nutrition_badge_status, badge_enabled, nutrition_id, tag_ids or image_url as arguments.';

create function public.restaurant_owner_preview_menu_item_v1(
  p_restaurant_id text,
  p_menu_item_id text
)
returns jsonb
language plpgsql stable security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_menu_item_id is null or pg_catalog.length(p_menu_item_id) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.restaurant_id, item.menu_category_id, item.name, item.description,
         item.allergens, item.status, item.content_version, item.status_version
  into v_target
  from public.menu_items as item
  join public.restaurant_memberships as membership
    on membership.restaurant_id = item.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  where item.id = p_menu_item_id and item.restaurant_id = p_restaurant_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'state', 'ready',
    'menuItemId', v_target.id, 'restaurantId', v_target.restaurant_id,
    'menuCategoryId', v_target.menu_category_id,
    'name', v_target.name, 'description', v_target.description, 'allergens', v_target.allergens,
    'contentVersion', v_target.content_version::text,
    'status', v_target.status, 'statusVersion', v_target.status_version::text
  );
end;
$$;
comment on function public.restaurant_owner_preview_menu_item_v1(text, text) is
  'R2B-4. Returns the current content and status of one menu item, both concurrency tokens included. Read-only and STABLE.';

create function public.restaurant_owner_set_menu_item_content_v1(
  p_menu_item_id text,
  p_expected_name text,
  p_next_name text,
  p_expected_description text,
  p_next_description text,
  p_expected_allergens text[],
  p_next_allergens text[],
  p_expected_menu_category_id text,
  p_next_menu_category_id text,
  p_expected_version bigint
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
  v_next_name text;
  v_next_description text;
  v_next_allergens text[];
  v_next_category record;
  v_next_content_version bigint;
  v_audit_id uuid;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_menu_item_id is null or pg_catalog.length(p_menu_item_id) = 0
    or p_next_name is null
    or p_next_menu_category_id is null or pg_catalog.length(p_next_menu_category_id) = 0
    or p_expected_version is null or p_expected_version < 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_next_name := pg_catalog.btrim(p_next_name, ' ');
  if not restaurant_internal.menu_item_name_allowed_v1(v_next_name) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  v_next_description := nullif(pg_catalog.btrim(p_next_description, ' '), '');
  if v_next_description is not null
    and not restaurant_internal.menu_item_description_allowed_v1(v_next_description) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;
  v_next_allergens := coalesce(p_next_allergens, '{}'::text[]);
  if not restaurant_internal.menu_item_allergens_allowed_v1(v_next_allergens) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.restaurant_id, item.menu_category_id, item.name, item.description,
         item.allergens, item.content_version, membership.id as membership_id
  into v_target
  from public.menu_items as item
  join public.restaurant_memberships as membership
    on membership.restaurant_id = item.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  where item.id = p_menu_item_id
  for update of item;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.name is distinct from p_expected_name
    or v_target.description is distinct from p_expected_description
    or v_target.allergens is distinct from p_expected_allergens
    or v_target.menu_category_id is distinct from p_expected_menu_category_id
    or v_target.content_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;

  if v_target.name = v_next_name
    and v_target.description is not distinct from v_next_description
    and v_target.allergens = v_next_allergens
    and v_target.menu_category_id = p_next_menu_category_id then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  -- A category move must land within the SAME restaurant. Neither side is trusted alone.
  if p_next_menu_category_id is distinct from v_target.menu_category_id then
    select category.id into v_next_category
    from public.menu_categories as category
    join public.menus as menu on menu.id = category.menu_id
    where category.id = p_next_menu_category_id and menu.restaurant_id = v_target.restaurant_id;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
    end if;
  end if;

  update public.menu_items
  set name = v_next_name, description = v_next_description, allergens = v_next_allergens,
      menu_category_id = p_next_menu_category_id
  where id = v_target.id
  returning content_version into v_next_content_version;

  insert into restaurant_internal.menu_item_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_item_id, action,
     previous_name, next_name, previous_description, next_description,
     previous_allergens, next_allergens, previous_menu_category_id, next_menu_category_id,
     previous_content_version, next_content_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.id, 'CONTENT_EDIT',
     v_target.name, v_next_name, v_target.description, v_next_description,
     v_target.allergens, v_next_allergens, v_target.menu_category_id, p_next_menu_category_id,
     v_target.content_version, v_next_content_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'menuItemId', v_target.id,
    'name', v_next_name, 'description', v_next_description, 'allergens', v_next_allergens,
    'menuCategoryId', p_next_menu_category_id,
    'contentVersion', v_next_content_version::text, 'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_set_menu_item_content_v1(text, text, text, text, text, text[], text[], text, text, bigint) is
  'R2B-4. Edits name/description/allergens/menu_category_id together via one content_version. A category move must resolve within the same restaurant. Never writes status or status_version.';

create function public.restaurant_owner_transition_menu_item_status_v1(
  p_menu_item_id text,
  p_expected_status text,
  p_next_status text,
  p_expected_version bigint
)
returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
  v_next_version bigint;
  v_audit_id uuid;
  v_allowed boolean;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
      )
    )::pg_catalog.uuid;
  exception when others then v_actor := null;
  end;
  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;
  if p_menu_item_id is null or pg_catalog.length(p_menu_item_id) = 0
    or p_expected_status is null or p_next_status is null
    or p_expected_status not in ('draft', 'active', 'archived')
    or p_next_status not in ('draft', 'active', 'archived')
    or p_expected_version is null or p_expected_version < 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role on role.id = membership.role_id
    join public.role_permissions as permission on permission.role_id = role.id
    where caller.auth_user_id = v_actor and caller.login_status = 'enabled'
      and membership.status = 'active' and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  select item.id, item.restaurant_id, item.status, item.status_version, membership.id as membership_id
  into v_target
  from public.menu_items as item
  join public.restaurant_memberships as membership
    on membership.restaurant_id = item.restaurant_id and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id and role.status = 'active' and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'menu_item.write' and permission.permission_scope = 'restaurant'
  where item.id = p_menu_item_id
  for update of item;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  if v_target.status is distinct from p_expected_status or v_target.status_version <> p_expected_version then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'stale_state');
  end if;
  if v_target.status = p_next_status then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'no_change');
  end if;

  v_allowed := (v_target.status = 'draft' and p_next_status = 'active')
    or (v_target.status = 'active' and p_next_status = 'archived')
    or (v_target.status = 'draft' and p_next_status = 'archived');
  if not v_allowed then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_transition');
  end if;

  update public.menu_items set status = p_next_status where id = v_target.id
  returning status_version into v_next_version;

  insert into restaurant_internal.menu_item_authoring_audit_log
    (actor_auth_user_id, membership_id, restaurant_id, menu_item_id, action,
     previous_status, next_status, previous_status_version, next_status_version)
  values (v_actor, v_target.membership_id, v_target.restaurant_id, v_target.id, 'STATUS_TRANSITION',
     v_target.status, p_next_status, v_target.status_version, v_next_version)
  returning id into v_audit_id;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'menuItemId', v_target.id, 'status', p_next_status,
    'statusVersion', v_next_version::text, 'auditId', v_audit_id
  );
end;
$$;
comment on function public.restaurant_owner_transition_menu_item_status_v1(text, text, text, bigint) is
  'R2B-4. Transitions one menu item''s status. Accepted transitions only: draft->active, active->archived, draft->archived. Never writes content or content_version.';

revoke all on function public.restaurant_owner_create_menu_item_v1(text, text, text, text, text[])
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_preview_menu_item_v1(text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_set_menu_item_content_v1(text, text, text, text, text, text[], text[], text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.restaurant_owner_transition_menu_item_status_v1(text, text, text, bigint)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_create_menu_item_v1(text, text, text, text, text[]) to authenticated;
grant execute on function public.restaurant_owner_preview_menu_item_v1(text, text) to authenticated;
grant execute on function public.restaurant_owner_set_menu_item_content_v1(text, text, text, text, text, text[], text[], text, text, bigint) to authenticated;
grant execute on function public.restaurant_owner_transition_menu_item_status_v1(text, text, text, bigint) to authenticated;

alter function public.restaurant_owner_create_menu_item_v1(text, text, text, text, text[])
  owner to restaurant_owner_menu_item_write_authority;
alter function public.restaurant_owner_preview_menu_item_v1(text, text)
  owner to restaurant_owner_menu_item_write_authority;
alter function public.restaurant_owner_set_menu_item_content_v1(text, text, text, text, text, text[], text[], text, text, bigint)
  owner to restaurant_owner_menu_item_write_authority;
alter function public.restaurant_owner_transition_menu_item_status_v1(text, text, text, bigint)
  owner to restaurant_owner_menu_item_write_authority;

revoke create on schema public from restaurant_owner_menu_item_write_authority;
revoke restaurant_owner_menu_item_write_authority from postgres granted by postgres;

do $$
declare v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.menu_items'::pg_catalog.regclass
    and policy.polname in ('menu_items_owner_write_tenant_select', 'menu_items_owner_write_tenant_insert',
                            'menu_items_owner_write_tenant_update')
    and policy.polpermissive = false;
  if v_count <> 3 then
    raise exception 'R2B-4: the tenant policies are not RESTRICTIVE (found % of 3)', v_count;
  end if;

  if not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'restaurant_id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'menu_category_id', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'name', 'INSERT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'status', 'INSERT') then
    raise exception 'R2B-4: the item writer lacks a required INSERT column privilege';
  end if;

  if pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'nutrition_badge_status', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'nutrition_badge_status', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'badge_enabled', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'badge_enabled', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'nutrition_id', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'nutrition_id', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'tag_ids', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'tag_ids', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'image_url', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'image_url', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'content_version', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'content_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'status_version', 'INSERT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'status_version', 'UPDATE')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'restaurant_id', 'UPDATE') then
    raise exception 'R2B-4: the item writer can write a governed or forbidden column';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'DELETE') then
    raise exception 'R2B-4: the item writer holds DELETE';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_menu_item_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'R2B-4: a client role holds membership of the item writer';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.menu_items', 'INSERT')
    or pg_catalog.has_table_privilege('authenticated', 'public.menu_items', 'UPDATE') then
    raise exception 'R2B-4: a client role gained direct table access to menu_items';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_menu_category_write_authority', 'public.menu_items', 'INSERT') then
    raise exception 'R2B-4: a frozen predecessor writer (R2B-3 category authority) was widened to menu_items';
  end if;
end
$$;

commit;
