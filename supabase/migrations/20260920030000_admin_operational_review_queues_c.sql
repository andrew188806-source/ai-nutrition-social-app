-- ADMIN-C: Platform Admin operational READ-ONLY review queues.
--
-- Four purpose-built, read-only contracts for the four accepted ADMIN-C routes. Each is a SECURITY DEFINER function
-- owned by the EXISTING sealed ADMIN-B1 reader role (no new role, no new table/column/policy grant: the reader already
-- holds column-scoped SELECT on every column used here), checks the staff caller's EXACT ADMIN-AE1 read key FIRST
-- through the B1 private gate (which also requires the base staff admission) and returns `forbidden` otherwise. There
-- is no fallback and no umbrella key: each queue is independently grantable.
--
-- Queue definitions (derived ONLY from existing canonical lifecycle / review / consistency columns; nothing is invented):
--   overview   menu-management                admin.restaurants.menu_management.read
--              platform totals of menu / menu-item lifecycle status groups + a paged per-Restaurant catalogue summary.
--   pending    menu-management-pending        admin.restaurants.menu_management.pending.read
--              menu items whose lifecycle status is 'draft' (created, not yet active).  reason: item_status_draft
--   quality    menu-management-data-quality   admin.restaurants.menu_management.data_quality.read
--              menu items that violate an objective linkage/projection invariant that the schema guards on write
--              (blank names are already impossible: menu_items_name_check). reasons (any combination):
--                menu_belongs_to_other_restaurant   the item's menu belongs to a different Restaurant than the item
--                badge_without_current_nutrition    badge status approved/ai_estimated but no current nutrition record
--                multiple_current_nutrition         more than one nutrition record flagged is_current
--   cert       nutrition-certification-pending admin.nutrition.certification.pending.read
--              menu items whose nutrition review state is 'pending_review'. reasons (any combination):
--                badge_pending_review               menu_items.nutrition_badge_status = 'pending_review'
--                nutrition_record_pending_review    a menu_item_nutrition record has verified_status = 'pending_review'
--
-- Read-only boundary: STABLE functions, no write verb, no client table privilege, no approve/reject/certify capability.
-- Lists take p_limit (default 20, 1..50) and p_offset (default 0, 0..10000); out-of-range values are REJECTED
-- (invalid_request), never clamped. Every list orders by a total order (no invented priority) and returns
-- {items, limit, offset, hasMore}. Rows carry identifiers, names, the lifecycle/review fact and explicit reasons only.

begin;

grant create on schema public to staff_admin_restaurant_reader;

