# Phase 2V-B Migration Contract

Status: **Both migrations deployed to Development; remote=29; Phase 2V-B FROZEN**

## Migration Versions

- `20260715050000_create_restaurant_membership_foundation.sql` successfully established the membership foundation in Development and is now an immutable deployed artifact.
- `20260715060000_fix_restaurant_membership_rpc_execute_grants.sql` was deployed in attempt 3 and is now immutable. Because its ACL statements did not execute in owner context, warnings left the three ACLs unchanged even though temporary membership cleanup succeeded.
- Attempt 4 of `20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql` failed at its final membership `REVOKE` with SQLSTATE `XX000` and rolled back completely. It remains local-only and may be revised in place.
- Attempt 5's explicit ADMIN request failed with SQLSTATE `0LP01`. Attempt 6 omitted ADMIN but same-transaction SET restoration after role switching failed with SQLSTATE `XX000`. Both transactions rolled back completely.
- Revised `20260716010000` performs only SET=true and the owner-context ACL correction.
- New `20260716020000_restore_restaurant_membership_context_reader_set_option.sql` restores SET=false in a fresh transaction with no role-switch history.
- Development remote history is now 29 through `20260716020000`. Both `20260716010000` and `20260716020000` were deployed in a single `supabase db push` without retry.
- No rollback, migration-history repair, rewrite of either deployed migration, or unversioned ACL hotfix is permitted. Phase 2V-B cannot Freeze before the owner-context corrective migration and remote validation succeed.

## Exact Objects

The deployed foundation migration creates five tables, five ordinary indexes, one trigger function and trigger, three read functions, and one dedicated function-owner database role. It creates no view, enum, sequence, employee object, invitation object, write RPC, owner/internal projection, Admin object, Social object, or N4 cleanup. The corrective migration creates no object and changes no function definition or owner.

### `public.restaurant_users`

| Column | Type | Null | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` |
| `auth_user_id` | `uuid` | no | none |
| `login_status` | `text` | no | `enabled` |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |

- PK: `id`.
- Unique: `auth_user_id`.
- FK: `auth_user_id → auth.users(id)`, update restrict, delete cascade.
- CHECK: login status is `enabled` or `disabled`.

### `public.restaurant_roles`

| Column | Type | Null | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | no | none; deterministic reference UUID |
| `role_key` | `text` | no | none |
| `display_name` | `text` | no | none |
| `status` | `text` | no | `active` |
| `created_at` | `timestamptz` | no | `now()` |

- PK: `id`.
- Unique: `role_key`.
- CHECK: role key is `owner`, `manager`, or `staff`.
- CHECK: status is `active` or `inactive`.

### `public.role_permissions`

| Column | Type | Null | Default |
| --- | --- | --- | --- |
| `role_id` | `uuid` | no | none |
| `permission_key` | `text` | no | none |
| `permission_scope` | `text` | no | none |
| `created_at` | `timestamptz` | no | `now()` |

- Composite PK: `(role_id, permission_key, permission_scope)`.
- FK: `role_id → restaurant_roles(id)`, update restrict, delete cascade.
- Permission CHECK: `access_context.read`, `restaurant.read`, `branch.read`, `menu.read`, or `nutrition.read`.
- Scope CHECK: `self`, `restaurant`, or `branch`.

### `public.restaurant_memberships`

| Column | Type | Null | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` |
| `restaurant_user_id` | `uuid` | no | none |
| `restaurant_id` | `text` | no | none |
| `role_id` | `uuid` | no | none |
| `status` | `text` | no | `active` |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |

- PK: `id`.
- Unique: `(restaurant_user_id, restaurant_id)`; competing membership rows for one user/restaurant are structurally impossible.
- FK: `restaurant_user_id → restaurant_users(id)`, update restrict, delete cascade.
- FK: text `restaurant_id → restaurants(id)`, update restrict, delete cascade.
- FK: `role_id → restaurant_roles(id)`, update restrict, delete restrict.
- CHECK: status is `active`, `inactive`, `suspended`, or `revoked`.
- Indexes: `(restaurant_id, status)`, `(restaurant_user_id, status)`, and `(role_id)`.

### `public.restaurant_membership_branch_scopes`

