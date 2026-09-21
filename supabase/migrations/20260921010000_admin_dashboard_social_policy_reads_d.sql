-- ADMIN-D: aggregate dashboard counts and canonical Social policy/catalog reads.
--
-- Dashboard admission remains `admin_context.read`; only this aggregate payload requires
-- `admin.dashboard.counts.read`. The contract reuses ADMIN-B1's sealed, column-scoped Restaurant reader.
-- Social policy reads use a separate sealed reader and expose only platform catalog metadata from
-- social_interest_catalog[_label]. Neither contract grants raw client table access or any write ability.

begin;

create role staff_admin_social_policy_reader nologin noinherit nobypassrls;
comment on role staff_admin_social_policy_reader is
  'ADMIN-D sealed Social catalog reader. Column-scoped SELECT only; owns the policy read contract; no login, client membership or write privilege.';

grant usage on schema admin_internal to staff_admin_social_policy_reader;
grant usage on schema public to staff_admin_social_policy_reader;
grant select (tag_key, namespace, parent_key, depth, selectable, display_order, active)
  on table public.social_interest_catalog to staff_admin_social_policy_reader;
grant select (tag_key, locale, label)
  on table public.social_interest_catalog_label to staff_admin_social_policy_reader;

create policy social_interest_catalog_admin_policy_reader_read
  on public.social_interest_catalog as permissive for select to staff_admin_social_policy_reader using (true);
create policy social_interest_catalog_label_admin_policy_reader_read
  on public.social_interest_catalog_label as permissive for select to staff_admin_social_policy_reader using (true);

-- The new reader may call only the frozen exact staff predicate.
grant staff_authority_context_reader to postgres with admin false, inherit false, set true;
set role staff_authority_context_reader;
grant execute on function public.staff_has_permission_v1(text) to staff_admin_social_policy_reader;
reset role;

grant create on schema admin_internal to staff_admin_social_policy_reader;
grant create on schema public to staff_admin_social_policy_reader;

create function admin_internal.staff_admin_social_policy_read_gate_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin.social.policies.read');
$$;
comment on function admin_internal.staff_admin_social_policy_read_gate_v1() is
  'ADMIN-D private gate: verified staff caller must hold admin_context.read and admin.social.policies.read; no fallback.';

create function public.staff_admin_dashboard_counts_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_result jsonb;
begin
  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.dashboard.counts.read') then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;

  select pg_catalog.jsonb_build_object(
    'state', 'ready',
    'counts', pg_catalog.jsonb_build_object(
      'restaurants', (select pg_catalog.count(*) from public.restaurants),
      'branches', (select pg_catalog.count(*) from public.restaurant_branches),
      'menus', (select pg_catalog.count(*) from public.menus),
      'menuItems', (select pg_catalog.count(*) from public.menu_items),
      'draftMenuItems', (select pg_catalog.count(*) from public.menu_items mi where mi.status = 'draft'),
      'dataQualityMenuItems', (
        select pg_catalog.count(*)
        from public.menu_items mi
        join public.menu_categories mc on mc.id = mi.menu_category_id
        join public.menus mn on mn.id = mc.menu_id
        where mn.restaurant_id <> mi.restaurant_id
          or (mi.nutrition_badge_status in ('approved', 'ai_estimated')
            and not exists (select 1 from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.is_current))
          or (select pg_catalog.count(*) from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.is_current) > 1
      ),
      'nutritionReviewPendingMenuItems', (
        select pg_catalog.count(*)
        from public.menu_items mi
        where mi.nutrition_badge_status = 'pending_review'
          or exists (select 1 from public.menu_item_nutrition n where n.menu_item_id = mi.id and n.verified_status = 'pending_review')
      )
    )
  ) into v_result;
  return v_result;
end;
$$;
comment on function public.staff_admin_dashboard_counts_v1() is
  'ADMIN-D aggregate-only operational dashboard. Exact admin.dashboard.counts.read gate; no identities, rows, filters or write ability.';

create function public.staff_admin_social_policies_v1(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_limit integer := coalesce(p_limit, 50);
  v_offset integer := coalesce(p_offset, 0);
  v_items jsonb;
  v_more boolean;
begin
  if not admin_internal.staff_admin_social_policy_read_gate_v1() then
    return pg_catalog.jsonb_build_object('state', 'forbidden');
  end if;
  if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_request');
  end if;

  select
    coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_more
  from (
    select
      pg_catalog.row_number() over (order by c.namespace collate "C", c.display_order, c.tag_key collate "C") - v_offset as ord,
      pg_catalog.jsonb_build_object(
        'tagKey', c.tag_key,
        'namespace', c.namespace,
        'parentKey', c.parent_key,
        'depth', c.depth,
        'selectable', c.selectable,
        'displayOrder', c.display_order,
        'active', c.active,
        'labels', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('locale', l.locale, 'label', l.label)
            order by l.locale collate "C"
          )
          from public.social_interest_catalog_label l
          where l.tag_key = c.tag_key
        ), '[]'::jsonb)
      ) as item
    from public.social_interest_catalog c
    order by c.namespace collate "C", c.display_order, c.tag_key collate "C"
    limit v_limit + 1 offset v_offset
  ) q;

  return pg_catalog.jsonb_build_object(
    'state', 'ready', 'items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_more
  );
end;
$$;
comment on function public.staff_admin_social_policies_v1(integer, integer) is
  'ADMIN-D bounded, deterministic, read-only projection of canonical Social interest catalog and localized labels. No user selections or Social activity.';

revoke all on function admin_internal.staff_admin_social_policy_read_gate_v1()
  from public, anon, authenticated, authenticator, service_role;
