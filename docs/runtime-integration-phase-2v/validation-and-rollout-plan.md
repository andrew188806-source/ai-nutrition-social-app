# Phase 2V Validation and Rollout Plan

Status: **Frozen validation design for Phase 2V-A; no live validation is authorized by this document**
Related contracts: [`tenant-authorization-contract.md`](./tenant-authorization-contract.md), [`read-surface-contract.md`](./read-surface-contract.md)

## 1. Validation Principles

- Development only; Production is excluded.
- Positive access is insufficient: every owner/internal path requires non-member, lifecycle, cross-tenant, and applicable cross-branch denial proof.
- A browser-visible filter is not authorization evidence.
- Tests report status, counts, stable non-secret labels, and error classes only. They do not print credentials, tokens, sessions, project identifiers, user IDs, restaurant IDs, branch IDs, raw rows, or sensitive payloads.
- Default and local contract smokes remain offline/inert unless an explicit Development live-smoke approval is provided.
- A failed gate stops progression; it does not authorize fallback to raw tables, mock-as-live, privileged browser credentials, or scope expansion.

## 2. Actor Matrix

| Actor | Public-safe expected | Owner/internal expected | Admin/governance expected | Raw/legacy expected |
| --- | --- | --- | --- | --- |
| `anon` | `restaurant_public_published_nutrition_v1` and other explicitly public projections only | Denied / zero rows | Denied | Denied after applicable cleanup; raw nutrition already denied |
| Authenticated Consumer with no restaurant membership | Authenticated Consumer projection plus public-safe paths | Zero owner/internal rows and no membership enumeration | Denied | Denied |
| Restaurant A active owner | Public-safe paths plus all allowlisted Restaurant A owner rows | Restaurant A only; all Restaurant A branches where owner semantics allow | Denied | Denied after N4 |
| Restaurant A active manager | Public-safe paths plus manager allowlist | Restaurant A and approved branch scope only | Denied | Denied after N4 |
| Restaurant A active staff | Public-safe paths plus staff allowlist | Assigned Restaurant A branches and role-allowed rows only | Denied | Denied after N4 |
| Restaurant A inactive/suspended member | Public-safe actor behavior only | Zero owner/internal rows | Denied | Denied |
| Restaurant B active owner | Public-safe paths plus Restaurant B owner rows | Restaurant B only; zero Restaurant A owner/internal rows | Denied | Denied after N4 |
| Service role | Catalog/operations reference under separate controlled approval only | Not a browser-runtime actor and not part of Restaurant Web parity | Not validated as an app actor in Phase 2V | Never used to mask client denial |

At least two restaurants and two branches under one restaurant are required for meaningful cross-tenant and cross-branch Development validation. Test identity/data provisioning is a separately approved Development operation and is not part of Phase 2V-A.

## 3. Public Positive Tests

For each public-safe surface:

- intended actor can select the exact projection;
- returned fields exactly match the allowlist;
- unpublished, inactive, deleted, internal-review, audit, confidence, private staff, and governance fields are absent;
- row filters reflect published/active semantics;
- `restaurant_public_published_nutrition_v1` remains readable by `anon` and `authenticated`;
- `consumer_public_next_meal_candidates_v1` remains readable by `authenticated` and denied to `anon`;
- empty result is distinguishable from transport/configuration failure;
- public parity against the frozen canonical mock/public contract passes.

## 4. Owner Positive Tests

For owner, manager, and staff actors:

- current Auth session resolves to exactly one enabled restaurant user;
- current access context returns only active memberships and allowed branch/role presentation;
- Restaurant A owner receives all allowlisted Restaurant A rows and no Restaurant B rows;
- manager scope matches the approved role/branch semantics;
- staff receives only assigned-branch and role-allowed rows;
- each owner/internal projection returns the exact contract allowlist;
- relationship joins preserve restaurant and branch consistency;
- empty authorized data remains a valid empty result;
- repeated reads are deterministic and perform no write/RPC mutation.

## 5. Non-Member Negative Tests

An authenticated Consumer with no restaurant membership must:

