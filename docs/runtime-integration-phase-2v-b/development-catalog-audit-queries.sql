-- Phase 2V-B Development catalog audit.
-- Catalog metadata only. Execute section-by-section under the reviewed runbook.

BEGIN TRANSACTION READ ONLY;

-- SECTION 01: AUDIT_CONTEXT
-- Purpose: prove the database transaction is read-only without printing connection details.
SELECT
  current_setting('transaction_read_only') AS transaction_read_only,
  current_setting('server_version_num') AS server_version_num;

-- SECTION 02: OBJECT_EXISTENCE_AND_TYPE
-- Purpose: inventory exact target relations without assuming any object exists.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition'),
    ('current_published_menu_item_nutrition'),
    ('restaurant_public_published_nutrition_v1'),
    ('consumer_public_next_meal_candidates_v1'),
    ('restaurant_staff_access_scope'),
    ('restaurant_public_view'),
    ('published_menus_view'),
    ('published_branch_menu_items_view'),
    ('published_branch_menu_items'),
    ('restaurant_exposure_summary'),
    ('nutrition_badge_performance'),
    ('menu_item_performance')
)
SELECT
  t.object_name,
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  pg_catalog.pg_get_userbyid(c.relowner) AS relation_owner,
  c.relpersistence AS persistence,
  c.relrowsecurity AS row_security_enabled,
  c.relforcerowsecurity AS row_security_forced
FROM target_objects t
LEFT JOIN pg_catalog.pg_class c
  ON c.relname = t.object_name
LEFT JOIN pg_catalog.pg_namespace n
  ON n.oid = c.relnamespace
 AND n.nspname = 'public'
ORDER BY t.object_name, n.nspname NULLS LAST;

-- SECTION 03: COLUMN_METADATA
-- Purpose: inspect types, nullability, defaults, identity and generated metadata.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition'),
    ('current_published_menu_item_nutrition'),
    ('restaurant_public_published_nutrition_v1'),
    ('consumer_public_next_meal_candidates_v1'),
    ('restaurant_staff_access_scope')
)
SELECT
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation,
  c.is_generated,
  c.generation_expression
FROM information_schema.columns c
JOIN target_objects t ON t.object_name = c.table_name
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- SECTION 04: CONSTRAINTS
-- Purpose: inspect primary, foreign, unique and check constraints plus reference actions.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition')
)
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition,
  rn.nspname AS referenced_schema,
  rc.relname AS referenced_relation,
  con.confupdtype AS update_action_code,
  con.confdeltype AS delete_action_code,
  con.condeferrable AS deferrable,
  con.condeferred AS initially_deferred,
  con.convalidated AS validated
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN target_objects t ON t.object_name = c.relname
LEFT JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, con.contype, con.conname;

-- SECTION 05: INDEXES
-- Purpose: inspect index identity, uniqueness, validity, predicates and definitions.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition')
)
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS table_name,
  idx.relname AS index_name,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  i.indisvalid AS is_valid,
  i.indisready AS is_ready,
  pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicate,
  pg_catalog.pg_get_indexdef(i.indexrelid) AS index_definition
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class tbl ON tbl.oid = i.indrelid
JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
JOIN pg_catalog.pg_namespace ns ON ns.oid = tbl.relnamespace
JOIN target_objects t ON t.object_name = tbl.relname
WHERE ns.nspname = 'public'
ORDER BY tbl.relname, idx.relname;

-- SECTION 06: RLS_FLAGS
-- Purpose: inspect row-security enablement and forced status for target tables.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition')
)
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS row_security_enabled,
  c.relforcerowsecurity AS row_security_forced,
  pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN target_objects t ON t.object_name = c.relname
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- SECTION 07: RLS_POLICIES
-- Purpose: inspect policy roles, commands, qualification and check expressions.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition')
)
SELECT
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual AS using_expression,
  p.with_check AS check_expression
FROM pg_catalog.pg_policies p
JOIN target_objects t ON t.object_name = p.tablename
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.policyname;

