# Phase 2V-B Schema Compatibility Resolution

Status: **Attempt 6 rolled back; versioned ACL and SET-cleanup split approved locally**

The initial Development catalog audit was completed outside this local implementation task. Attempt 2 deployed the foundation and Attempt 3 brought Development to 27 without repairing the ACL. Attempts 4 and 5 rolled back. Attempt 6 omitted ADMIN but still failed with SQLSTATE `XX000` when restoring SET in the same transaction after role switching; it rolled back completely. Remote remains 27 and the ACL defect persists. The audited membership remains one row with grantor `supabase_admin`, ADMIN=true, INHERIT=false, and SET=false.

Allowed compatibility values remain `ABSENT`, `COMPATIBLE`, `PARTIAL`, `CONFLICT`, and `UNKNOWN`.

## Resolution Matrix

| Required component | Development actual state | Compatibility | Fixed resolution for the local draft | Security / rollout effect |
| --- | --- | --- | --- | --- |
| `restaurant_users` | Present from deployed `20260715050000` | COMPATIBLE | Preserve unchanged | Auth deletion cascades and fails closed; browser cannot enumerate the table |
| `auth_user_id` uniqueness | Deployed unique constraint exists | COMPATIBLE | Preserve unchanged | One Auth UID cannot resolve to competing restaurant identities |
| Auth identity FK | Deployed UUID FK to `auth.users(id)` exists | COMPATIBLE | Preserve unchanged | Deleted Auth identities cannot leave transferable authority |
| `restaurant_memberships` | Present from deployed `20260715050000` | COMPATIBLE | Preserve unchanged | One row per restaurant user / restaurant; only `active` authorizes |
| Membership status vocabulary | Deployed text CHECK exists | COMPATIBLE | Preserve unchanged | Every non-active or malformed state fails closed |
| `restaurant_roles` | Deterministic `owner`, `manager`, `staff` reference rows are deployed | COMPATIBLE | Preserve unchanged | Unknown or inactive roles grant nothing |
| `role_permissions` | Deterministic permission/scope mapping is deployed | COMPATIBLE | Preserve unchanged | Owner is restaurant-wide; manager/staff branch operations require assignments |
| Branch assignments | `restaurant_membership_branch_scopes` is deployed; employee assignment objects remain absent | COMPATIBLE | Preserve membership branch scope unchanged | No employee or invitation lifecycle is introduced |
| Cross-restaurant consistency | Deployed FK and consistency trigger enforce the invariant | COMPATIBLE | Preserve unchanged | Restaurant A membership cannot be linked to Restaurant B branch |
| Restaurant-domain ID types | Restaurant, branch, menu, category, item, branch-item, and nutrition PK/FK columns are `text` | COMPATIBLE | Preserve every existing ID; membership `restaurant_id` and branch-scope `branch_id` are text | No conversion, row rewrite, or compatibility bridge |
| Auth ID type | Supabase Auth identity is UUID | COMPATIBLE | Internal identity/membership IDs and `auth_user_id` use UUID | No text/UUID coercion at the Auth boundary |
| Membership-table RLS | Enabled and forced on all five deployed tables with SELECT-only current-actor policies | COMPATIBLE | Preserve unchanged | Defense in depth even though browser raw-table privileges are revoked |
| Restaurant tenant helpers | Three strict RPCs are deployed and definitions are compatible | PARTIAL | Preserve bodies, signatures, settings, and owner; repair only execute ACLs | Runtime behavior remains unchanged while exposure is narrowed |
| Current access-context boundary | Deployed with compatible fixed columns but defective execute ACL after attempt 3 | PARTIAL | Apply the exact owner-context ACL sequence in `20260716010000` | Authenticated actors retain the intended RPC while PUBLIC/anon lose execute |
| Helper security mode | Hardened `SECURITY DEFINER` definitions and dedicated owner are deployed; attempt 3 ACL commands lacked owner context | PARTIAL | Do not replace or alter functions; enter owner with `SET LOCAL ROLE`, reset ACL, then return with `SET LOCAL ROLE NONE` | Restores the frozen anti-enumeration boundary without changing behavior or ownership |
| Deployment role membership options | Exactly one audited row: grantor `supabase_admin`, ADMIN=true, INHERIT=false, SET=false; same-transaction restoration after role switching causes XX000 | PARTIAL | `010000` sets SET=true for owner ACL work; fresh-transaction `020000` restores SET=false | Temporary SET interval affects only postgres; final SET=false remains mandatory |
| Managed `auth` privileges | Deployed foundation uses no `auth` schema grant or `auth.uid()` dependency | COMPATIBLE | Preserve unchanged; corrective migration must not touch managed Auth | SQLSTATE 42501 conflict is resolved without modifying Supabase-managed privileges |
| Owner/internal projections | `ABSENT` | ABSENT | Do not create in 2V-B | Remains a 2V-C concern |
| Existing public RLS | Existing restaurant tables have public SELECT RLS only | COMPATIBLE | Leave all existing policies unchanged | 2V-B does not claim current raw paths are tenant-safe |
| Public raw grants | Raw SELECT remains for restaurants, branches, menus, categories, items, and branch items | PARTIAL | Record only; do not revoke or widen | N4 stays deferred through Phase 2V-E gates |
| Raw/internal nutrition grants | Direct client SELECT has been revoked from both raw/internal nutrition paths | COMPATIBLE | Preserve N3 unchanged | Safe-view dependencies are not disturbed |
| Public-safe views | Public nutrition and Consumer candidate views are present and working | COMPATIBLE | Do not alter definitions, owners, policies, or grants | Regression-checked locally by migration scope guards |
| Legacy views | Existing activation-pack/public helper views are present | COMPATIBLE | Preserve unchanged; later cutover inventory only | No hidden dependency is guessed or removed |
| `restaurant_consumer_aggregate_metrics` grants | Object exists; exact grant state is `UNKNOWN` | UNKNOWN | Explicitly defer audit to the 2V-C entry gate; do not guess or modify | Does not block membership-foundation drafting because this migration neither reads nor changes it |
| Migration metadata/alignment | Remote is 27 through deployed `20260715060000`; local is 29 with pending `010000` and `020000` | PARTIAL | Keep deployed files immutable and use two versioned pending migrations | No rollback, repair, rewrite of deployed history, or unversioned hotfix |

