# Phase 2V-B Foundation and RPC ACL Corrective Migration Plan

Status: **Attempt 6 rolled back; two-migration ACL and membership cleanup split is local-only**

Local repository inventory for this split is exactly 29 migrations, latest `20260716020000`, with exactly 15 approved untracked Phase 2V-B files.

Formal phase:

**TastKind Runtime Integration Phase 2V-B — Restaurant Membership Foundation & DB Tenant Isolation**

Canonical frozen authorities:

- [`../tastkind-runtime-integration-roadmap.md`](../tastkind-runtime-integration-roadmap.md)
- [`../runtime-integration-phase-2v/implementation-plan.md`](../runtime-integration-phase-2v/implementation-plan.md)
- [`../runtime-integration-phase-2v/tenant-authorization-contract.md`](../runtime-integration-phase-2v/tenant-authorization-contract.md)
- [`../runtime-integration-phase-2v/read-surface-contract.md`](../runtime-integration-phase-2v/read-surface-contract.md)
- [`../runtime-integration-phase-2v/validation-and-rollout-plan.md`](../runtime-integration-phase-2v/validation-and-rollout-plan.md)

## 1. Entry Evidence and Decision

The approved read-only Development catalog audit is complete. Supplied evidence confirms:

- the correct Development project was inspected without a write;
- local and remote migration histories were 25/25 and aligned through `20260715040000` before and after the audit;
- all proposed membership, role, branch-assignment, tenant-helper, and owner/internal projection objects are absent;
- existing restaurant, branch, menu, item, and nutrition PK/FK types are text while Auth identity remains UUID;
- existing public restaurant tables retain public SELECT RLS and several raw client SELECT grants;
- raw/internal nutrition direct client SELECT is already revoked and public-safe views remain functional;
- `restaurant_consumer_aggregate_metrics` grant state is unknown and is deferred to the 2V-C entry gate;
- Production was not contacted.

ChatGPT returned **GO for local Phase 2V-B migration drafting**. The human instruction then explicitly authorized the original local draft, guard, contract smoke, documentation, and local validation task.

### Development deployment attempt 1 evidence

A separately operated Development deployment attempt failed atomically with `SQLSTATE 42501: permission denied for schema auth` when the migration tried to re-grant managed `auth` schema access. The transaction fully rolled back. Remote migration history remains 25 through `20260715040000`; all five membership tables, the custom owner role, and all four new functions remain absent. Production was untouched.

The non-secret privilege audit established that the deployment role `postgres` is `NOSUPERUSER`, `CREATEROLE`, and `BYPASSRLS`; `auth` is owned by `supabase_admin`, has no `PUBLIC` usage, and gives `postgres` usage without grant option. `auth.uid()` is a `SECURITY INVOKER` function owned by `supabase_auth_admin` with `PUBLIC EXECUTE`, but a custom owner role cannot resolve it without `auth` schema usage. The corrected draft therefore removes every managed-auth re-grant and every `auth.uid()` dependency.

ChatGPT approved that first corrective local patch only. A separately operated Development deployment attempt 2 subsequently deployed `20260715050000_create_restaurant_membership_foundation.sql` successfully. Development migration history is now 26 through `20260715050000`, and the five membership tables, dedicated owner role, trigger function, and three strict read RPCs exist. Production remained untouched.

### Development deployment attempt 2 ACL finding

Post-deployment catalog validation found that the three strict read RPCs still expose effective `PUBLIC EXECUTE`; `anon` therefore inherits execute through `PUBLIC`, and `authenticated` does not have the intended explicit-only boundary. The original ACL statements ran after ownership transfer and after the temporary SET membership had been revoked. Claude stopped before credential-backed live smoke, rollback, staging, commit, or push.

The approved resolution was versioned corrective migration `20260715060000_fix_restaurant_membership_rpc_execute_grants.sql`. There was no rollback, migration-history repair, or unversioned remote ACL hotfix. The deployed `20260715050000` file remained byte-for-byte unchanged.

### Development deployment attempt 3 ACL finding

