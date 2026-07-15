-- Phase 2V-B Development validation queries.
-- READ ONLY. Future credential-backed actor sections require separate approval.
-- Do not print identifiers, Auth rows, credentials, tokens, sessions, or payloads.

-- 01_OBJECT_EXISTENCE
SELECT c.relname, c.relkind
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY c.relname;

-- 02_EXACT_COLUMNS_TYPES_NULLABILITY_DEFAULTS
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 03_CONSTRAINTS_PK_FK_UNIQUE_CHECK_AND_REFERENTIAL_ACTIONS
SELECT
  c.relname AS table_name,
  con.conname,
  con.contype,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition,
  con.confupdtype,
  con.confdeltype
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY c.relname, con.contype, con.conname;

-- 04_AUTH_USERS_FK
SELECT
  con.conname,
  source_namespace.nspname AS source_schema,
  source_table.relname AS source_table,
  target_namespace.nspname AS target_schema,
  target_table.relname AS target_table,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS source_table ON source_table.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS source_namespace ON source_namespace.oid = source_table.relnamespace
JOIN pg_catalog.pg_class AS target_table ON target_table.oid = con.confrelid
JOIN pg_catalog.pg_namespace AS target_namespace ON target_namespace.oid = target_table.relnamespace
WHERE source_namespace.nspname = 'public'
  AND source_table.relname = 'restaurant_users'
  AND target_namespace.nspname = 'auth'
  AND target_table.relname = 'users';

-- 05_INDEXES
SELECT tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY tablename, indexname;

-- 06_STATUS_AND_ROLE_CHECK_VOCABULARY
SELECT c.relname AS table_name, con.conname, pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND con.contype = 'c'
  AND c.relname IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY c.relname, con.conname;

-- 07_RLS_ENABLED_AND_FORCED
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY relname;

-- 08_SELECT_ONLY_POLICIES
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY tablename, policyname;

-- 09_TABLE_GRANTS_PUBLIC_ANON_AUTHENTICATED_AND_NO_AUTHENTICATED_WRITES
SELECT grantee, table_name, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND table_name IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  )
ORDER BY grantee, table_name, privilege_type;

