# Phase 2V-A Implementation Plan

Status: **Architecture & Contract Freeze**
Roadmap authority: [`../tastkind-runtime-integration-roadmap.md`](../tastkind-runtime-integration-roadmap.md)

## 1. Formal Phase Name

**TastKind Runtime Integration Phase 2V — Restaurant Web Tenant-Safe Read Projections & Restaurant/Menu Raw Grant Cleanup (N4)**

This document freezes the Phase 2V execution design. It does not authorize Phase 2V-B, SQL, migration creation, runtime cutover, grant revocation, remote Supabase access, or Production activity.

## 2. Background and Confirmed Evidence

Phase 2U established and retained two safe read paths:

- `restaurant_public_published_nutrition_v1`: public-safe nutrition for `anon` and `authenticated`;
- `consumer_public_next_meal_candidates_v1`: authenticated Consumer recommendation candidates.

Phase 2U-C-B revoked direct `SELECT` for `anon` and `authenticated` from `menu_item_nutrition` and `current_published_menu_item_nutrition`. The local active migration inventory ends at `20260715040000_revoke_raw_nutrition_direct_read_access.sql`.

Repository discovery also established:

- canonical restaurant membership and role structures exist only as draft schema;
- Restaurant Web active UI uses canonical mock repositories/services;
- the prepared Supabase repository accepts caller-provided `restaurant_id` filters, which are query conditions rather than authorization;
- Restaurant Web has no current authenticated session composition;
- no deployed DB-level Restaurant Web tenant isolation is evidenced;
- the Phase 2U plan reserves Restaurant Web safe projections and N4 raw restaurant/menu grant cleanup for Phase 2V.

## 3. Problem Statement

An authenticated browser session proves identity but not restaurant ownership or staff authority. A route parameter, UI-selected restaurant, repository argument, or REST filter can be modified by the caller. Therefore Restaurant Web cannot safely cut over to owner/internal data until the database can derive active restaurant and branch scope from `auth.uid()` and enforce it for every owner/internal read.

N4 cannot revoke raw restaurant/menu access until public and owner/internal replacement surfaces are deployed, Restaurant Web has cut over, runtime dependencies on raw objects are zero, multi-tenant negative tests pass, and rollback is ready.

## 4. Objectives

Phase 2V will:

1. establish a canonical mapping from Supabase Auth identity to active restaurant membership;
2. enforce restaurant and branch scope at the database boundary;
3. separate public-safe, owner/internal, and admin/governance-only read surfaces;
4. expose allowlisted read projections suitable for Restaurant Web;
5. compose authenticated Restaurant Web read-only runtime without browser privileged credentials;
6. prove public, owner, non-member, cross-tenant, and cross-branch behavior in Development;
7. remove obsolete raw restaurant/menu client grants only after replacement gates pass; and
8. freeze complete Development evidence without touching Production.

## 5. In Scope

- Restaurant Auth identity-to-membership foundation.
- Active restaurant membership and optional branch assignment semantics.
- Database-enforced tenant and branch read isolation.
- Public-safe read preservation.
- Owner/internal allowlisted read projections.
- Restaurant Web authenticated read-only composition and cutover.
- Fail-closed source selection and mock/live parity.
- N4 dependency audit and approved grant cleanup.
- Development-only actor, tenant, privilege, parity, rollback, and migration validation.

## 6. Out of Scope

- Restaurant Web write paths.
- Menu, menu-item, nutrition, restaurant, branch, role, or staff insert/update/delete.
- Staff invitation or pending-invitation lifecycle.
- Full staff-management or role-management UI.
- Admin Runtime or platform-governance runtime.
- Social Runtime.
- Consumer ratings, favorites, or recommendation feedback runtime.
- Production operations or Production readiness.
- Browser `service_role` clients.
- Client-side or route-provided `restaurant_id` authorization.
- N4 revocation before safe projection, cutover, dependency, validation, and rollback gates pass.

## 7. Fixed Subphase Plan

### 2V-A — Architecture & Contract Freeze