A separately operated Development attempt 3 deployed `20260715060000` successfully, bringing remote history to 27. Its temporary SET membership was cleaned up correctly: the remaining creator relationship is admin-only with `SET FALSE` and `INHERIT FALSE`. However, the ACL statements executed as `postgres` without an actual role switch, produced warnings, and did not change the owner-controlled function ACLs. All three RPCs still have effective `PUBLIC EXECUTE`, and `authenticated` still lacks the required explicit execute grant. Claude stopped before live smoke, rollback, staging, commit, or push. Production remained untouched.

Both `20260715050000` and `20260715060000` are immutable deployed artifacts. The local-only `20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql` was submitted in Development attempt 4, but its final membership `REVOKE` failed with SQLSTATE `XX000`; the transaction rolled back completely. Remote history remains 27 through `20260715060000`, and the RPC ACL defect remains. No live smoke ran.

The follow-up catalog audit proves there is exactly one relevant membership row: granted role `restaurant_membership_context_reader`, member `postgres`, grantor `supabase_admin`, `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE`. There is no evidence of two rows with the same role/member/grantor triple, and this plan does not present any Supabase interception mechanism as established fact.

Options A, B, and C remain rejected: A depends on an invalid self-admin assumption; B risks deleting the existing creator relationship; C would preserve a cross-transaction SET path. Attempt 5 then tried Option D, but its first `GRANT ... WITH ADMIN TRUE` failed with SQLSTATE `0LP01`; the transaction rolled back completely and remote remains 27. This establishes that explicitly requesting ADMIN true triggers the own-grantor restriction. ADMIN false is also rejected because a specified option may update the existing admin option.

Attempt 6 used omitted ADMIN options, but restoring SET in the same transaction after `SET LOCAL ROLE` still failed with SQLSTATE `XX000`; the transaction rolled back completely. Remote remains 27, `010000` remains local-only, and the RPC ACL defect remains.

The approved resolution is now a two-migration split. `010000` performs only temporary SET=true plus the owner-context ACL correction and commits after `SET LOCAL ROLE NONE`. New migration `20260716020000_restore_restaurant_membership_context_reader_set_option.sql` starts a fresh transaction with no role-switch history and restores `INHERIT FALSE, SET FALSE`. Neither migration specifies ADMIN, uses `GRANTED BY`, or revokes membership. The interval between successful migrations may leave SET=true for the `postgres` deployment role only; it grants no browser privilege and is never an acceptable final state. Phase 2V-B cannot Freeze until `020000` succeeds and validation proves SET=false. Phase 2V-C and N4 remain blocked.

## 2. Frozen Authorization Chain

Phase 2V-B implements this chain without reopening it:

`auth.users.id → restaurant_users.auth_user_id → active restaurant_memberships → optional active branch assignments → DB-enforced read scope`

Authentication identifies the actor. An enabled restaurant identity, active membership, active role, required active branch scope, and matching permission establish authority. Client-provided restaurant or branch IDs are filters intersected with database authority; they never establish authority.

## 3. Fixed Migration Design

The deployed foundation migration is:

`20260715050000_create_restaurant_membership_foundation.sql`

It is immutable after successful Development deployment. Its SHA-256 is locked by the local guard and offline smoke.

It creates exactly:

- `restaurant_users` as the unique UUID Auth bridge;
- `restaurant_roles` with deterministic owner/manager/staff reference rows;
- `role_permissions` with deterministic permission/scope rows;
- `restaurant_memberships` using the existing text restaurant ID;
- `restaurant_membership_branch_scopes` using the existing text branch ID;
- indexes for FK and authorization lookups;
- a dedicated no-login, no-inherit, no-bypass-RLS function-owner role with column-minimum reads;
- a same-restaurant branch-consistency trigger boundary;
- RLS and minimum grants for all new tables;
- a fixed-column current-access-context RPC;
- restaurant-level and branch-level permission helper RPCs.

Existing restaurant-domain IDs remain text. Internal membership-domain primary keys and `auth_user_id` are UUID. No existing PK/FK conversion, row mutation, view mutation, policy mutation, or raw grant cleanup is allowed.

The first corrective migration, now deployed and immutable, is:

`20260715060000_fix_restaurant_membership_rpc_execute_grants.sql`

It intended to change only the three execute ACLs, but the deployment did not enter owner context, so PostgreSQL warnings left those ACLs unchanged. Its temporary membership was nevertheless revoked correctly.

The second local corrective migration is:

`20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql`