-- 1. Overview -- admin.restaurants.menu_management.read
create function public.staff_admin_menu_management_overview_v1(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_totals jsonb;
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select pg_catalog.jsonb_build_object(
    'restaurantCount', (select pg_catalog.count(*) from public.restaurants),
    'menusByStatus', (select pg_catalog.jsonb_build_object(
      'draft', pg_catalog.count(*) filter (where mn.status = 'draft'),
      'published', pg_catalog.count(*) filter (where mn.status = 'published'),
      'archived', pg_catalog.count(*) filter (where mn.status = 'archived')) from public.menus mn),
    'itemsByStatus', (select pg_catalog.jsonb_build_object(
      'draft', pg_catalog.count(*) filter (where mi.status = 'draft'),
      'active', pg_catalog.count(*) filter (where mi.status = 'active'),
      'archived', pg_catalog.count(*) filter (where mi.status = 'archived')) from public.menu_items mi))
  into v_totals;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by r.name collate "C", r.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object(
        'restaurantId', r.id, 'name', r.name, 'status', r.status,
        'menuCount', (select pg_catalog.count(*) from public.menus mn where mn.restaurant_id = r.id),
        'draftMenuCount', (select pg_catalog.count(*) from public.menus mn where mn.restaurant_id = r.id and mn.status = 'draft'),
        'publishedMenuCount', (select pg_catalog.count(*) from public.menus mn where mn.restaurant_id = r.id and mn.status = 'published'),
        'archivedMenuCount', (select pg_catalog.count(*) from public.menus mn where mn.restaurant_id = r.id and mn.status = 'archived'),
        'itemCount', (select pg_catalog.count(*) from public.menu_items mi where mi.restaurant_id = r.id),
        'draftItemCount', (select pg_catalog.count(*) from public.menu_items mi where mi.restaurant_id = r.id and mi.status = 'draft'),
        'activeItemCount', (select pg_catalog.count(*) from public.menu_items mi where mi.restaurant_id = r.id and mi.status = 'active'),
        'archivedItemCount', (select pg_catalog.count(*) from public.menu_items mi where mi.restaurant_id = r.id and mi.status = 'archived')
      ) as item
    from public.restaurants r
    order by r.name collate "C", r.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'totals', v_totals, 'items', v_items,
    'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 2. Pending (draft menu items) -- admin.restaurants.menu_management.pending.read
create function public.staff_admin_menu_management_pending_v1(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.pending.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by r.name collate "C", r.id collate "C", mn.name collate "C", mn.id collate "C",
        mi.name collate "C", mi.id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object(
        'menuItemId', mi.id, 'name', mi.name, 'itemStatus', mi.status,
        'restaurantId', mi.restaurant_id, 'restaurantName', r.name,
        'menuId', mn.id, 'menuName', mn.name, 'menuStatus', mn.status, 'menuRestaurantId', mn.restaurant_id,
        'categoryName', c.name,
        'reasons', pg_catalog.jsonb_build_array('item_status_draft')) as item
    from public.menu_items mi
    join public.menu_categories c on c.id = mi.menu_category_id
    join public.menus mn on mn.id = c.menu_id
    join public.restaurants r on r.id = mi.restaurant_id
    where mi.status = 'draft'
    order by r.name collate "C", r.id collate "C", mn.name collate "C", mn.id collate "C", mi.name collate "C", mi.id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 3. Data quality (objective invariants) -- admin.restaurants.menu_management.data_quality.read
create function public.staff_admin_menu_management_data_quality_v1(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.data_quality.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by f.restaurant_name collate "C", f.restaurant_id collate "C", f.menu_name collate "C",
        f.menu_id collate "C", f.item_name collate "C", f.item_id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object(
        'menuItemId', f.item_id, 'name', f.item_name, 'itemStatus', f.item_status,
        'restaurantId', f.restaurant_id, 'restaurantName', f.restaurant_name,
        'menuId', f.menu_id, 'menuName', f.menu_name, 'menuStatus', f.menu_status, 'menuRestaurantId', f.menu_restaurant_id,
        'categoryName', f.category_name,
        'reasons', pg_catalog.to_jsonb(f.reasons)) as item
    from (
      select mi.id as item_id, mi.name as item_name, mi.status as item_status, mi.restaurant_id as restaurant_id, r.name as restaurant_name,
        mn.id as menu_id, mn.name as menu_name, mn.status as menu_status, mn.restaurant_id as menu_restaurant_id, c.name as category_name,
        pg_catalog.array_remove(array[
          case when mn.restaurant_id <> mi.restaurant_id then 'menu_belongs_to_other_restaurant' end,
          case when mi.nutrition_badge_status in ('approved', 'ai_estimated')
            and not exists (select 1 from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.is_current)
            then 'badge_without_current_nutrition' end,
          case when (select pg_catalog.count(*) from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.is_current) > 1
            then 'multiple_current_nutrition' end
        ], null::text) as reasons
      from public.menu_items mi
      join public.menu_categories c on c.id = mi.menu_category_id
      join public.menus mn on mn.id = c.menu_id
      join public.restaurants r on r.id = mi.restaurant_id
    ) f
    where pg_catalog.cardinality(f.reasons) > 0
    order by f.restaurant_name collate "C", f.restaurant_id collate "C", f.menu_name collate "C", f.menu_id collate "C",
      f.item_name collate "C", f.item_id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- 4. Nutrition certification pending (existing review state only) -- admin.nutrition.certification.pending.read
create function public.staff_admin_nutrition_certification_pending_v1(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 20);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.nutrition.certification.pending.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;
  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select pg_catalog.row_number() over (order by f.restaurant_name collate "C", f.restaurant_id collate "C", f.menu_name collate "C",
        f.menu_id collate "C", f.item_name collate "C", f.item_id collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object(
        'menuItemId', f.item_id, 'name', f.item_name, 'itemStatus', f.item_status,
        'restaurantId', f.restaurant_id, 'restaurantName', f.restaurant_name,
        'menuId', f.menu_id, 'menuName', f.menu_name, 'menuStatus', f.menu_status, 'menuRestaurantId', f.menu_restaurant_id,
        'categoryName', f.category_name,
        'nutritionBadgeStatus', f.badge_status,
        'pendingRecordCount', f.pending_record_count,
        'latestPendingRecordAt', f.latest_pending_at,
        'latestPendingRecordSource', f.latest_pending_source,
        'reasons', pg_catalog.to_jsonb(pg_catalog.array_remove(array[
          case when f.badge_status = 'pending_review' then 'badge_pending_review' end,
          case when f.pending_record_count > 0 then 'nutrition_record_pending_review' end
        ], null::text))) as item
    from (
      select mi.id as item_id, mi.name as item_name, mi.status as item_status, mi.restaurant_id as restaurant_id, r.name as restaurant_name,
        mn.id as menu_id, mn.name as menu_name, mn.status as menu_status, mn.restaurant_id as menu_restaurant_id, c.name as category_name,
        mi.nutrition_badge_status as badge_status,
        (select pg_catalog.count(*) from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.verified_status = 'pending_review') as pending_record_count,
        (select pg_catalog.max(n.updated_at) from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.verified_status = 'pending_review') as latest_pending_at,
        (select n.source from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.verified_status = 'pending_review'
          order by n.updated_at desc, n.id collate "C" limit 1) as latest_pending_source
      from public.menu_items mi
      join public.menu_categories c on c.id = mi.menu_category_id
      join public.menus mn on mn.id = c.menu_id
      join public.restaurants r on r.id = mi.restaurant_id
    ) f
    where f.badge_status = 'pending_review' or f.pending_record_count > 0
    order by f.restaurant_name collate "C", f.restaurant_id collate "C", f.menu_name collate "C", f.menu_id collate "C",
      f.item_name collate "C", f.item_id collate "C"
    limit v_limit + 1 offset v_offset
  ) q;
  return pg_catalog.jsonb_build_object('state', 'ready', 'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Comments, ACLs (settled BEFORE the ownership transfer), ownership
-- ---------------------------------------------------------------------------------------------------------------
comment on function public.staff_admin_menu_management_overview_v1(integer, integer) is 'ADMIN-C menu-management overview: platform menu/item lifecycle totals + paged per-Restaurant catalogue summary. Requires the base staff admission + admin.restaurants.menu_management.read. Read-only.';
comment on function public.staff_admin_menu_management_pending_v1(integer, integer) is 'ADMIN-C pending queue: menu items whose lifecycle status is draft. Requires the base staff admission + admin.restaurants.menu_management.pending.read. Read-only.';
comment on function public.staff_admin_menu_management_data_quality_v1(integer, integer) is 'ADMIN-C data-quality queue: menu items violating an objective schema/projection invariant (explicit reasons). Requires the base staff admission + admin.restaurants.menu_management.data_quality.read. Read-only.';
comment on function public.staff_admin_nutrition_certification_pending_v1(integer, integer) is 'ADMIN-C nutrition certification pending queue: menu items whose nutrition review state is pending_review. Requires the base staff admission + admin.nutrition.certification.pending.read. Read-only.';

revoke all on function
  public.staff_admin_menu_management_overview_v1(integer, integer),
  public.staff_admin_menu_management_pending_v1(integer, integer),
  public.staff_admin_menu_management_data_quality_v1(integer, integer),
  public.staff_admin_nutrition_certification_pending_v1(integer, integer)
from public, anon, authenticated, authenticator, service_role, staff_admin_restaurant_reader;

grant execute on function
  public.staff_admin_menu_management_overview_v1(integer, integer),
  public.staff_admin_menu_management_pending_v1(integer, integer),
  public.staff_admin_menu_management_data_quality_v1(integer, integer),
  public.staff_admin_nutrition_certification_pending_v1(integer, integer)
to authenticated;

grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;

alter function public.staff_admin_menu_management_overview_v1(integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_menu_management_pending_v1(integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_menu_management_data_quality_v1(integer, integer) owner to staff_admin_restaurant_reader;
alter function public.staff_admin_nutrition_certification_pending_v1(integer, integer) owner to staff_admin_restaurant_reader;

revoke create on schema public from staff_admin_restaurant_reader;
revoke staff_admin_restaurant_reader from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------------------------
-- Fail-closed postconditions: exact object set, security mode, ACL, ownership, permission mapping, read-only, and
-- that the sealed reader gained NO privilege in this migration (its privilege set is exactly B1's).
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare
  v_expected constant jsonb := '{
    "staff_admin_menu_management_overview_v1": "admin.restaurants.menu_management.read",
    "staff_admin_menu_management_pending_v1": "admin.restaurants.menu_management.pending.read",
    "staff_admin_menu_management_data_quality_v1": "admin.restaurants.menu_management.data_quality.read",
    "staff_admin_nutrition_certification_pending_v1": "admin.nutrition.certification.pending.read"}'::jsonb;
  v_fn record;
  v_seen integer := 0;
  v_owner constant text := 'staff_admin_restaurant_reader';
begin
  for v_fn in
    select p.oid, p.proname, p.prosecdef, p.provolatile, p.proconfig, p.prosrc, pg_catalog.pg_get_userbyid(p.proowner) as owner_name
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'staff\_admin\_menu\_management\_%' escape '\' or p.proname like 'staff\_admin\_nutrition\_certification\_%' escape '\')
  loop
    v_seen := v_seen + 1;
    if not (v_expected ? v_fn.proname) then raise exception using errcode = '23514', message = 'c_unexpected_contract_' || v_fn.proname; end if;
    if not v_fn.prosecdef or v_fn.provolatile <> 's' or v_fn.owner_name <> v_owner
      or not (v_fn.proconfig @> array['search_path=""', 'row_security=on']) then
      raise exception using errcode = '23514', message = 'c_contract_mode_mismatch_' || v_fn.proname;
    end if;
    -- exact permission mapping: the body checks its one key through the private gate, first, with no fallback.
    if pg_catalog.strpos(v_fn.prosrc, 'staff_admin_restaurant_read_gate_v1(''' || (v_expected ->> v_fn.proname) || ''')') = 0
      or pg_catalog.strpos(v_fn.prosrc, 'admin_context.read') > 0
      or pg_catalog.strpos(v_fn.prosrc, 'staff_has_permission_v1') > 0
      or (pg_catalog.length(v_fn.prosrc) - pg_catalog.length(pg_catalog.replace(v_fn.prosrc, 'staff_admin_restaurant_read_gate_v1(', ''))) <> pg_catalog.length('staff_admin_restaurant_read_gate_v1(') then
      raise exception using errcode = '23514', message = 'c_contract_permission_mismatch_' || v_fn.proname;
    end if;
    -- read-only: no write verb anywhere in the body.
    if v_fn.prosrc ~* '(^|[^a-z_])(insert|update|delete|truncate|merge|alter|drop|create|grant|revoke)[[:space:]]' then
      raise exception using errcode = '23514', message = 'c_contract_not_read_only_' || v_fn.proname;
    end if;
    -- bounded: the shared limit/offset bounds are present and no unbounded result is possible.
    if pg_catalog.strpos(v_fn.prosrc, 'v_limit not between 1 and 50 or v_offset not between 0 and 10000') = 0
      or pg_catalog.strpos(v_fn.prosrc, 'limit v_limit + 1 offset v_offset') = 0 then
      raise exception using errcode = '23514', message = 'c_contract_unbounded_' || v_fn.proname;
    end if;
    if exists (select 1 from pg_catalog.aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_fn.oid), '{}'::aclitem[])) a where a.grantee = 0)
      or pg_catalog.has_function_privilege('anon', v_fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('service_role', v_fn.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticator', v_fn.oid, 'EXECUTE')
      or not pg_catalog.has_function_privilege('authenticated', v_fn.oid, 'EXECUTE') then
      raise exception using errcode = '23514', message = 'c_contract_acl_mismatch_' || v_fn.proname;
    end if;
    if (select pg_catalog.count(*) from pg_catalog.aclexplode((select proacl from pg_catalog.pg_proc where oid = v_fn.oid)) a) <> 2 then
      raise exception using errcode = '23514', message = 'c_contract_acl_extra_grantee_' || v_fn.proname;
    end if;
  end loop;
  if v_seen <> 4 then raise exception using errcode = '23514', message = 'c_contract_count_mismatch'; end if;

  -- the sealed reader is unchanged: no login/inherit/bypass, SELECT-only, no retained membership edge.
  if exists (select 1 from pg_catalog.pg_roles where rolname = v_owner and (rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb))
    or exists (select 1 from pg_catalog.pg_auth_members m where m.member = (select oid from pg_catalog.pg_roles where rolname = v_owner))
    or exists (select 1 from pg_catalog.pg_auth_members m where m.roleid = (select oid from pg_catalog.pg_roles where rolname = v_owner)
      and m.member <> (select oid from pg_catalog.pg_roles where rolname = 'postgres'))
    or pg_catalog.pg_has_role('postgres', v_owner, 'SET') then
    raise exception using errcode = '23514', message = 'c_reader_role_mismatch';
  end if;
  if exists (select 1 from information_schema.role_table_grants g where g.grantee = v_owner and g.privilege_type <> 'SELECT')
    or exists (select 1 from information_schema.column_privileges g where g.grantee = v_owner and g.privilege_type <> 'SELECT') then
    raise exception using errcode = '23514', message = 'c_reader_non_select_privilege';
  end if;
  if pg_catalog.has_schema_privilege(v_owner, 'public', 'CREATE') or pg_catalog.has_schema_privilege(v_owner, 'admin_internal', 'CREATE') then
    raise exception using errcode = '23514', message = 'c_reader_create_privilege_retained';
  end if;
  -- no client-role table privilege was added to any operational table.
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('restaurant_memberships', 'restaurant_roles', 'restaurant_branch_temporal_state')
      and (pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT'))
  ) then
    raise exception using errcode = '23514', message = 'c_client_table_grant_present';
  end if;
end;
$$;

commit;