| Column | Type | Null | Default |
| --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` |
| `membership_id` | `uuid` | no | none |
| `branch_id` | `text` | no | none |
| `status` | `text` | no | `active` |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |

- PK: `id`.
- Unique: `(membership_id, branch_id)`.
- FK: `membership_id → restaurant_memberships(id)`, update restrict, delete cascade.
- FK: text `branch_id → restaurant_branches(id)`, update restrict, delete cascade.
- CHECK: status is `active`, `inactive`, `suspended`, or `revoked`.
- Indexes: `(membership_id, status)` and `(branch_id, status)`.
- Trigger: every insert or membership/branch update must resolve the branch to the same restaurant as the membership; mismatch raises SQLSTATE `23514`.

## Deterministic Role / Permission Vocabulary

Stable role UUIDs end in `0001` owner, `0002` manager, and `0003` staff. Reference insertion is idempotent on role key and the permission composite PK.

| Role | Permission | Scope |
| --- | --- | --- |
| owner | `access_context.read` | self |
| owner | `restaurant.read` | restaurant |
| owner | `branch.read` | restaurant |
| owner | `menu.read` | restaurant |
| owner | `nutrition.read` | restaurant |
| manager | `access_context.read` | self |
| manager | `restaurant.read` | restaurant |
| manager | `branch.read` | branch |
| manager | `menu.read` | branch |
| manager | `nutrition.read` | branch |
| staff | `access_context.read` | self |
| staff | `branch.read` | branch |
| staff | `menu.read` | branch |
| staff | `nutrition.read` | branch |

Owner branch permissions apply only to branches whose audited `restaurant_branches.restaurant_id` matches the membership restaurant. Manager and staff branch permissions additionally require an active matching branch-scope row. No permission grants a cross-restaurant path.

## RLS Policies

All five tables have both RLS enabled and RLS forced. Exactly one SELECT policy exists per table. There are no INSERT, UPDATE, DELETE, or ALL policies.

Every policy derives the request actor with the same verified PostgREST expression as the RPCs: non-empty `request.jwt.claim.sub`, otherwise JSON `request.jwt.claims ->> 'sub'`, then UUID conversion. Missing claims fail closed and invalid non-empty identity text is not caught.

- `restaurant_users_self_active_select`: current Auth UID's enabled identity only.
- `restaurant_memberships_self_active_select`: current enabled identity's active memberships only.
- `restaurant_roles_self_active_select`: active roles referenced by the current actor's active memberships only.
- `role_permissions_self_active_select`: permissions attached to those active roles only.
- `restaurant_membership_branch_scopes_self_active_select`: active current-actor scopes whose branch matches the membership restaurant only.

Policies are declared to `PUBLIC` so forced RLS also applies consistently while the controlled definer owner evaluates the strict RPCs. A policy does not confer table privilege. Direct `PUBLIC`, `anon`, and `authenticated` table privileges are all revoked, so the browser cannot enumerate these rows.

## Functions and Privileges

### `restaurant_membership_context_reader`

- Database role attributes: `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`; it is not granted to a browser role.
- Owns only the three strict read RPCs.
- Receives schema usage on `public` only and column-level SELECT limited to the fields used by the RPC definitions.
- Existing `restaurant_branches` access is limited to `id` and `restaurant_id`; new-table access excludes timestamps, display name, and every unused column.
- Temporarily receives `CREATE` on `public` only while PostgreSQL transfers function ownership; the migration revokes that privilege before commit.
- Receives no managed `auth` schema privilege and no explicit `auth.uid()` function privilege.
- Final privileges do not include login, role inheritance, RLS bypass, schema create, table write, broad table SELECT, or ownership of a table.

### Temporary PostgreSQL 17 owner-transfer membership

The audited pre-deployment state was exactly one membership row from `restaurant_membership_context_reader` to `postgres`, granted by `supabase_admin`, with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`. No duplicate role/member/grantor triple is asserted, and no database-platform interception mechanism is treated as proven.

### Ideal / Production membership contract

Exactly one row: grantor=supabase_admin, admin=true, inherit=false, set=false.

### Development accepted exception (P2V-B-KI-001)

The two-migration split creates a second row due to managed-grantor behavior. Post-deployment Development state: oid=18850 (supabase_admin, admin=true, inherit=false, set=false) and oid=18859 (postgres, admin=false, inherit=false, set=false). Both rows have set=false. `pg_has_role('postgres','restaurant_membership_context_reader','SET')=false` and `pg_has_role('postgres','restaurant_membership_context_reader','USAGE')=false` confirm no effective privilege path. This two-row outcome is a Development-only accepted structural exception; the Production hard gate requires re-evaluation before any Production rollout. Exactly these two rows and no others are accepted; any third row or any option enabled fails validation.

The ACL migration executes a `GRANT` option update with only `INHERIT FALSE, SET TRUE`, enters the owner with exactly `SET LOCAL ROLE restaurant_membership_context_reader`, applies the three ACL corrections, executes exactly `SET LOCAL ROLE NONE`, and commits. It contains no SET=false cleanup.

The cleanup migration starts a new transaction and executes only `GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET FALSE`, then commits. It contains no role switch, ADMIN option, `GRANTED BY`, membership revoke, function ACL, function definition, table, RLS, data, Auth, or runtime operation.

Both migrations omit ADMIN completely and preserve the existing row and grantor. Neither contains membership `REVOKE` or membership-row recreation. The transaction-local role-switch exception applies only to `010000`.

Options A through D remain rejected for the documented membership and grantor risks. Attempt 6 shows that omitted ADMIN alone does not permit SET restoration after role switching in the same transaction. The split accepts a strictly temporary SET=true interval for the `postgres` deployment role between versioned migrations, never as a final state. `P2V-B-KI-001` defines the recovery and Production review gates.