SELECT
  role_name,
  table_name,
  has_table_privilege(role_name, format('public.%I', table_name), 'SELECT') AS can_select,
  has_table_privilege(role_name, format('public.%I', table_name), 'INSERT') AS can_insert,
  has_table_privilege(role_name, format('public.%I', table_name), 'UPDATE') AS can_update,
  has_table_privilege(role_name, format('public.%I', table_name), 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
CROSS JOIN (VALUES
  ('restaurant_users'),
  ('restaurant_roles'),
  ('role_permissions'),
  ('restaurant_memberships'),
  ('restaurant_membership_branch_scopes')
) AS tables(table_name)
ORDER BY role_name, table_name;

-- 10_MINIMUM_FUNCTION_OWNER_ROLE
SELECT rolname, rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb
FROM pg_catalog.pg_roles
WHERE rolname = 'restaurant_membership_context_reader';

-- The temporary postgres SET membership must be gone. PostgreSQL 17 can retain
-- its automatic creator-administration row; that row must have SET=false and
-- INHERIT=false and therefore confers no owner-role runtime privileges.
SELECT
  granted_role.rolname AS granted_role,
  member_role.rolname AS member_role,
  grantor_role.rolname AS grantor_role,
  membership.admin_option,
  membership.inherit_option,
  membership.set_option
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = membership.grantor
WHERE granted_role.rolname = 'restaurant_membership_context_reader'
  AND member_role.rolname = 'postgres'
ORDER BY grantor_role.rolname;

SELECT
  pg_catalog.pg_has_role('postgres', 'restaurant_membership_context_reader', 'USAGE') AS postgres_inherits_owner_privileges,
  pg_catalog.pg_has_role('postgres', 'restaurant_membership_context_reader', 'SET') AS postgres_can_set_owner_role;

-- Pre-deployment uniqueness check and final Option E assertion. Run before the
-- migration to confirm the existing row is unique, then repeat after deployment.
-- Every boolean must be true: omitted ADMIN preserves the original admin=true,
-- while both effective privilege paths finish disabled.
WITH membership_state AS (
  SELECT
    grantor_role.rolname AS grantor,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
  JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = membership.grantor
  WHERE granted_role.rolname = 'restaurant_membership_context_reader'
    AND member_role.rolname = 'postgres'
)
SELECT
  count(*) = 1 AS membership_row_count_is_one,
  count(*) FILTER (
    WHERE grantor = 'supabase_admin'
      AND admin_option
      AND NOT inherit_option
      AND NOT set_option
  ) = 1 AS exact_original_membership_restored,
  NOT pg_catalog.pg_has_role('postgres', 'restaurant_membership_context_reader', 'USAGE') AS no_effective_inherit_path,
  NOT pg_catalog.pg_has_role('postgres', 'restaurant_membership_context_reader', 'SET') AS no_effective_set_path
FROM membership_state;

-- 10B_DEVELOPMENT_EXCEPTION_MEMBERSHIP_VALIDATION
-- P2V-B-KI-001 / P2V-B structural exception. Production/ideal contract is the
-- strict single-row query above (membership_row_count_is_one must be true for
-- Production). Development-only accepted exception: a second row (postgres
-- grantor, all options false) was created by 020000 due to managed-grantor
-- behavior. This query validates the exact two-row Development exception.
-- Exactly these two rows and no others are accepted; any deviation fails.
WITH dev_membership AS (
  SELECT
    grantor_role.rolname AS grantor,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
  JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = membership.grantor
  WHERE granted_role.rolname = 'restaurant_membership_context_reader'
    AND member_role.rolname = 'postgres'
)
SELECT
  count(*) = 2 AS dev_exception_row_count_is_exactly_two,
  count(*) FILTER (
    WHERE grantor = 'supabase_admin'
      AND admin_option IS TRUE
      AND inherit_option IS FALSE
      AND set_option IS FALSE
  ) = 1 AS dev_authoritative_supabase_admin_row_intact,
  count(*) FILTER (
    WHERE grantor = 'postgres'
      AND admin_option IS FALSE
      AND inherit_option IS FALSE
      AND set_option IS FALSE
  ) = 1 AS dev_postgres_inert_row_exact,
  bool_and(set_option IS FALSE) AS dev_all_rows_set_false,
  bool_and(inherit_option IS FALSE) AS dev_all_rows_inherit_false,
  NOT pg_catalog.pg_has_role('postgres', 'restaurant_membership_context_reader', 'SET') AS dev_no_effective_set_path,
  NOT pg_catalog.pg_has_role('postgres', 'restaurant_membership_context_reader', 'USAGE') AS dev_no_effective_inherit_path
FROM dev_membership;

-- No broad table privilege is allowed for the custom owner.
SELECT table_schema, table_name, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE grantee = 'restaurant_membership_context_reader'
ORDER BY table_schema, table_name, privilege_type;

SELECT table_schema, table_name, column_name, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE grantee = 'restaurant_membership_context_reader'
ORDER BY table_schema, table_name, column_name, privilege_type;

SELECT
  table_name,
  has_table_privilege('restaurant_membership_context_reader', format('public.%I', table_name), 'INSERT') AS can_insert,
  has_table_privilege('restaurant_membership_context_reader', format('public.%I', table_name), 'UPDATE') AS can_update,
  has_table_privilege('restaurant_membership_context_reader', format('public.%I', table_name), 'DELETE') AS can_delete
FROM (VALUES
  ('restaurant_users'),
  ('restaurant_roles'),
  ('role_permissions'),
  ('restaurant_memberships'),
  ('restaurant_membership_branch_scopes'),
  ('restaurant_branches')
) AS tables(table_name)
ORDER BY table_name;

SELECT
  has_schema_privilege('restaurant_membership_context_reader', 'public', 'USAGE') AS public_usage,
  has_schema_privilege('restaurant_membership_context_reader', 'public', 'CREATE') AS public_create,
  has_schema_privilege('restaurant_membership_context_reader', 'auth', 'USAGE') AS auth_usage,
  has_schema_privilege('restaurant_membership_context_reader', 'auth', 'CREATE') AS auth_create;

-- PUBLIC may still confer effective auth.uid() EXECUTE, but this result set must
-- contain no explicit custom-owner grant and auth schema USAGE must remain false.
SELECT routine_schema, routine_name, privilege_type, is_grantable
FROM information_schema.routine_privileges
WHERE grantee = 'restaurant_membership_context_reader'
ORDER BY routine_schema, routine_name, privilege_type;

-- 11_FUNCTION_SECURITY_OWNER_SEARCH_PATH_AND_EXECUTE
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  owner.rolname AS owner,
  p.prosecdef AS security_definer,
  p.provolatile,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  pg_catalog.pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner ON owner.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname IN (
    'enforce_restaurant_membership_branch_scope_consistency',
    'restaurant_current_access_context_v1',
    'restaurant_has_restaurant_permission',
    'restaurant_has_branch_permission'
  )
ORDER BY p.proname, identity_arguments;

-- Exact post-corrective ACL contract: this query must return exactly three rows,
-- each grantee must be authenticated, each privilege must be EXECUTE, and each
-- grant must be non-grantable. PUBLIC and anon must be absent.
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  COALESCE(grantee.rolname, 'PUBLIC') AS grantee,
  expanded_acl.privilege_type,
  expanded_acl.is_grantable
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
) AS expanded_acl
LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = expanded_acl.grantee
WHERE n.nspname = 'public'
  AND (
    (p.proname = 'restaurant_current_access_context_v1' AND p.pronargs = 0)
    OR (p.proname = 'restaurant_has_restaurant_permission' AND p.pronargs = 2)
    OR (p.proname = 'restaurant_has_branch_permission' AND p.pronargs = 3)
  )
