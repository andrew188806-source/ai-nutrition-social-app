begin;

-- R2E: RA-2F draft-item visibility successor repair.
--
-- THE DEFECT. restaurant_owner_branch_menu_item_display_name_write_authority (RA-2F,
-- 20260906020000) already holds column-scoped SELECT on menu_items(id, name) -- needed by its
-- preview RPC's canonical-name-fallback join -- but was never given a tenant-scoped RLS policy of
-- its own on menu_items. Its only actual row visibility therefore fell through to the baseline's
-- permissive `items_public_read_dev` policy, which requires `status = 'active'`. Before R2B this
-- was unreachable: every branch_menu_items row's underlying menu_items row was always active,
-- because only admin-seeded data existed and no INSERT capability existed at all. R2B-5 legitimately
-- allows linking a still-draft menu item to a branch, so a real, product-valid state now exists
-- where RA-2F's own join silently finds nothing and returns target_not_found for an item the caller
-- genuinely owns and administers.
--
-- THE FIX. One additive tenant-scoped SELECT policy on menu_items for the RA-2F sealed role,
-- independent of status, following the exact permissive-context-read pattern R2B-4 already
-- established for restaurant_owner_menu_item_write_authority's own reads of menus/menu_categories
-- (20260918040000, policies menus_item_authoring_context_select /
-- menu_categories_item_authoring_context_select): the tenant predicate is embedded directly in the
-- policy's own USING clause, so it needs no RESTRICTIVE pairing -- unlike RA-2F's OWN
-- branch_menu_items policies, which use `using (true)` and therefore DO need a restrictive pairing
-- to avoid being defeated by that table's baseline permissive policy (R2A/R2B hazard). This policy
-- is read-only, additive, and touches no existing object: it does not alter RA-2F's RPC bodies, its
-- branch_menu_items policies, its SET/CLEAR semantics, or any other predecessor.
--
-- RA-2F's function bodies are unmodified by this migration. Search this file: it contains no
-- `create or replace function` for either RA-2F RPC.

-- ---------------------------------------------------------------------------------------------
-- 1. One additional column grant, minimal and justified. The new policy's own USING clause must
-- compare menu_items.restaurant_id against the caller's authorized restaurant -- referencing that
-- column inside a policy expression requires SELECT privilege on it for the evaluating role, the
-- same as any other column reference. id and name (already granted, 20260906020000) are untouched;
-- nothing else is added. description/status/allergens/menu_category_id/tag_ids/nutrition_id/
-- image_url/nutrition_badge_status/badge_enabled remain ungranted, exactly as before this migration.
-- ---------------------------------------------------------------------------------------------
grant select (restaurant_id)
  on table public.menu_items
  to restaurant_owner_branch_menu_item_display_name_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 2. The tenant-scoped read policy itself. Deliberately no `status` predicate anywhere -- that is
-- the entire point of this repair. Deliberately PERMISSIVE, not RESTRICTIVE: it does not narrow an
-- existing broader grant (RA-2F's role has never had any other SELECT policy on menu_items at all
-- other than the baseline's own status='active' one), it purely ADDS a second, independently
-- tenant-scoped visibility path. Postgres ORs permissive policies together, so the effective
-- visibility for this role becomes "status='active' (baseline) OR tenant-authorized (this policy)"
-- -- ADDING coverage for the previously-invisible tenant-owned draft/archived rows, narrowing
-- nothing that was visible before.
-- ---------------------------------------------------------------------------------------------
create policy menu_items_display_name_context_select
  on public.menu_items for select to restaurant_owner_branch_menu_item_display_name_write_authority
  using (exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id
     and membership.restaurant_id = menu_items.restaurant_id
    join public.restaurant_roles as role
      on role.id = membership.role_id
    join public.role_permissions as permission
      on permission.role_id = role.id
    where caller.auth_user_id = (
        coalesce(
          nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub'
        )
      )::pg_catalog.uuid
      and caller.login_status = 'enabled' and membership.status = 'active'
      and role.status = 'active' and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.display_name.write'
      and permission.permission_scope = 'restaurant'
  ));

comment on policy menu_items_display_name_context_select on public.menu_items is
  'R2E. Read-only tenant-scoped visibility for the RA-2F sealed role, independent of menu_items.status. Reuses R2B-4''s permissive-context-read pattern. Grants no other privilege and narrows nothing.';

-- ---------------------------------------------------------------------------------------------
-- 3. Fail closed on anything this migration did not positively achieve, and on anything it must
-- NOT have done.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_permissive boolean;
  v_roles text;
  v_qual text;