-- SECTION 08: TABLE_AND_VIEW_GRANTS
-- Purpose: inspect client and public privileges on target relations.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments'),
    ('menus'),
    ('menu_categories'),
    ('menu_items'),
    ('branch_menu_items'),
    ('menu_item_nutrition'),
    ('current_published_menu_item_nutrition'),
    ('restaurant_public_published_nutrition_v1'),
    ('consumer_public_next_meal_candidates_v1'),
    ('restaurant_staff_access_scope'),
    ('restaurant_public_view'),
    ('published_menus_view'),
    ('published_branch_menu_items_view'),
    ('published_branch_menu_items'),
    ('restaurant_exposure_summary'),
    ('nutrition_badge_performance'),
    ('menu_item_performance')
)
SELECT
  g.table_schema,
  g.table_name,
  g.grantee,
  g.privilege_type,
  g.is_grantable
FROM information_schema.table_privileges g
JOIN target_objects t ON t.object_name = g.table_name
WHERE g.table_schema = 'public'
  AND g.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY g.table_name, g.grantee, g.privilege_type;

-- SECTION 09: RELEVANT_ROLE_METADATA
-- Purpose: inspect non-secret flags for runtime/database roles named by the contract.
SELECT
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin,
  r.rolreplication,
  r.rolbypassrls
FROM pg_catalog.pg_roles r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'authenticator')
ORDER BY r.rolname;

-- SECTION 10: VIEW_INVENTORY
-- Purpose: discover public, owner/internal, staff, restaurant and analytics projections.
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.relkind AS relation_kind,
  pg_catalog.pg_get_userbyid(c.relowner) AS view_owner,
  c.reloptions AS relation_options,
  c.relrowsecurity AS row_security_enabled,
  c.relforcerowsecurity AS row_security_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
  AND (
    c.relname ILIKE '%restaurant%'
    OR c.relname ILIKE '%menu%'
    OR c.relname ILIKE '%nutrition%'
    OR c.relname ILIKE '%branch%'
    OR c.relname ILIKE '%staff%'
    OR c.relname ILIKE '%membership%'
  )
ORDER BY c.relname;

-- SECTION 11: VIEW_DEFINITIONS_AND_SECURITY
-- Purpose: inspect exact relevant definitions, owners and security options.
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.relkind AS relation_kind,
  pg_catalog.pg_get_userbyid(c.relowner) AS view_owner,
  c.reloptions AS relation_options,
  pg_catalog.pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
  AND (
    c.relname ILIKE '%restaurant%'
    OR c.relname ILIKE '%menu%'
    OR c.relname ILIKE '%nutrition%'
    OR c.relname ILIKE '%branch%'
    OR c.relname ILIKE '%staff%'
    OR c.relname ILIKE '%membership%'
  )
ORDER BY c.relname;

-- SECTION 12: VIEW_DEPENDENCIES
-- Purpose: inspect relevant view rewrite dependencies before later projection or grant work.
SELECT DISTINCT
  vn.nspname AS view_schema,
  vc.relname AS view_name,
  dn.nspname AS dependency_schema,
  dc.relname AS dependency_name,
  dc.relkind AS dependency_kind
FROM pg_catalog.pg_rewrite rw
JOIN pg_catalog.pg_class vc ON vc.oid = rw.ev_class
JOIN pg_catalog.pg_namespace vn ON vn.oid = vc.relnamespace
JOIN pg_catalog.pg_depend dep ON dep.objid = rw.oid
JOIN pg_catalog.pg_class dc ON dc.oid = dep.refobjid
JOIN pg_catalog.pg_namespace dn ON dn.oid = dc.relnamespace
WHERE vn.nspname = 'public'
  AND vc.relkind IN ('v', 'm')
  AND (
    vc.relname ILIKE '%restaurant%'
    OR vc.relname ILIKE '%menu%'
    OR vc.relname ILIKE '%nutrition%'
    OR vc.relname ILIKE '%branch%'
    OR vc.relname ILIKE '%staff%'
    OR vc.relname ILIKE '%membership%'
  )