Within one explicit transaction `010000` updates only `INHERIT FALSE, SET TRUE`, enters the function owner with exactly one `SET LOCAL ROLE restaurant_membership_context_reader`, applies the exact three ACL resets, returns with exactly one `SET LOCAL ROLE NONE`, and commits. It does not contain SET=false cleanup or membership revoke. This is the only approved role-switch exception.

The cleanup migration is:

`20260716020000_restore_restaurant_membership_context_reader_set_option.sql`

It contains a separate `BEGIN`/`COMMIT` and exactly one membership option update: `INHERIT FALSE, SET FALSE`. It has no role switch, ADMIN option, `GRANTED BY`, membership revoke, ACL operation, function operation, table/data/RLS/view/Auth operation, or runtime dependency.

## 4. Lifecycle and Uniqueness

- Restaurant login status is `enabled` or `disabled`.
- Role status is `active` or `inactive`.
- Membership and branch-scope status is `active`, `inactive`, `suspended`, or `revoked`.
- Only enabled identities, active memberships, active roles, and active required branch scopes authorize reads.
- One Auth UID maps to exactly one restaurant identity row.
- One restaurant user has at most one membership row per restaurant; a future controlled operator changes its role/status rather than creating competing active rows.
- Auth deletion cascades through identity, membership, and branch scopes so authority cannot be orphaned or reassigned by another login.

## 5. Role and Permission Mapping

The migration owns one deterministic reference mapping:

| Role | Permissions |
| --- | --- |
| owner | self access context; restaurant-wide restaurant, branch, menu, and nutrition read |
| manager | self access context; restaurant identity read; assigned-branch branch, menu, and nutrition read |
| staff | self access context; assigned-branch branch, menu, and nutrition read |

Unknown, inactive, absent, or malformed roles/permissions grant nothing. These rows are reference data only; no real user, restaurant, membership, or branch fixture is created.

## 6. Branch Integrity

The branch-scope table has FKs to membership and branch. Because the audited existing `restaurant_branches` table has a text primary key but no approved composite `(id, restaurant_id)` contract, the migration does not alter that frozen table to manufacture a composite FK. Instead, a `SECURITY INVOKER` trigger checks that the referenced branch's restaurant equals the referenced membership's restaurant and raises a check-violation error on mismatch.

The trigger uses no dynamic SQL and does not create a browser write path. Any future authorized membership-management path must run under a separately reviewed server/operator role capable of satisfying this invariant; that work is not part of Phase 2V-B.

## 7. RLS, Grants, and RPC Boundary

All five new tables enable and force RLS. Their SELECT policies derive the current actor from Supabase PostgREST's verified request context: `request.jwt.claim.sub` first, then the legacy `request.jwt.claims` JSON `sub`. Empty or missing claims produce null and fail closed; a malformed non-empty authenticated identity raises during UUID conversion instead of being hidden. No INSERT, UPDATE, or DELETE policy exists.

`PUBLIC`, `anon`, and `authenticated` receive no direct table privilege. The policies remain defense in depth and support controlled database-side evaluation; they are not a raw browser read surface.

The three browser-facing read functions use `SECURITY DEFINER` only because a security-invoker projection would require direct authenticated privileges on sensitive membership tables and would defeat column anti-enumeration. Each function:

- is read-only and stable;
- derives identity only from verified request JWT GUCs and accepts no caller user ID or claims;
- handles null sessions and null requested IDs by returning zero rows or false;
- has a fixed empty `search_path` and schema-qualified references;
- forces row security on;
- contains no dynamic SQL and no caller identity parameter;
- has final execute revoked from `PUBLIC` and `anon` by the corrective migration;
- grants only exact execute to `authenticated`;
- is owned by `restaurant_membership_context_reader`, a dedicated `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` role;
- can read only the exact identity, membership, role, permission, scope, and branch columns needed by the contract;
- has no final schema `CREATE` privilege and is never granted to a browser role.

