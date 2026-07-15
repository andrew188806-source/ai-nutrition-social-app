# P2V-B-KI-001 — PostgreSQL 17.6 / Supabase Managed Grantor Membership Cleanup

Status: **Development: ACCEPTED — Production: OPEN HARD GATE**

## Scope

This known issue concerns the PostgreSQL 17.6 role-membership option behavior observed with the Supabase-managed grantor relationship between `restaurant_membership_context_reader` and the `postgres` deployment role. It does not change the frozen tenant authorization architecture, the Phase 2V roadmap, any browser role, or any runtime contract.

## Attempt Summary

- Attempt 1 failed at a managed Auth schema privilege and rolled back.
- Attempt 2 deployed the membership foundation as migration `20260715050000`.
- Attempt 3 deployed migration `20260715060000`, but its ACL changes did not execute in function-owner context.
- Attempt 4 reached owner context but failed at membership revoke and rolled back.
- Attempt 5 failed at an explicit ADMIN-true membership update and rolled back.
- Attempt 6 used omitted ADMIN options but still failed when trying to restore SET in the same transaction after `SET LOCAL ROLE`; it rolled back completely.
- Attempt 7 (the approved two-migration split) deployed both `20260716010000` and `20260716020000` in a single `supabase db push` without retry. Development remote history is now 29 through `20260716020000`. The RPC ACL defect is resolved.

## Development-Only pg_auth_members Structural Exception

### Ideal / Production contract

Exactly one pg_auth_members row:

| Field | Expected value |
| --- | --- |
| grantor | supabase_admin |
| admin_option | true |
| inherit_option | false |
| set_option | false |

### Development accepted exception (P2V-B structural exception)

The two-migration split creates a second row. Both rows exist after `020000` commits:

| oid | grantor | admin_option | inherit_option | set_option |
| --- | --- | --- | --- | --- |
| 18850 | supabase_admin | true | false | false |
| 18859 | postgres | false | false | false |

The second row (oid=18859, grantor=postgres) is an artifact of Supabase's managed-grantor behavior: `020000`'s `GRANT ... WITH INHERIT FALSE, SET FALSE` issued as postgres creates a new row under grantor=postgres rather than updating the existing supabase_admin row. This is the same root cause as KI-001.

This two-row outcome is accepted as a Development-only structural exception because:
- `pg_has_role('postgres','restaurant_membership_context_reader','SET') = false` — no effective SET path
- `pg_has_role('postgres','restaurant_membership_context_reader','USAGE') = false` — no effective INHERIT path
- oid=18850 (original supabase_admin row) is preserved intact
- oid=18859 adds no new capability (admin=false, inherit=false, set=false)
- Browser actors (anon, authenticated) are unaffected

This exception is **Development-only**. Exactly these two rows and no others are accepted. Any additional row, or any row with set or inherit enabled, must fail validation. The Production hard gate requires fresh re-evaluation.

Positive actor tests (owner/manager/staff round-trips, cross-restaurant denial, cross-branch denial, inactive/suspended/revoked denial) were not executed in Phase 2V-B and are deferred to Phase 2V-F. See P2V-B-DV-001.

## Development Resolution

Development uses two versioned migrations:

1. `20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql` temporarily sets membership SET=true, enters the function owner, applies only the three strict RPC ACL corrections, returns with `SET LOCAL ROLE NONE`, and commits. It does not attempt SET cleanup.
2. `20260716020000_restore_restaurant_membership_context_reader_set_option.sql` starts a fresh transaction with no role-switch history and restores `INHERIT FALSE, SET FALSE`. It performs no function, table, RLS, data, Auth, or runtime operation.

Between successful deployment of the first migration and successful deployment of the second, `postgres` may temporarily retain SET=true. This affects only the database deployment role. It does not grant a browser actor, `anon`, or `authenticated` any new privilege and does not authorize browser `service_role` use.

Final SET=false is mandatory for Phase 2V-B Freeze. If the cleanup migration does not succeed and validation does not prove SET=false, Phase 2V-B must not Freeze. SET=true must never be accepted as a permanent state.

## Prohibited Responses

- Do not use a browser `service_role` client.
- Do not modify `pg_auth_members` directly.
- Do not apply an unversioned remote hotfix.
- Do not repair migration history to conceal a failed migration.
- Do not treat the temporary SET=true interval as an acceptable final state.

## Failure Recovery Contract

### `010000` fails

- Remote remains 27.
- Stop immediately.
- Do not run `020000` or retry another operation.

### `010000` succeeds and `020000` fails

- Remote is 28 and `020000` remains pending.
- `postgres` may temporarily have SET=true.
- Before retry, inspect the actual RPC ACL and membership option state.
- Claude may retry `020000` once and only once.
- No manual hotfix is allowed.
- A second failure requires an immediate stop and escalation to specialist review.

### Both migrations succeed

- Remote is 29.
- Validation must prove SET=false and no effective SET or INHERIT path for postgres to restaurant_membership_context_reader.
- The two-migration split creates a second pg_auth_members row (grantor=postgres, admin=false, inherit=false, set=false) in addition to the original supabase_admin row (oid=18850, admin=true, inherit=false, set=false). Both rows have set=false and neither creates an effective SET or INHERIT path. This two-row outcome is an artifact of Supabase's managed-grantor behavior and was confirmed by `pg_has_role('postgres','restaurant_membership_context_reader','SET')=false` and `pg_has_role('postgres','restaurant_membership_context_reader','USAGE')=false`.
- Only then may credential-backed live smoke and the remaining Freeze gates proceed.

## Production Hard Gate

Before any Production rollout, future engineers must re-evaluate whether to use a Supabase-managed role or another officially supported grantor path instead of the Development split. That alternative is documented for future review only and is not the current Development implementation. Production remains excluded until that review and all standard deployment approvals are complete.