Entry gate:

- Phase 2U final freeze is clean at `3a01cb49a0f17829346fd09f63d371b98e8265f8`.
- Local migration count is 25 and latest migration is N3.
- No Phase 2V migration or runtime implementation exists.

Exit criteria:

- canonical roadmap is recorded in the Repository diff and ready for review;
- this plan and the tenant, read-surface, validation, rollout, responsibility, and N4 gates are internally consistent;
- no executable SQL, migration, runtime change, remote operation, stage, commit, or push was produced during preparation;
- Phase 2V-B remains unstarted pending explicit approval.

Expected artifacts:

- `docs/tastkind-runtime-integration-roadmap.md`;
- this implementation plan;
- `tenant-authorization-contract.md`;
- `read-surface-contract.md`;
- `validation-and-rollout-plan.md`.

### 2V-B — Restaurant Membership Foundation & DB Tenant Isolation

Entry gate:

- 2V-A is reviewed and frozen;
- existing active schema is re-inspected in Development;
- the proposed membership tables, identifiers, role vocabulary, constraints, and lifecycle values do not conflict with deployed objects;
- a forward-only migration and Development rollback plan receive explicit approval.

Exit criteria:

- Auth identity maps to a unique enabled restaurant user;
- active memberships and branch assignments are DB-enforced;
- inactive/suspended memberships fail closed;
- cross-restaurant and cross-branch access tests pass;
- membership objects themselves are not browser-enumerable;
- local/remote Development migration history aligns;
- no owner/internal projection or Restaurant Web cutover is claimed yet.

Expected artifacts:

- approved membership/isolation migration;
- catalog and constraint validation queries;
- tenant/branch isolation guard and smoke;
- Development deployment and rollback record.

### 2V-C — Owner/Internal Safe Read Projections

Entry gate:

- 2V-B is frozen and active membership isolation is verified;
- exact owner/internal field allowlists and projection dependencies are approved;
- public-safe and admin/governance fields are classified.

Exit criteria:

- owner/internal projections derive scope from DB membership;
- a non-member returns zero owner/internal rows;
- Restaurant A actors cannot read Restaurant B rows;
- staff visibility is no broader than role and branch scope;
- public views are not widened;
- admin/governance-only fields do not appear;
- raw grants remain unchanged pending cutover.

Expected artifacts:

- approved owner/internal projection migration;
- contract row types and read-only repository preparation;
- projection definition, ownership, grant, and negative-access validation.

### 2V-D — Restaurant Web Authenticated Read Cutover & Parity

Entry gate:

- 2V-C is frozen and projections are live in Development;
- Restaurant Web Auth/session architecture is approved;
- source flags default to mock or disabled and unknown values fail closed;
- no write capability or privileged browser credential is present.

Exit criteria:

- Restaurant Web read services use authenticated tenant-safe boundaries;
- identity/session is read per request through the approved Auth boundary;
- route and caller `restaurant_id` values are treated only as optional filters within DB-authorized scope;
- public and owner/internal mock/live parity passes;
- missing session, no membership, inactive membership, transport error, and mapping error fail closed;
- no raw object runtime dependency remains in the cut-over path.

Expected artifacts:

- Auth/session adapter and read-only composition;
- projection row mappers and repository/service integration;
- runtime guard, default offline smoke, mock contract smoke, and approved Development live read smoke;
- parity and dependency-audit evidence.

### 2V-E — N4 Restaurant/Menu Raw Grant Cleanup

Entry gate:

- all N4 gates in `validation-and-rollout-plan.md` pass;
- 2V-D is frozen;
- raw and legacy object runtime dependency scan returns zero;
- rollback has been rehearsed or a complete Development rollback plan is approved;
- explicit ChatGPT review and human deployment approval are recorded.

Exit criteria:

- approved raw restaurant/menu and obsolete legacy-view client grants are revoked in Development;
- public-safe Consumer and public Restaurant projections remain readable by their intended actors;
- owner/internal projections remain readable only through active membership scope;
- direct raw access and obsolete legacy access are denied;
- no Production operation occurred.