ORDER BY p.proname, identity_arguments, grantee, expanded_acl.privilege_type;

-- Function owner and definition/settings must remain unchanged after the ACL-only
-- corrective migration. All three rows must retain the minimum owner.
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  owner.rolname AS owner,
  p.prosecdef AS security_definer,
  p.provolatile,
  p.proconfig,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_digest
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner ON owner.oid = p.proowner
WHERE n.nspname = 'public'
  AND (
    (p.proname = 'restaurant_current_access_context_v1' AND p.pronargs = 0)
    OR (p.proname = 'restaurant_has_restaurant_permission' AND p.pronargs = 2)
    OR (p.proname = 'restaurant_has_branch_permission' AND p.pronargs = 3)
  )
ORDER BY p.proname, identity_arguments;

-- The three strict RPC definitions must derive the actor only from verified
-- PostgREST request JWT GUCs and accept no caller-supplied actor or claims.
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  POSITION('request.jwt.claim.sub' IN pg_catalog.pg_get_functiondef(p.oid)) > 0 AS has_primary_sub_claim,
  POSITION('request.jwt.claims' IN pg_catalog.pg_get_functiondef(p.oid)) > 0 AS has_legacy_claims_fallback,
  POSITION('auth.uid()' IN pg_catalog.pg_get_functiondef(p.oid)) = 0 AS has_no_auth_uid_call,
  POSITION('set_config' IN pg_catalog.pg_get_functiondef(p.oid)) = 0 AS does_not_mutate_guc
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'restaurant_current_access_context_v1',
    'restaurant_has_restaurant_permission',
    'restaurant_has_branch_permission'
  )
ORDER BY p.proname;

-- No strict RPC may have a catalog dependency on an auth-schema object.
SELECT
  dependent_proc.proname AS dependent_function,
  referenced_namespace.nspname AS referenced_schema,
  referenced_proc.proname AS referenced_function
FROM pg_catalog.pg_depend AS dependency
JOIN pg_catalog.pg_proc AS dependent_proc ON dependent_proc.oid = dependency.objid
JOIN pg_catalog.pg_namespace AS dependent_namespace ON dependent_namespace.oid = dependent_proc.pronamespace
JOIN pg_catalog.pg_proc AS referenced_proc ON referenced_proc.oid = dependency.refobjid
JOIN pg_catalog.pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced_proc.pronamespace
WHERE dependent_namespace.nspname = 'public'
  AND dependent_proc.proname IN (
    'restaurant_current_access_context_v1',
    'restaurant_has_restaurant_permission',
    'restaurant_has_branch_permission'
  )
  AND referenced_namespace.nspname = 'auth'
ORDER BY dependent_proc.proname, referenced_proc.proname;

SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  privilege.privilege_type,
  privilege.is_grantable
FROM information_schema.routine_privileges AS privilege
JOIN pg_catalog.pg_proc AS p ON p.proname = privilege.routine_name
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace AND n.nspname = privilege.routine_schema
WHERE privilege.routine_schema = 'public'
  AND privilege.grantee = 'PUBLIC'
  AND p.proname IN (
    'enforce_restaurant_membership_branch_scope_consistency',
    'restaurant_current_access_context_v1',
    'restaurant_has_restaurant_permission',
    'restaurant_has_branch_permission'
  )
ORDER BY p.proname, identity_arguments;

-- 12_ANON_DENIAL_AND_CROSS_USER_ENUMERATION_DENIAL
-- Every value must be false. Raw table denial prevents both anonymous reads and
-- authenticated enumeration of another actor's identity or membership graph.
SELECT
  has_table_privilege('anon', 'public.restaurant_users', 'SELECT') AS anon_users,
  has_table_privilege('anon', 'public.restaurant_memberships', 'SELECT') AS anon_memberships,
  has_table_privilege('authenticated', 'public.restaurant_users', 'SELECT') AS authenticated_users,
  has_table_privilege('authenticated', 'public.restaurant_memberships', 'SELECT') AS authenticated_memberships,
  has_function_privilege('anon', 'public.restaurant_current_access_context_v1()', 'EXECUTE') AS anon_context_execute;