grant execute on function admin_internal.staff_admin_social_policy_read_gate_v1()
  to staff_admin_social_policy_reader;

revoke all on function public.staff_admin_dashboard_counts_v1()
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_admin_social_policies_v1(integer, integer)
  from public, anon, authenticated, authenticator, service_role;
grant execute on function public.staff_admin_dashboard_counts_v1() to authenticated;
grant execute on function public.staff_admin_social_policies_v1(integer, integer) to authenticated;

-- Settle ownership as each sealed reader, then remove every temporary CREATE / SET edge.
grant create on schema public to staff_admin_restaurant_reader;
grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;
grant staff_admin_social_policy_reader to postgres with admin false, inherit false, set true;

alter function public.staff_admin_dashboard_counts_v1() owner to staff_admin_restaurant_reader;
alter function admin_internal.staff_admin_social_policy_read_gate_v1() owner to staff_admin_social_policy_reader;
alter function public.staff_admin_social_policies_v1(integer, integer) owner to staff_admin_social_policy_reader;

revoke create on schema admin_internal from staff_admin_social_policy_reader;
revoke create on schema public from staff_admin_social_policy_reader;
revoke create on schema public from staff_admin_restaurant_reader;
revoke staff_admin_restaurant_reader from postgres granted by postgres;
revoke staff_admin_social_policy_reader from postgres granted by postgres;
revoke staff_authority_context_reader from postgres granted by postgres;

-- Fail closed on the two public contracts, the sealed Social reader and client-facing ACLs.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.proname, p.prosecdef, p.provolatile, p.proconfig, p.proacl,
      pg_catalog.pg_get_userbyid(p.proowner) as owner_name, p.prosrc
    from pg_catalog.pg_proc p
    where p.oid in (
      'public.staff_admin_dashboard_counts_v1()'::regprocedure,
      'public.staff_admin_social_policies_v1(integer,integer)'::regprocedure
    )
  loop
    if not v_fn.prosecdef or v_fn.provolatile <> 's'
      or not (v_fn.proconfig @> array['search_path=""', 'row_security=on']) then
      raise exception using errcode = '23514', message = 'd_contract_security_mismatch_' || v_fn.proname;
    end if;
    if v_fn.proname = 'staff_admin_dashboard_counts_v1' then
      if v_fn.owner_name <> 'staff_admin_restaurant_reader'
        or pg_catalog.strpos(v_fn.prosrc, 'admin.dashboard.counts.read') = 0
        or pg_catalog.strpos(v_fn.prosrc, 'admin_context.read') > 0 then
        raise exception using errcode = '23514', message = 'd_dashboard_permission_mismatch';
      end if;
    elsif v_fn.owner_name <> 'staff_admin_social_policy_reader'
      or pg_catalog.strpos(v_fn.prosrc, 'staff_admin_social_policy_read_gate_v1') = 0
      or pg_catalog.strpos(v_fn.prosrc, 'admin_context.read') > 0 then
      raise exception using errcode = '23514', message = 'd_social_permission_mismatch';
    end if;
    if pg_catalog.strpos(pg_catalog.lower(v_fn.prosrc), ' update ') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_fn.prosrc), ' insert ') > 0
      or pg_catalog.strpos(pg_catalog.lower(v_fn.prosrc), ' delete ') > 0 then
      raise exception using errcode = '23514', message = 'd_contract_not_read_only_' || v_fn.proname;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('public', 'public.staff_admin_dashboard_counts_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.staff_admin_dashboard_counts_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', 'public.staff_admin_dashboard_counts_v1()', 'EXECUTE')
    or pg_catalog.has_function_privilege('public', 'public.staff_admin_social_policies_v1(integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.staff_admin_social_policies_v1(integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', 'public.staff_admin_social_policies_v1(integer,integer)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.staff_admin_dashboard_counts_v1()', 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', 'public.staff_admin_social_policies_v1(integer,integer)', 'EXECUTE') then
    raise exception using errcode = '23514', message = 'd_contract_acl_mismatch';
  end if;

  if not (pg_catalog.has_column_privilege('staff_admin_social_policy_reader', 'public.social_interest_catalog', 'tag_key', 'SELECT')
      and pg_catalog.has_column_privilege('staff_admin_social_policy_reader', 'public.social_interest_catalog_label', 'label', 'SELECT'))
    or pg_catalog.has_table_privilege('staff_admin_social_policy_reader', 'public.social_interest_catalog', 'INSERT')
    or pg_catalog.has_table_privilege('staff_admin_social_policy_reader', 'public.social_interest_catalog_label', 'UPDATE')
    or pg_catalog.has_schema_privilege('staff_admin_social_policy_reader', 'public', 'CREATE')
    or pg_catalog.has_schema_privilege('staff_admin_social_policy_reader', 'admin_internal', 'CREATE')
    or pg_catalog.has_schema_privilege('staff_admin_restaurant_reader', 'public', 'CREATE') then
    raise exception using errcode = '23514', message = 'd_social_reader_privilege_mismatch';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.social_interest_catalog', 'SELECT')
    or pg_catalog.has_table_privilege('anon', 'public.social_interest_catalog_label', 'SELECT') then
    raise exception using errcode = '23514', message = 'd_anon_social_raw_select_present';
  end if;
  if pg_catalog.pg_has_role('postgres', 'staff_admin_social_policy_reader', 'SET')
    or pg_catalog.pg_has_role('postgres', 'staff_admin_restaurant_reader', 'SET') then
    raise exception using errcode = '23514', message = 'd_reader_role_edge_retained';
  end if;
end;
$$;

commit;
