# Phase 2V-C Validation and Rollout Plan

Status: **Local validation design; remote execution not authorized**

## Local gates

- Baseline remains `main` at `9380869b0d2245f4c31bdd563ad7d05158c423f7`.
- Frozen Phase 2V-A/2V-B files and all 29 deployed migrations are unchanged.
- Local inventory contains exactly 33 migrations through `20260716060000`.
- Only four migrations, six documents and three scripts are added.
- `apps/`, `packages/` and `lib/` have no diff.
- All Phase 2V-B guards/smokes and all Phase 2V-C guards/smokes pass.
- Node syntax, schema validation, root and Restaurant Web typechecks pass.
- Diff, secret, service-role, dynamic SQL, write, cache and staged checks pass.

## Future Development catalog gates

Before deployment, verify exact prerequisite constraints, policies, role
attributes, owner grants, function definitions and the accepted two-row
`pg_auth_members` baseline. Stop on collision, unknown grant, unexpected row,
effective role path or migration misalignment.

After a separately approved deployment, verify:

- all seven functions have exact signatures, columns, owner, settings and ACLs;
- PUBLIC and anon cannot execute; authenticated can execute only the seven RPCs;
- browser roles have no new raw-table privileges;
- existing public policies and public-safe views are unchanged;
- the dedicated owner has only exact column privileges and no writes;
- exactly two membership rows remain with original OIDs/grantors, all SET and
  INHERIT options false, and no effective SET/USAGE path.

## Future actor matrix

With separately approved non-secret Development fixtures:

- owner sees every allowlisted row in Restaurant A and none in Restaurant B;
- manager/staff see only assigned Branch A1 reachability and none in A2/B;
- missing, non-member, disabled, inactive, suspended and revoked actors see zero;
- modifying `p_restaurant_id` cannot widen scope;
- category, item and branch-item mismatch rows fail closed;
- nutrition returns only current rows.

P2V-B-DV-001 must pass before N4. Empty result, authorization denial, malformed
response and transport failure must remain distinguishable without printing IDs,
credentials or payloads.

## Owner-context failure recovery

- If `050000` fails, stop; do not run `060000`.
- If `050000` succeeds but `060000` fails, inspect actual ACL/membership state
  under separate approval and follow the P2V-B-KI-001 bounded cleanup process.
- A third membership row, changed OID/grantor, SET/INHERIT true, or effective
  privilege path blocks Freeze and requires specialist review.
- No manual hotfix or migration-history repair is permitted.

## Rollout boundaries

Local drafting does not authorize Development deployment, credential-backed
smoke, runtime cutover, N4 or Production. Phase 2V-D may begin only after 2V-C
Development deployment and actor validation receive separate approvals.
