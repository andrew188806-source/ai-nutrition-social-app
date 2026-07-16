# Phase 2V-C Local Implementation Plan

Status: **Local draft only — not deployed**

Formal phase: **TastKind Runtime Integration Phase 2V-C — Owner/Internal Safe Read Projections**

Frozen authorities are the Phase 2V roadmap and the contracts under
`docs/runtime-integration-phase-2v/`. Phase 2V-B remains immutable and frozen
at commit `9380869b0d2245f4c31bdd563ad7d05158c423f7`.

## Objective

Create seven authenticated, tenant-safe, fixed-column read RPCs for Restaurant
Web preparation. The database derives actor authority from the Phase 2V-B JWT
and membership foundation. A caller restaurant ID is only a selector that can
narrow a database-authorized scope.

## Fixed role mapping

| Role | Access context | Restaurant | Branch | Menu | Nutrition |
| --- | --- | --- | --- | --- | --- |
| owner | self | restaurant | restaurant | restaurant | restaurant |
| manager | self | restaurant | branch | branch | branch |
| staff | self | none | branch | branch | branch |

Inactive roles, disabled identities, and inactive, suspended, or revoked
memberships produce no access context and therefore no projection rows.

## Migration sequence

1. `20260716030000_add_restaurant_projection_integrity_constraints.sql`
   adds composite identity constraints and same-restaurant foreign keys for
   branch-menu items. Existing data is validated atomically; no backfill occurs.
2. `20260716040000_create_restaurant_internal_read_rls.sql` grants only exact
   columns to the dedicated reader and adds permissive internal plus restrictive
   tenant policies. Existing public policies are unchanged.
3. `20260716050000_create_restaurant_internal_read_rpcs_as_owner.sql` creates
   and transfers the seven strict RPCs, fixes execute ACLs in owner context, and
   intentionally leaves SET cleanup to the next migration.
4. `20260716060000_restore_restaurant_internal_reader_set_option.sql` restores
   `INHERIT FALSE, SET FALSE` in a fresh transaction.

## Authorization design

- `restaurant_current_access_context_v1()` is the canonical active scope source.
- Restaurant-scoped permission returns all rows in that membership restaurant.
- Branch-scoped permission returns only rows reachable through active assigned
  branches recorded by the access-context function.
- Every branch/item path verifies branch, item, menu and restaurant joins.
- Base-table RLS restricts the dedicated reader to active membership tenants.
  Branch assignment remains an explicit RPC predicate to avoid RLS recursion.
- Public, anon and authenticated receive no new raw-table privilege.

## Excluded scope

No runtime cutover, writes, analytics, staff directory, ratings, governance,
public-view changes, N4 cleanup, remote connection, fixture creation, or
Production operation is included.

## Exit criteria for local draft

- Exactly four new migrations and seven approved functions exist.
- Exact return columns and ACL/owner/settings pass static guards.
- Frozen artifacts, deployed migrations, and runtime directories are unchanged.
- Local migration inventory is 33 through `20260716060000`.
- No remote or credential-backed operation has occurred.
