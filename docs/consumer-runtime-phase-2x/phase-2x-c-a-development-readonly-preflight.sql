-- Phase 2X-C-B operator-run Development catalog preflight.
-- READ ONLY: every statement is SELECT. Do not run against Production.
-- Run only after separately confirming project name tastkind-development and
-- project ref msbgnnoorsoefuiwluye in the approved operator environment.
-- Before deployment, separately confirm remote history exactly matches the 34
-- pre-candidate migrations and does not already record version 20260718010000.
-- Catalog-equivalent ACLs do not authorize a permanent skip while the migration
-- remains Frozen locally: deploy the retained version, or verify matching
-- version/content/checksum when remote already records it.

select
  current_database() as database_name,
  current_user as inspecting_role,
  pg_catalog.current_setting('server_version') as server_version;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('favorite_restaurants', 'favorite_menu_items')
  and c.relkind in ('r', 'p')
order by c.relname;

select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns as c
where c.table_schema = 'public'
  and c.table_name in ('favorite_restaurants', 'favorite_menu_items')
order by c.table_name, c.ordinal_position;

select
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual,
  p.with_check
from pg_catalog.pg_policies as p
where p.schemaname = 'public'
  and p.tablename in ('favorite_restaurants', 'favorite_menu_items')
order by p.tablename, p.policyname;

select
  role_name,
  table_name,
  pg_catalog.has_table_privilege(role_name, 'public.' || table_name, 'SELECT') as can_select,
  pg_catalog.has_table_privilege(role_name, 'public.' || table_name, 'INSERT') as can_insert,
  pg_catalog.has_table_privilege(role_name, 'public.' || table_name, 'UPDATE') as can_update,
  pg_catalog.has_table_privilege(role_name, 'public.' || table_name, 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) as roles(role_name)
cross join (values ('favorite_restaurants'), ('favorite_menu_items')) as tables(table_name)
order by role_name, table_name;

select
  g.grantor,
  g.grantee,
  g.table_name,
  g.privilege_type,
  g.is_grantable
from information_schema.role_table_grants as g
where g.table_schema = 'public'
  and g.table_name in ('favorite_restaurants', 'favorite_menu_items')
order by g.table_name, g.grantee, g.privilege_type;

select
  pg_catalog.pg_get_userbyid(d.defaclrole) as owner,
  coalesce(n.nspname, '') as schema_name,
  d.defaclobjtype as object_type,
  d.defaclacl::text as default_acl
from pg_catalog.pg_default_acl as d
left join pg_catalog.pg_namespace as n on n.oid = d.defaclnamespace
where n.nspname = 'public' or d.defaclnamespace = 0
order by owner, schema_name, object_type;

select
  i.tablename,
  i.indexname,
  i.indexdef
from pg_catalog.pg_indexes as i
where i.schemaname = 'public'
  and i.tablename in ('favorite_restaurants', 'favorite_menu_items', 'menu_items')
order by i.tablename, i.indexname;

select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind as object_kind
from pg_catalog.pg_class as c
join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname ilike '%favorite%'
order by c.relkind, c.relname;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname ilike '%favorite%'
order by p.proname, identity_arguments;

select
  count(*)::bigint as favorite_restaurant_row_count
from public.favorite_restaurants;

select
  count(*)::bigint as favorite_menu_item_row_count
from public.favorite_menu_items;

select
  count(*)::bigint as duplicate_menu_item_id_group_count
from (
  select mi.id
  from public.menu_items as mi
  group by mi.id
  having count(*) > 1
) as duplicate_ids;

select
  count(*)::bigint as cross_restaurant_favorite_menu_item_group_count
from (
  select fmi.menu_item_id
  from public.favorite_menu_items as fmi
  group by fmi.menu_item_id
  having count(distinct fmi.restaurant_id) > 1
) as conflicting_parents;

select
  count(*)::bigint as favorite_menu_item_parent_mismatch_count
from public.favorite_menu_items as fmi
left join public.menu_items as mi
  on mi.id = fmi.menu_item_id
 and mi.restaurant_id = fmi.restaurant_id
where mi.id is null;

select
  count(*)::bigint as favorite_restaurant_target_mismatch_count
from public.favorite_restaurants as fr
left join public.restaurants as r on r.id = fr.restaurant_id
where r.id is null;