begin
  -- The new policy exists.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as pol
  where pol.polrelid = 'public.menu_items'::pg_catalog.regclass
    and pol.polname = 'menu_items_display_name_context_select';
  if v_count <> 1 then
    raise exception 'R2E: menu_items_display_name_context_select policy is missing (found %)', v_count;
  end if;

  -- It is PERMISSIVE, not RESTRICTIVE.
  select pol.polpermissive into v_permissive
  from pg_catalog.pg_policy as pol
  where pol.polrelid = 'public.menu_items'::pg_catalog.regclass
    and pol.polname = 'menu_items_display_name_context_select';
  if not v_permissive then
    raise exception 'R2E: menu_items_display_name_context_select must be PERMISSIVE, not RESTRICTIVE';
  end if;

  -- It is scoped to exactly the RA-2F sealed role, no other role.
  select pg_catalog.array_agg(r.rolname)::text into v_roles
  from pg_catalog.pg_policy as pol
  join unnest(pol.polroles) as role_oid on true
  join pg_catalog.pg_roles as r on r.oid = role_oid
  where pol.polrelid = 'public.menu_items'::pg_catalog.regclass
    and pol.polname = 'menu_items_display_name_context_select';
  if v_roles is distinct from '{restaurant_owner_branch_menu_item_display_name_write_authority}' then
    raise exception 'R2E: the new policy is not scoped to exactly the RA-2F sealed role (found %)', v_roles;
  end if;

  -- The new policy's own USING expression must not reference menu_items' own status column at all
  -- -- the entire point of this repair is to stop gating visibility on the item's lifecycle state.
  -- membership.status/role.status (active-membership/active-role checks) are unrelated and expected.
  select pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) into v_qual
  from pg_catalog.pg_policy as pol
  where pol.polrelid = 'public.menu_items'::pg_catalog.regclass
    and pol.polname = 'menu_items_display_name_context_select';
  if v_qual ilike '%menu_items.status%' then
    raise exception 'R2E: the new policy must not reference menu_items.status in any form';
  end if;

  -- Column grants for the sealed role remain exactly {id, name, restaurant_id} -- nothing broader.
  if not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'id', 'SELECT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'name', 'SELECT')
    or not pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'restaurant_id', 'SELECT')
  then
    raise exception 'R2E: the sealed role lost or never gained one of its required {id,name,restaurant_id} SELECT grants';
  end if;
  if pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'description', 'SELECT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'status', 'SELECT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'allergens', 'SELECT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'menu_category_id', 'SELECT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'nutrition_badge_status', 'SELECT')
    or pg_catalog.has_column_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'badge_enabled', 'SELECT')
  then
    raise exception 'R2E: the sealed role gained a SELECT grant on menu_items beyond {id,name,restaurant_id}';
  end if;

  -- The sealed role gained no write authority on menu_items whatsoever.
  if pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'UPDATE')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'INSERT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_display_name_write_authority', 'public.menu_items', 'DELETE')
  then
    raise exception 'R2E: the sealed role gained write authority on menu_items';
  end if;

  -- Nothing else was broadened: no client role, no unrelated Restaurant Owner authority role, no
  -- other sealed role gained any new privilege on menu_items via this migration. Raw table SELECT
  -- was already revoked from anon/authenticated (20260723010000) and this migration grants nothing
  -- to either.
  if pg_catalog.has_table_privilege('anon', 'public.menu_items', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.menu_items', 'SELECT')
  then
    raise exception 'R2E: a client role gained direct table SELECT on menu_items';
  end if;
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_policy as pol
  where pol.polrelid = 'public.menu_items'::pg_catalog.regclass;
  -- Exactly 10 policies existed on menu_items before this migration (measured against Development
  -- directly): items_public_read_dev; menu_items_internal_access_permit +
  -- menu_items_internal_tenant_restrict; menu_items_linkage_context_select (R2B-5);
  -- menu_items_owner_write_select/_insert/_update (permissive) + _tenant_select/_tenant_insert/
  -- _tenant_update (restrictive) (R2B-4, 6 policies). Plus this migration's one new policy = 11. A
  -- count outside that exact figure means something else moved too.
  if v_count <> 11 then
    raise exception 'R2E: unexpected total policy count on menu_items (expected 11, found %)', v_count;
  end if;

  if pg_catalog.has_column_privilege(
      'restaurant_owner_menu_item_write_authority', 'public.menu_items', 'name', 'SELECT') = false then
    raise exception 'R2E: an unrelated predecessor role''s existing grant was disturbed';
  end if;
  if pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_write_authority', 'public.menu_items', 'SELECT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_price_write_authority', 'public.menu_items', 'SELECT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_availability_write_authority', 'public.menu_items', 'SELECT')
    or pg_catalog.has_table_privilege(
      'restaurant_owner_branch_menu_item_visibility_write_authority', 'public.menu_items', 'SELECT')
  then
    raise exception 'R2E: a frozen sibling RA-2 field-write role was widened to read menu_items';
  end if;
end
$$;

commit;