- receive zero owner/internal projection rows;
- be unable to select raw membership, restaurant-user, role, assignment, restaurant, branch, menu, item, branch-item, nutrition, or analytics tables through client grants;
- be unable to infer whether a particular user or restaurant membership exists;
- receive a stable denied/empty result without raw error detail;
- retain only normal Consumer/public-safe access.

## 6. Cross-Tenant Negative Tests

For Restaurant A owner/manager/staff actors:

- requesting Restaurant B explicitly returns zero owner/internal rows or a typed denial;
- omitting filters does not return Restaurant B rows;
- modifying REST filters, route params, repository arguments, cached selection, or request payload cannot escape Restaurant A scope;
- joining Restaurant A parent IDs to Restaurant B child IDs fails closed;
- strict RPCs intersect requested restaurant scope with active DB membership and never trust the requested ID;
- counts, aggregates, errors, and timing do not intentionally disclose Restaurant B membership or private row existence.

The same assertions are repeated with Restaurant B owner against Restaurant A.

## 7. Cross-Branch Negative Tests

For branch-scoped manager/staff actors:

- an assigned Branch A actor cannot retrieve Branch B owner/internal rows;
- omitting the branch filter cannot widen scope;
- supplying Branch B directly cannot widen scope;
- branch-menu-item, menu/item, availability, staff, and analytics relationships cannot escape through a mismatched parent;
- ended or inactive assignments return zero branch rows;
- owner restaurant-wide access, if approved, remains restricted to branches belonging to the same restaurant.

## 8. Inactive and Suspended Negative Tests

For every owner/internal projection and access-context boundary:

- inactive membership returns zero owner/internal rows;
- suspended membership returns zero owner/internal rows;
- disabled restaurant user invalidates all memberships;
- unknown/malformed lifecycle values fail closed;
- revocation is effective on the next request and does not depend on client cache refresh;
- sign-out or expired session cannot retain previous tenant authority;
- reauthentication does not restore revoked membership authority.

## 9. Raw and Legacy Denial Tests

After the relevant cleanup phase:

- direct `SELECT` on approved raw restaurant/menu objects is denied to `anon` and ordinary `authenticated` actors;
- direct raw nutrition and internal published-nutrition reads remain denied;
- obsolete activation-pack helper views are denied when included in the approved N4 inventory;
- public-safe and owner/internal replacements remain readable by intended actors;
- a denied raw read cannot fall back to another client, mock-as-live, or privileged proxy;
- catalog privilege checks match runtime denial results.

Before N4, raw grants are recorded as dependency state rather than prematurely changed. Any raw access still present must not be treated as tenant-safe merely because the runtime does not normally call it.

## 10. RPC Privilege and Function Checks

For every Phase 2V read RPC, if any:

- `PUBLIC` execute is absent;
- `anon` execute is absent unless a separately approved public-safe RPC explicitly requires it;
- `authenticated` has only minimum required execute;
- function owner is a controlled database/migration role;
- function is read-only for Phase 2V;
- `search_path` is fixed and safe;
- referenced objects are schema-qualified;
- no dynamic SQL, caller user ID, owner ID, membership ID, arbitrary filter expression, write operation, or service-role dependency exists;
- missing session, non-member, inactive member, cross-tenant, and cross-branch calls fail closed;
- the result exposes only the fixed read-surface allowlist.

## 11. View, RLS, Owner, and Grant Checks

Catalog validation must record without secrets:

- exact view definitions and column order;
- view security mode (`security_invoker`, barrier, or approved alternative);
- view owner and owner privilege implications;
- grants for `PUBLIC`, `anon`, `authenticated`, and controlled roles;
- base-table RLS enabled/forced status where applicable;
- policy commands, roles, `USING`, and `WITH CHECK` expressions;
- membership and branch helper function owner/security/search-path/execute state;
- view/function dependency chains;
- absence of public/admin field leakage;
- absence of broad authenticated raw-table grants needed only to bypass safe projections.

Static definition checks do not replace actor-level runtime tests.