Expected artifacts:

- separately approved forward-only N4 migration;
- separate rollback plan, not bundled into the forward migration;
- privilege/dependency validation and Development deployment evidence.

### 2V-F — Development Multi-Tenant Validation & Final Freeze

Entry gate:

- 2V-E is complete in Development;
- intended actor fixtures/accounts are explicitly approved and safely available;
- all migrations align locally and remotely.

Exit criteria:

- the full actor matrix passes;
- public, owner, tenant, branch, membership-lifecycle, raw-denial, RPC, view-mode, parity, fallback, and rollback checks pass;
- Restaurant Web remains read-only;
- Production remains untouched;
- final diff, migration inventory, guard/smoke results, and freeze commit are reviewed.

Expected artifacts:

- complete multi-tenant validation report;
- final guard and live-smoke evidence;
- migration-alignment and Production-untouched proof;
- Phase 2V final freeze documentation.

## 8. Responsibility Model

### Codex

- inspect and modify the local Repository within the approved subphase;
- create architecture, contracts, migrations, runtime code, guards, and offline tests only when that subphase authorizes them;
- run local typechecks, static guards, mock/offline smokes, diff checks, and dependency scans;
- never deploy remotely, use credentials, or infer authorization beyond the approved phase;
- stop on baseline mismatch, security conflict, scope expansion, or unapproved runtime/database operation.

### Claude

- perform separately approved Development deployment and credential-backed validation;
- confirm local/remote migration alignment and Development catalog/privilege state;
- run approved live read or negative-access smoke with non-secret output;
- never operate on Production under Phase 2V.

### Human owner

- approve each subphase, migration, Development deployment, rollback, live-smoke actor set, N4 execution, and freeze;
- supply or coordinate Development access without placing credentials in Repository artifacts;
- resolve genuine schema, security, role, naming, or scope blockers;
- approve any roadmap change under the canonical freeze rules.

## 9. Conceptual Migration Sequence

This sequence is descriptive and contains no executable SQL:

1. membership identity and active-membership foundation;
2. tenant and branch isolation policies/helpers, with hardened execution boundaries where required;
3. owner/internal allowlisted read projections;
4. Restaurant Web authenticated read cutover with raw grants still present;
5. dependency and parity proof;
6. N4 raw/legacy grant cleanup;
7. post-N4 multi-tenant freeze validation.

Every database change must be forward-only, separately approved, Development-first, and paired with an explicit rollback decision. Membership, projection, and cleanup changes must not be collapsed into one migration because their gates and rollback risks differ.

## 10. Runtime Cutover and Grant Dependency Order

The required order is:

`membership isolation → owner/internal projections → repository preparation → Auth/session composition → Restaurant Web read cutover → parity and negative tests → zero raw dependencies → N4 revoke → final validation`

N4 is never a prerequisite for cutover. Cutover and validation are prerequisites for N4.

## 11. Rollback Gates

- A rollback must preserve tenant isolation and may not introduce browser `service_role` access.
- Membership rollback cannot proceed if owner projections or cut-over runtime depend on the new membership identity.
- Projection rollback cannot proceed after N4 unless the prior safe projection and minimum grants are restored in a reviewed Development-only recovery step.
- N4 rollback must grant only the exact previously required read privileges; it must never use broad `GRANT ALL`.
- Runtime rollback must return to the canonical mock path or a known safe disabled path, not raw tables.
- Any rollback that would expose another restaurant's rows is prohibited.

## 12. Definition of Done

Phase 2V-A is done when the roadmap and four Phase 2V contract documents are complete, links and terminology validate, the diff contains documentation only, no migration/runtime source changed, N4 is ordered after cutover and validation, and the work is handed back uncommitted for review.

Phase 2V as a whole is done only after 2V-A through 2V-F meet their exit criteria, Development multi-tenant evidence passes, N4 is complete and validated, Production remains untouched, and a separately approved final freeze commit exists.
