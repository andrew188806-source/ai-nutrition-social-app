begin;

-- R2B-1: DB-level tenant-consistency enforcement for the redundant restaurant_id paths R2A
-- identified. public.menu_items and public.branch_menu_items each carry a DIRECT restaurant_id FK
-- alongside a TRANSITIVE tenant chain (menu_items via menu_category_id -> menu_categories.menu_id
-- -> menus.restaurant_id; branch_menu_items via branch_id -> restaurant_branches.restaurant_id AND
-- via menu_item_id -> menu_items.restaurant_id), and until this migration nothing required the two
-- paths to agree. This migration is a relational-invariant guard only. It grants no authority, reads
-- no JWT, and makes no authorization decision -- that remains exclusively RPC/RLS responsibility,
-- established in the R2B-2..R2B-5 migrations that follow it.

-- ---------------------------------------------------------------------------------------------
-- 1. Existing-data precheck. This is a read-only evidence gate: if any row already on this
-- database violates the invariant this migration is about to start enforcing, the migration fails
-- closed and reports exact counts, rather than silently reinterpreting or repairing that data. A
-- fresh bootstrap (the baseline's "empty database" path) has zero rows and always passes trivially.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_bad_menu_items integer;
  v_bad_branch_menu_items integer;
begin
  select pg_catalog.count(*) into v_bad_menu_items
  from public.menu_items as item
  join public.menu_categories as category on category.id = item.menu_category_id
  join public.menus as menu on menu.id = category.menu_id
  where item.restaurant_id is distinct from menu.restaurant_id;

  if v_bad_menu_items > 0 then
    raise exception
      'R2B-1 PRECHECK: % existing menu_items row(s) have restaurant_id inconsistent with their menu_category/menu chain. STOP: do not repair automatically; report this count and let the operator decide.',
      v_bad_menu_items;
  end if;

  select pg_catalog.count(*) into v_bad_branch_menu_items
  from public.branch_menu_items as bmi
  join public.restaurant_branches as branch on branch.id = bmi.branch_id
  join public.menu_items as item on item.id = bmi.menu_item_id
  where bmi.restaurant_id is distinct from branch.restaurant_id
     or bmi.restaurant_id is distinct from item.restaurant_id;

  if v_bad_branch_menu_items > 0 then
    raise exception
      'R2B-1 PRECHECK: % existing branch_menu_items row(s) have restaurant_id inconsistent with their branch or menu_item chain. STOP: do not repair automatically; report this count and let the operator decide.',
      v_bad_branch_menu_items;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. menu_items: restaurant_id must equal menu_category_id -> menu_categories.menu_id ->
-- menus.restaurant_id.
--
-- SECURITY DEFINER so the invariant holds for every writer of this table, not only ones the
-- migration author happened to grant SELECT on menu_categories/menus to -- this is a relational
-- invariant, not an authorization decision, so it must not depend on the caller's own privileges.
-- Owned by the migration-executing role (already the owner of menu_categories and menus), so it
-- always has full read access to the parent chain regardless of who is performing the write.
-- search_path is pinned empty and every identifier is schema-qualified, so it cannot be redirected
-- by a hostile search_path. It never trusts NEW.restaurant_id as anything but the value under test,
-- and it fails closed (raises) if the referenced menu_category cannot be resolved at all.
-- ---------------------------------------------------------------------------------------------
create function restaurant_internal.enforce_menu_item_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_restaurant_id text;
begin
  select menu.restaurant_id
  into v_expected_restaurant_id
  from public.menu_categories as category
  join public.menus as menu on menu.id = category.menu_id
  where category.id = new.menu_category_id;

  if not found then
    raise exception
      'R2B-1: menu_items.menu_category_id % does not resolve to an existing menu_category/menu chain',
      new.menu_category_id;
  end if;

  if new.restaurant_id is distinct from v_expected_restaurant_id then
    raise exception
      'R2B-1: menu_items.restaurant_id must equal the parent menu''s restaurant_id (menu_category_id=%, expected=%, actual=%)',
      new.menu_category_id, v_expected_restaurant_id, new.restaurant_id;
  end if;

  return new;
end;
$$;

comment on function restaurant_internal.enforce_menu_item_tenant_consistency() is
  'R2B-1 relational invariant only: menu_items.restaurant_id must equal its menu_category/menu chain''s restaurant_id. Grants no authority and reads no JWT.';

create trigger menu_items_tenant_consistency_trigger
  before insert or update of restaurant_id, menu_category_id on public.menu_items
  for each row execute function restaurant_internal.enforce_menu_item_tenant_consistency();

revoke all on function restaurant_internal.enforce_menu_item_tenant_consistency()
  from public, anon, authenticated, authenticator, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. branch_menu_items: restaurant_id must equal BOTH branch_id -> restaurant_branches.restaurant_id
-- AND menu_item_id -> menu_items.restaurant_id. Same SECURITY DEFINER / fail-closed shape as above.
-- ---------------------------------------------------------------------------------------------
create function restaurant_internal.enforce_branch_menu_item_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_restaurant_id text;
  v_item_restaurant_id text;
begin
  select branch.restaurant_id
  into v_branch_restaurant_id
  from public.restaurant_branches as branch
  where branch.id = new.branch_id;

  if not found then
    raise exception
      'R2B-1: branch_menu_items.branch_id % does not resolve to an existing restaurant_branches row',
      new.branch_id;
  end if;

  select item.restaurant_id
  into v_item_restaurant_id
  from public.menu_items as item
  where item.id = new.menu_item_id;

  if not found then
    raise exception
      'R2B-1: branch_menu_items.menu_item_id % does not resolve to an existing menu_items row',
      new.menu_item_id;
  end if;

  if new.restaurant_id is distinct from v_branch_restaurant_id
    or new.restaurant_id is distinct from v_item_restaurant_id
  then
    raise exception
      'R2B-1: branch_menu_items.restaurant_id must equal both the branch''s and the menu item''s restaurant_id (branch=%, item=%, actual=%)',
      v_branch_restaurant_id, v_item_restaurant_id, new.restaurant_id;
  end if;

  return new;
end;
$$;

comment on function restaurant_internal.enforce_branch_menu_item_tenant_consistency() is
  'R2B-1 relational invariant only: branch_menu_items.restaurant_id must equal both its branch''s and its menu_item''s restaurant_id. Grants no authority and reads no JWT.';

create trigger branch_menu_items_tenant_consistency_trigger
  before insert or update of restaurant_id, branch_id, menu_item_id on public.branch_menu_items
  for each row execute function restaurant_internal.enforce_branch_menu_item_tenant_consistency();

revoke all on function restaurant_internal.enforce_branch_menu_item_tenant_consistency()
  from public, anon, authenticated, authenticator, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Fail closed on anything this migration did not positively achieve.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = 'public.menu_items'::pg_catalog.regclass
    and trigger_row.tgname = 'menu_items_tenant_consistency_trigger'
    and trigger_row.tgenabled <> 'D';
  if v_count <> 1 then
    raise exception 'R2B-1: the menu_items tenant-consistency trigger is missing or disabled';
  end if;

  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_trigger as trigger_row
  where trigger_row.tgrelid = 'public.branch_menu_items'::pg_catalog.regclass
    and trigger_row.tgname = 'branch_menu_items_tenant_consistency_trigger'
    and trigger_row.tgenabled <> 'D';
  if v_count <> 1 then
    raise exception 'R2B-1: the branch_menu_items tenant-consistency trigger is missing or disabled';
  end if;

  -- Both trigger functions must be SECURITY DEFINER with search_path pinned empty, so the
  -- invariant is enforced regardless of the writer's own grants and cannot be redirected.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as space on space.oid = proc.pronamespace
  where space.nspname = 'restaurant_internal'
    and proc.proname in ('enforce_menu_item_tenant_consistency', 'enforce_branch_menu_item_tenant_consistency')
    and proc.prosecdef = true
    and proc.proconfig is not null
    and exists (
      select 1 from pg_catalog.unnest(proc.proconfig) as setting(value)
      where setting.value like 'search_path=%'
    );
  if v_count <> 2 then
    raise exception 'R2B-1: a tenant-consistency trigger function is not SECURITY DEFINER with search_path pinned empty';
  end if;

  -- No client role may execute the trigger functions directly (triggers fire internally; direct
  -- EXECUTE is never a legitimate call shape for either function).
  if pg_catalog.has_function_privilege('anon',
       'restaurant_internal.enforce_menu_item_tenant_consistency()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
       'restaurant_internal.enforce_menu_item_tenant_consistency()', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon',
       'restaurant_internal.enforce_branch_menu_item_tenant_consistency()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated',
       'restaurant_internal.enforce_branch_menu_item_tenant_consistency()', 'EXECUTE') then
    raise exception 'R2B-1: a client role can directly execute a tenant-consistency trigger function';
  end if;

  -- Re-confirm the invariant holds immediately after enforcement is installed (trivially true on a
  -- fresh bootstrap; this assertion exists so the same migration self-checks against a non-empty
  -- registration-mode database too).
  select pg_catalog.count(*) into v_count
  from public.menu_items as item
  join public.menu_categories as category on category.id = item.menu_category_id
  join public.menus as menu on menu.id = category.menu_id
  where item.restaurant_id is distinct from menu.restaurant_id;
  if v_count <> 0 then
    raise exception 'R2B-1: menu_items tenant invariant does not hold immediately after enforcement (%)', v_count;
  end if;

  select pg_catalog.count(*) into v_count
  from public.branch_menu_items as bmi
  join public.restaurant_branches as branch on branch.id = bmi.branch_id
  join public.menu_items as item on item.id = bmi.menu_item_id
  where bmi.restaurant_id is distinct from branch.restaurant_id
     or bmi.restaurant_id is distinct from item.restaurant_id;
  if v_count <> 0 then
    raise exception 'R2B-1: branch_menu_items tenant invariant does not hold immediately after enforcement (%)', v_count;
  end if;
end
$$;

commit;