## 12. Runtime Parity and Fail-Closed Tests

Restaurant Web read-only cutover validation must cover:

- mock and live ViewModel structural parity;
- stable canonical IDs and relationship mapping without printing identifiers;
- active, empty, unavailable, unauthorized, malformed-row, mapping-error, and transport-error results;
- session read on each repository request or through an approved refresh-aware Auth boundary;
- sign-in, refresh, sign-out, membership revocation, and disabled-user behavior;
- no module-level frozen token/session;
- unknown source fails closed;
- default source does not accidentally activate live Supabase;
- fallback, if retained for demo recovery, is explicit and never represents mock data as live tenant data;
- no write methods, RPC mutations, background writes, analytics ingestion, or quota/social state mutation;
- zero imports or calls to raw-object fallback repositories from the cut-over path.

## 13. Migration Alignment Checks

At every migration-bearing subphase:

- baseline branch, HEAD, and clean expected worktree are confirmed;
- local migration inventory is exact;
- Development remote migration history is available and exact;
- local and remote counts and versions align before and after deployment;
- no unknown remote-only or local-only migration exists;
- the deployed migration is the separately approved file only;
- Production connection/configuration is not used;
- rollback and forward dependencies are recorded.

Phase 2V-A performs no remote migration command and accepts the frozen Phase 2U baseline only for documentation preparation.

## 14. Rollback Prerequisites and Validation

Before each deployment:

- rollback trigger and authorized operator are defined;
- dependent runtime/projection versions are identified;
- rollback does not weaken tenant isolation or expose cross-tenant rows;
- runtime can return to mock or disabled fail-closed mode;
- previous public-safe contract remains recoverable;
- minimum exact grants are documented without `GRANT ALL`;
- Development rollback order is compatible with migration dependencies;
- post-rollback public, owner, non-member, cross-tenant, raw-grant, and runtime parity checks are defined.

Before N4, rollback must be rehearsed in Development or documented completely enough for a separately approved Development recovery. A rollback is not considered ready if it depends on browser `service_role`, restoring unrestricted raw access, or guessing prior grants.

## 15. N4 Execution Gate

N4 must not be created for deployment or deployed until all ten conditions are satisfied:

1. Safe replacement projections are deployed.
2. Restaurant Web authenticated read cutover is complete.
3. Public parity passes.
4. Owner positive smoke passes.
5. Non-member and cross-tenant negative smoke passes; applicable cross-branch and lifecycle denial also passes.
6. Raw object runtime dependency is zero, including legacy/manual deployment dependencies in scope.
7. Rollback is rehearsed or a complete Development rollback plan is approved.
8. ChatGPT explicitly reviews the final dependency, projection, privilege, migration, validation, and rollback evidence.
9. Claude performs any approved deployment only in Development.
10. Production is untouched.

Failure or uncertainty in any item blocks N4. Human approval cannot convert missing technical evidence into a passing gate; the missing evidence must first be resolved.

## 16. Rollout Sequence

1. Freeze Phase 2V-A documents.
2. Inspect Development schema and prepare 2V-B only after approval.
3. Deploy membership/isolation foundation to Development and validate all negative actors.
4. Prepare and deploy owner/internal projections in 2V-C.
5. Compose Auth/session and cut Restaurant Web reads over in 2V-D while raw grants remain unchanged.
6. Complete parity, fail-closed, dependency, tenant, branch, and lifecycle tests.
7. Review all N4 gates.
8. Deploy approved N4 only in 2V-E and rerun positive/negative checks.
9. Complete full multi-tenant validation and freeze in 2V-F.

No step may be reordered to place raw revoke before replacement deployment and runtime validation.

## 17. Evidence Package Per Subphase

Each subphase must produce:

- baseline and final Git proof;
- exact file inventory and diff;
- explicit scope and forbidden-operation confirmation;
- local validation results;
- for deployment phases, approved Development deployment, catalog, migration-alignment, actor-smoke, and Production-untouched evidence;
- blocker and rollback status;
- human review decision before commit/freeze.