-- 13_FUTURE_AUTHENTICATED_SELF_SCOPE_SMOKE
-- Run only in a separately approved credential-backed actor session. A non-member,
-- disabled identity, or inactive/suspended/revoked membership must return zero rows.
SELECT restaurant_id, role_key, permission_key, permission_scope, branch_id
FROM public.restaurant_current_access_context_v1();

-- 14_FUTURE_CROSS_RESTAURANT_DENIAL
-- Connection startup configuration may provide non-secret test labels later. With
-- no approved setting these expressions pass NULL and must fail closed (false).
SELECT public.restaurant_has_restaurant_permission(
  nullif(current_setting('tastkind.validation.other_restaurant_id', true), ''),
  'restaurant.read'
) AS cross_restaurant_must_be_false;

-- 15_FUTURE_CROSS_BRANCH_DENIAL
SELECT public.restaurant_has_branch_permission(
  nullif(current_setting('tastkind.validation.current_restaurant_id', true), ''),
  nullif(current_setting('tastkind.validation.other_branch_id', true), ''),
  'branch.read'
) AS cross_branch_must_be_false;

-- 16_NULL_SESSION_AND_ARGUMENT_FAIL_CLOSED
SELECT
  public.restaurant_has_restaurant_permission(NULL::text, 'restaurant.read') AS null_restaurant_false,
  public.restaurant_has_restaurant_permission(NULL::text, NULL::text) AS null_permission_false,
  public.restaurant_has_branch_permission(NULL::text, NULL::text, 'branch.read') AS null_branch_false;

-- 17_BRANCH_RESTAURANT_INTEGRITY_TRIGGER
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'restaurant_membership_branch_scopes'
ORDER BY trigger_name, event_manipulation;

-- 18_REFERENCE_ROLE_PERMISSION_CONTRACT
-- This reads only deterministic non-PII reference vocabulary under a controlled
-- catalog/operator session. Expected counts: three active roles and fourteen rows.
SELECT role_key, status FROM public.restaurant_roles ORDER BY role_key;
SELECT role.role_key, permission.permission_key, permission.permission_scope
FROM public.role_permissions AS permission
JOIN public.restaurant_roles AS role ON role.id = permission.role_id
ORDER BY role.role_key, permission.permission_key, permission.permission_scope;

-- 19_EXISTING_PUBLIC_SAFE_VIEW_REGRESSION
SELECT
  pg_catalog.to_regclass('public.restaurant_public_published_nutrition_v1') IS NOT NULL AS restaurant_public_view_exists,
  pg_catalog.to_regclass('public.consumer_public_next_meal_candidates_v1') IS NOT NULL AS consumer_candidate_view_exists,
  has_table_privilege('anon', 'public.restaurant_public_published_nutrition_v1', 'SELECT') AS restaurant_public_anon_select,
  has_table_privilege('authenticated', 'public.restaurant_public_published_nutrition_v1', 'SELECT') AS restaurant_public_authenticated_select,
  has_table_privilege('anon', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') AS consumer_candidate_anon_select,
  has_table_privilege('authenticated', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') AS consumer_candidate_authenticated_select;

-- 20_EXISTING_CONSUMER_FUNCTION_PRIVILEGE_REGRESSION
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_current_user_meal_record',
    'persist_authenticated_daily_nutrition_summary',
    'save_authenticated_planned_meal',
    'update_authenticated_planned_meal',
    'remove_authenticated_planned_meal'
  )
ORDER BY p.proname, identity_arguments;

-- 21_MIGRATION_ALIGNMENT_AFTER_SEPARATELY_APPROVED_DEPLOYMENT
-- After both split migrations succeed, expected count is 29 and latest version
-- is 20260716020000. If only 010000 succeeded, count is 28 and SET may still be
-- true; stop normal rollout and follow P2V-B-KI-001 cleanup recovery. Before
-- either deployment, Development correctly remains 27 through 20260715060000.
SELECT count(*) AS migration_count, max(version) AS latest_migration
FROM supabase_migrations.schema_migrations;

-- 22_ROLLBACK_VERIFICATION_RUN_ONLY_AFTER_APPROVED_DEVELOPMENT_ROLLBACK
SELECT count(*) AS remaining_phase_2v_b_relations
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'restaurant_users',
    'restaurant_roles',
    'role_permissions',
    'restaurant_memberships',
    'restaurant_membership_branch_scopes'
  );

SELECT count(*) AS remaining_phase_2v_b_owner_roles
FROM pg_catalog.pg_roles
WHERE rolname = 'restaurant_membership_context_reader';