ORDER BY vc.relname, dn.nspname, dc.relname;

-- SECTION 13: FUNCTION_INVENTORY
-- Purpose: discover restaurant, membership and branch-scope functions without invoking them.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language_name,
  pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.prokind AS function_kind,
  p.proconfig AS function_configuration,
  p.proacl AS access_control_list
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%restaurant%'
    OR p.proname ILIKE '%membership%'
    OR p.proname ILIKE '%branch_scope%'
    OR p.proname ILIKE '%staff_scope%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%auth.uid()%'
  )
ORDER BY p.proname, identity_arguments;

-- SECTION 14: FUNCTION_DEFINITIONS_AND_SECURITY
-- Purpose: inspect relevant function bodies and configuration without executing target functions.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_configuration,
  pg_catalog.pg_get_functiondef(p.oid) AS function_definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%restaurant%'
    OR p.proname ILIKE '%membership%'
    OR p.proname ILIKE '%branch_scope%'
    OR p.proname ILIKE '%staff_scope%'
    OR pg_catalog.pg_get_functiondef(p.oid) ILIKE '%auth.uid()%'
  )
ORDER BY p.proname, identity_arguments;

-- SECTION 15: FUNCTION_EXECUTE_PRIVILEGES
-- Purpose: inspect routine privileges for relevant functions and client/public roles.
SELECT
  rp.routine_schema,
  rp.routine_name,
  rp.specific_name,
  rp.grantee,
  rp.privilege_type,
  rp.is_grantable
FROM information_schema.routine_privileges rp
WHERE rp.routine_schema = 'public'
  AND rp.grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  AND (
    rp.routine_name ILIKE '%restaurant%'
    OR rp.routine_name ILIKE '%membership%'
    OR rp.routine_name ILIKE '%branch_scope%'
    OR rp.routine_name ILIKE '%staff_scope%'
  )
ORDER BY rp.routine_name, rp.specific_name, rp.grantee;

-- SECTION 16: ENUM_AND_STATUS_VOCABULARIES
-- Purpose: inspect enum labels used by membership, role, employee and tenant objects.
SELECT
  n.nspname AS schema_name,
  t.typname AS enum_name,
  e.enumsortorder,
  e.enumlabel
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND (
    t.typname ILIKE '%restaurant%'
    OR t.typname ILIKE '%member%'
    OR t.typname ILIKE '%employee%'
    OR t.typname ILIKE '%user%status%'
    OR t.typname ILIKE '%access%scope%'
    OR t.typname ILIKE '%branch%status%'
  )
ORDER BY t.typname, e.enumsortorder;

-- SECTION 17: TARGET_COLUMN_ENUM_USAGE
-- Purpose: map target columns to enum/domain types without reading table rows.
WITH target_objects(object_name) AS (
  VALUES
    ('restaurants'),
    ('restaurant_branches'),
    ('restaurant_users'),
    ('restaurant_memberships'),
    ('restaurant_roles'),
    ('role_permissions'),
    ('restaurant_employees'),
    ('employee_branch_assignments'),
    ('employee_role_assignments')
)
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name
FROM information_schema.columns c
JOIN target_objects t ON t.object_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.data_type IN ('USER-DEFINED', 'ARRAY')
ORDER BY c.table_name, c.ordinal_position;

-- SECTION 18: MIGRATION_METADATA_DISCOVERY
-- Purpose: discover safe migration metadata objects without assuming or querying their rows.
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  pg_catalog.pg_get_userbyid(c.relowner) AS relation_owner,
  c.relrowsecurity AS row_security_enabled,
  c.relforcerowsecurity AS row_security_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'supabase_migrations'
  AND c.relname = 'schema_migrations'
ORDER BY c.relname;

-- SECTION 19: NO_WRITE_PROOF
-- Purpose: reconfirm read-only transaction state after all catalog inspection sections.
SELECT
  current_setting('transaction_read_only') AS transaction_read_only_after_audit,
  current_setting('server_version_num') AS server_version_num_after_audit;

ROLLBACK;
