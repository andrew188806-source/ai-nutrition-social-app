# Consumer Runtime Phase 2X-C-A — Security and Validation

Status: local static and fake-client validation only.

## Security decisions

- Authentication is checked by ConsumerFavoriteService before repository access.
- Ownership never appears in a public target, list input, selected column, or query filter.
- RLS remains the current-user row boundary.
- Anonymous access receives no migration grant.
- Authenticated receives only table SELECT.
- Direct INSERT, UPDATE, DELETE, UPSERT, and RPC calls are absent from the Supabase adapter.
- Removed history is never requested by normal reads.
- Menu-item lookup requires both canonical target IDs.
- Cross-entity pagination remains unsupported.
- No privileged credential, global Supabase singleton, logger payload, or mock fallback is introduced.

## Local contract validation

The Phase 2X-C-A smoke compiles the complete Favorites feature into an operating-system temporary directory and removes it in finally. Its structural fake client verifies:

- exact table and selected-column contracts;
- authentication before client access;
- active-row and target filters;
- restaurant-parent filtering for menu items;
- three-level ordering and page-size-plus-one behavior;
- non-null and null-partition cursor predicates;
- snake_case mapping and malformed-row rejection;
- missing, authentication, permission, database, and transport results;
- explicit Supabase read composition and missing-client failure;
- Supabase write rejection and disabled write behavior;
- frozen mock add, duplicate-add, and soft-remove behavior;
- zero network and zero database operation.

The smoke must pass twice with the same assertion count. Static validation also requires syntax checks, typechecks, schema validation, canonical audit, dependency-tree validation, git diff --check, package-lock immutability, frozen-artifact invariants, candidate scope, secret scans, and empty staged diff.

## Historical invariants

The Phase 2X-C-A guard treats older phase guards as historical artifacts:

- Phase 2X-A Frozen Commit 7e4a9148b5caa73955d87570ea6aed645aff9bfe must be an ancestor.
- Phase 2X-B Frozen Commit bb45c808ef7c1773bc7fd7d5a32da935bf291a78 must be an ancestor or HEAD.
- Frozen Phase 2X-A/B documents, guards, mock smoke, service, ports, validation, disabled repository, and mock repository must be unchanged.
- Existing Phase 2X-A/B package scripts and commands must remain exact.
- Narrow read-source extension points may add supabase without changing the frozen write-source union or mock/disabled behavior.

The frozen Phase 2X-A/B candidate-era guards are not modified to accept later-phase files.

## Phase 2X-C-B hard gate

Before any deployment, an approved operator must:

1. confirm the exact Development project identity and Production=false;
2. confirm remote migration history is exactly aligned with the 34 pre-candidate local migrations;
3. confirm remote does not already record version 20260718010000;
4. run the read-only preflight SQL;
5. review effective anon/authenticated privileges, RLS, policies, owner/default grants, indexes, and Favorites objects;
6. confirm actual target ID types;
7. confirm menu-item global uniqueness and no conflicting restaurant parents;
8. confirm aggregate Favorites row counts without exposing row content;
9. authorize Development deployment after remote identity, migration alignment, and effective ACL verification.

If the migration remains in the Frozen Repository and remote lacks version 20260718010000, Phase 2X-C-B deploys it even if effective ACLs already appear equivalent. This preserves versioned provenance, the explicit PUBLIC/anon/authenticated revocation, authenticated SELECT-only grant, direct DML denial, and migration-ledger alignment. If remote already has the version, content and checksum must match and the migration is not re-executed. Permanent remote skip is allowed only when the candidate is formally removed before Freeze and every dependent document, guard, and implementation plan is updated in the same candidate.

Deferred gate: **Development deployment authorization after remote identity, migration alignment and effective ACL verification**.

No credential-backed actor smoke is authorized by this candidate. Phase 2X-C-A remains not Frozen and Mobile UI cutover remains not started.