PostgreSQL 17's automatic creator-administration relationship can remain catalog-visible with `ADMIN TRUE`, `SET FALSE`, and `INHERIT FALSE`. It cannot confer owner-role privileges or permit `SET ROLE`. Post-deployment validation must prove there is no residual row with `SET` or `INHERIT` enabled.

### `enforce_restaurant_membership_branch_scope_consistency()`

- Trigger-only, `SECURITY INVOKER`, fixed empty `search_path`.
- No dynamic SQL.
- Execute revoked from `PUBLIC`, `anon`, and `authenticated`.
- Reason: data integrity should execute with the future controlled writer's rights and must not be a browser-callable oracle.

### `restaurant_current_access_context_v1()`

- Returns only `(restaurant_id text, role_key text, permission_key text, permission_scope text, branch_id text)`.
- No arguments and no caller identity input.
- Stable, read-only SQL, `SECURITY DEFINER`, fixed empty `search_path`, `row_security=on`.
- Actor derivation reads `request.jwt.claim.sub`, falling back to the `sub` field of `request.jwt.claims` JSON, then converts the result to UUID.
- Empty or missing request claims return zero rows. Invalid non-empty identity text raises and is not hidden.
- No caller actor ID or claims parameter exists; PostgREST verified-request context is the sole actor source.
- The deployed `20260716010000` (owner-context corrective) successfully entered owner context via `SET LOCAL ROLE`, revoked all execute privilege from `PUBLIC`, `anon`, and `authenticated`, and granted exact explicit `EXECUTE` only to `authenticated`. The ACL defect from attempts 2 and 3 is resolved.
- Post-deployment ACL: `{restaurant_membership_context_reader=X/restaurant_membership_context_reader, authenticated=X/restaurant_membership_context_reader}`. PUBLIC and anon are absent. Authenticated is explicit and non-grantable.

### `restaurant_has_restaurant_permission(text, text)`

- Caller-provided restaurant and permission values are requested filters only.
- Returns true only for current enabled identity, active membership/role, matching restaurant, and restaurant-scoped permission.
- Null request actor or arguments return false; invalid non-empty actor identity is not caught or hidden.
- Stable, read-only SQL, hardened definer settings and exact execute ACL as above.

### `restaurant_has_branch_permission(text, text, text)`

- Verifies requested branch belongs to requested/membership restaurant.
- Restaurant-scoped role permission permits same-restaurant branches; branch-scoped permission also requires an active exact assignment.
- Null request actor or arguments, wrong restaurant, wrong branch, inactive lifecycle, or absent permission returns false.
- Stable, read-only SQL, hardened definer settings and exact execute ACL as above.

`SECURITY DEFINER` is necessary for these three strict read RPCs because authenticated actors have no raw-table SELECT privilege. A security-invoker view/RPC would require broad raw-table grants and defeat the anti-enumeration boundary. The deployed owner is the minimum-privilege `restaurant_membership_context_reader` role and must never be changed to `PUBLIC`, `anon`, `authenticated`, a login role, or an RLS-bypass role. Neither the RPC definitions nor the supporting RLS policies depend on `auth.uid()` or another `auth` schema object.

## Auth Deletion Fail-Closed Behavior

Deleting an Auth account cascades to its restaurant identity. That cascade deletes its memberships and branch scopes. No membership survives without its identity mapping, and the unique Auth FK prevents a second identity row from automatically acquiring the deleted account's authority. Disabled identities remain stored but all policies and helpers deny them.

## Deployed Foundation and Corrective Preconditions

Deployment attempt 1 failed with SQLSTATE `42501` and rolled back. Attempt 2 deployed the foundation, and Attempt 3 deployed `20260715060000`, bringing Development to 27 without repairing the ACL. Attempts 4, 5, and 6 rolled back completely. Attempt 7 (the two-migration split) deployed both `20260716010000` and `20260716020000` in a single `supabase db push`, advancing remote to 29. RPC ACL is corrected and final-state assertions are confirmed. Phase 2V-B is frozen. See P2V-B-KI-001 for the Development-only two-row membership exception and the Production hard gate.

The owner-context corrective migration directly names the owner role and all three exact function signatures. If any prerequisite is absent or incompatible, PostgreSQL must fail the transaction rather than silently skip the security correction. It contains no `IF EXISTS`, `IF NOT EXISTS`, function replacement, ownership transfer, or function setting change. Both deployed migration files must never be edited, formatted, or rewritten.

## Explicit Non-Goals

No existing restaurant/menu/nutrition row, ID, table definition, public policy, view, function definition, or unrelated grant changes. No `restaurant_employees`, employee assignments, invitations, staff management, Restaurant Web write RPC, owner/internal projection, aggregate metrics access, Admin, Social, N4, runtime code, deployment from this task, or Production operation.