The audited pre-deployment membership is one row granted by `supabase_admin` with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`. `010000` temporarily changes SET to true while omitting ADMIN. `020000` restores SET=false in a fresh transaction while also omitting ADMIN. The row and grantor are preserved, and neither migration contains membership revoke. Only `010000` may contain the two exact `SET LOCAL ROLE` statements; `020000` and every other SQL artifact remain role-switch-free.

The custom owner receives no `auth` schema grant and no explicit `auth.uid()` grant. Its final capabilities are limited to `public` schema usage, exact column-level SELECT required by the RPCs, ownership of the three strict RPCs, and no write, login, inheritance, RLS bypass, or schema-create ability.

The current-access function returns only restaurant ID, role key, permission key, permission scope, and applicable branch ID. It does not expose Auth IDs, restaurant-user IDs, membership IDs, status history, audit columns, or the authorization graph.

## 8. Clean Install and Collision Behavior

The audited target objects are absent. The migration creates them once on the aligned baseline and intentionally avoids broad `IF NOT EXISTS`. A same-name incompatible object therefore causes an explicit migration failure instead of being silently accepted.

Deterministic role rows use stable UUIDs and role-key conflict updates; permission rows use their exact composite key and conflict no-op. This makes the reference rows deterministic and idempotent without weakening object-structure checks.

## 9. Local Validation Package

This task adds:

- a migration contract with exact object and privilege details;
- a Development-only manual rollback draft;
- catalog and future actor validation queries;
- a repository guard for scope, security, immutable hashes, split migration inventory, cleanup, rollback, and coverage;
- an offline deterministic contract smoke for actor, tenant, branch, lifecycle, permission, final ACL, and no-write semantics.
- known issue `P2V-B-KI-001` documenting the managed-grantor limitation, split deployment, temporary SET interval, failure recovery, and Production hard gate.

Local validation includes the existing preflight guard, the new Phase 2V-B guard, offline smoke, schema validator, relevant typecheck, static SQL checks, secret/service-role/network/artifact scans, diff checks, and runtime-diff proof.

## 10. Explicit Non-Goals

This migration does not create employee records, invitations, full staff management, membership writes, Restaurant Web runtime changes, owner/internal projections, public projection replacements, Admin or Social objects, analytics access, aggregate-metrics grants, N4, or any Production object. It does not revoke or widen existing restaurant/menu grants and does not change N3.

## 11. Authorization Boundary for the Next Operator

Attempt 6 rolled back completely at SQLSTATE `XX000`, so remote remains 27. Deployment of `010000` and `020000` remains **not authorized** here. Credential-backed live smoke remains **not authorized**. A later separately approved operator must follow `P2V-B-KI-001`: stop if `010000` fails; if `010000` succeeds and `020000` fails, inspect actual state and permit Claude one cleanup retry only; after a second cleanup failure, stop and escalate. Only remote=29 plus final SET=false may proceed to live smoke and Freeze gates. Phase 2V-B remains unfrozen, and Phase 2V-C and N4 remain blocked.

### Development deployment outcome (Attempt 7)

A subsequently authorized operator deployed both `010000` and `020000` in a single `supabase db push` without retry. Remote advanced to 29 through `20260716020000`. The three strict RPC ACLs are corrected: `PUBLIC` absent, `anon` absent, `authenticated` explicit and non-grantable, grantor=`restaurant_membership_context_reader`. Credential-backed live smoke (anon denial, authenticated non-member zero-authority, null-session fail-closed, invalid-UUID explicit error) is confirmed. Phase 2V-B is now frozen in Development.

The two-migration split produced a second `pg_auth_members` row (oid=18859, grantor=postgres, admin=false, inherit=false, set=false) as a Development-only structural exception documented in `P2V-B-KI-001`. Both rows have set=false. `pg_has_role` confirms no effective SET or INHERIT path. This exception is accepted for Development Freeze only. Production requires re-evaluation.

### P2V-B-DV-001 — Deferred positive actor validation

DEFERRED — NOT A PHASE 2V-B DEVELOPMENT FREEZE BLOCKER.

The following positive actor and denial tests were not executed in Phase 2V-B and are deferred to Phase 2V-F. They are also required as N4 gates and Production hard gates before any Production rollout.

- Owner membership round-trip (positive execute and non-empty context rows)
- Manager membership round-trip
- Staff branch-scoped round-trip
- Cross-restaurant denial (active member of restaurant A cannot access restaurant B data)
- Cross-branch denial (branch-scoped member cannot access sibling branch)
- Inactive, suspended, and revoked membership denial

These tests must not be written as passed. No authorized actor fixture or rollback-only harness existed in Phase 2V-B Development. Phase 2V-C and N4 remain blocked until DV-001 is resolved.