## Fixed Compatibility Decisions

1. Existing restaurant-domain IDs remain text.
2. New internal identity, role, membership, and branch-scope primary keys may use UUID.
3. `auth_user_id` is UUID and formally references `auth.users(id)`.
4. Existing PK/FK types, application rows, public-safe views, public policies, and raw grants are unchanged.
5. No employee, invitation, Restaurant Web write, owner projection, Admin, Social, N4, or aggregate-metrics change is part of this migration.
6. Same-restaurant branch consistency is enforced in the database, not trusted to a client-provided ID.
7. Browser actors receive no direct membership-table privileges and no write capability.

## Decision

`READY FOR CODEX TWO-MIGRATION ACL AND SET-CLEANUP SPLIT`

This resolution authorizes only the local two-migration split, `P2V-B-KI-001`, documentation, guards, offline smoke, typecheck, and static validation. The first migration may leave a temporary SET=true interval only until the versioned cleanup succeeds. Failure recovery is fixed by the known issue; manual hotfixes remain prohibited. A Supabase-managed role or officially supported path is recorded only as a future Production alternative requiring fresh review, not the current Development implementation. The deployed `20260715050000` and `20260715060000` migrations are immutable. This task does not authorize deployment, credential-backed actor smoke, Production, staging, committing, pushing, Phase 2V-C, or N4. Phase 2V-B remains blocked from Freeze until both migrations succeed and final SET=false is proven.
