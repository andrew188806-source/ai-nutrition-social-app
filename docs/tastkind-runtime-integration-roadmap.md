# TastKind Runtime Integration Roadmap

Status: **Current canonical Runtime Integration roadmap — frozen by explicit product decision**
Effective baseline: `main` at `3a01cb49a0f17829346fd09f63d371b98e8265f8`
Effective date: 2026-07-15

## 1. Authority

This file is the single current authority for TastKind / 好廚 Runtime Integration phase names, order, ownership boundaries, and roadmap status.

The following documents retain their original purposes but do not override this runtime roadmap:

- the root `ROADMAP.md`, which is a legacy/general product and demo roadmap;
- Alpha 10 product, engineering, investor, business, and repository-freeze packages;
- product vision and investor phase schemes;
- historical Consumer Runtime phase documents and phase-local guards;
- draft schema, RLS, migration, backlog, and architecture documents.

Historical documents remain authoritative evidence for the scope and validation state of the phase they recorded. Their old migration counts, future-phase statements, or `not started` assertions are phase-local evidence, not current repository status.

The ambiguous label `Phase 3` must not be reused as a Runtime Integration phase. Alpha 10 materials use that label for several unrelated product, backend, household-nutrition, and go-to-market concepts.

## 2. Completed Runtime Integration History

The following sequence is complete through Phase 2U and remains frozen historical evidence:

| Phase range | Completion summary |
| --- | --- |
| Phase 1A–1D | Consumer Auth/Profile scaffolding, transport preparation, Development live Auth, and current-user profile read. |
| Phase 2A–2D | Consumer meal-record read architecture, Development live read, controlled write preparation, and atomic Development live write. |
| Phase 2E–2K | Daily nutrition summary architecture, Development reads, shared intake model and UI cutover, controlled persistence preparation, and atomic Development persistence. |
| Phase 2L–2O | Planned-meal read architecture, Development live read, controlled write preparation, and atomic Development live write. |
| Phase 2P–2R | Meal-correction read architecture, canonical next-meal recommendation architecture, and U1 canonical provider cutover. |
| Phase 2S–2U | Consumer public restaurant/menu boundary design, Development schema inspection, Mobile live read integration, public-safe restaurant nutrition projection, and raw nutrition direct-read revocation. |

Phase 2U is fully complete and frozen at commit `3a01cb49a0f17829346fd09f63d371b98e8265f8`. Its latest migration is `20260715040000_revoke_raw_nutrition_direct_read_access.sql`.

## 3. Current Phase — Phase 2V

Formal name:

**TastKind Runtime Integration Phase 2V — Restaurant Web Tenant-Safe Read Projections & Restaurant/Menu Raw Grant Cleanup (N4)**

Phase 2V establishes an authenticated Restaurant Web read path whose authorization is derived from database-enforced restaurant membership, separates public-safe, owner/internal, and admin/governance read surfaces, cuts Restaurant Web over without introducing writes, and revokes obsolete raw restaurant/menu grants only after replacement paths and negative tenant tests pass.

### Fixed subphases

| Subphase | Formal name | Required outcome |
| --- | --- | --- |
| 2V-A | Architecture & Contract Freeze | Freeze authorization, read-surface, rollout, validation, and responsibility contracts. No migration or runtime implementation. |
| 2V-B | Restaurant Membership Foundation & DB Tenant Isolation | Deploy and validate the canonical Auth-to-membership foundation and DB-level restaurant/branch isolation in Development. |
| 2V-C | Owner/Internal Safe Read Projections | Deploy allowlisted owner/internal read projections without expanding public-safe or admin surfaces. |
| 2V-D | Restaurant Web Authenticated Read Cutover & Parity | Compose Restaurant Web Auth/session, cut read-only runtime to tenant-safe projections, and prove mock/live parity and fail-closed behavior. |
| 2V-E | N4 Restaurant/Menu Raw Grant Cleanup | Revoke obsolete raw restaurant/menu and legacy-view client grants after all replacement and dependency gates pass. |
| 2V-F | Development Multi-Tenant Validation & Final Freeze | Complete actor, tenant, branch, privilege, parity, rollback, migration-alignment, and freeze evidence in Development. |

### Phase 2V completion conditions

Phase 2V is complete only when all six subphases are explicitly approved and completed, Development migrations are aligned, Restaurant Web uses tenant-safe read boundaries, public Consumer reads remain compatible, owner/internal reads are membership-isolated, non-members and cross-tenant actors receive no owner/internal rows, N4 has passed its dependency gates, Production remains untouched, and the final phase evidence is frozen.

Restaurant Web writes, staff invitation, staff-management UI, Admin Runtime, Social Runtime, and Production activation are not Phase 2V completion requirements.

The detailed Phase 2V-A contracts are indexed by `docs/runtime-integration-phase-2v/implementation-plan.md`.

## 4. Fixed Consumer Data Closure Sequence

The names and order below are frozen:

1. **Phase 2W — User Restaurant Ratings Runtime**
   - Establish the authenticated current-user rating read/write runtime for restaurant/menu-item rating records.
   - Do not absorb favorites, recommendation feedback, social behavior, or restaurant-owner analytics into this phase.
2. **Phase 2X — Consumer Favorites Runtime**
   - Establish authenticated current-user favorite restaurant/menu-item runtime with owner-scoped persistence semantics.
   - Do not expand public restaurant or Restaurant Web owner authorization.
3. **Phase 2Y — Recommendation Feedback Runtime**
   - Establish authenticated Consumer recommendation-session/feedback runtime with idempotency and privacy boundaries.
   - Recommendation feedback remains Consumer data, not restaurant analytics truth.
4. **Phase 2Z — Consumer Data Runtime Final Closure**
   - Close the remaining Consumer data-runtime integration gaps, reconcile guards/status evidence, and freeze the Consumer data runtime before separate tracks proceed.
   - It must not silently introduce Social, Admin, Restaurant write, or Production scope.

No additional alphabetic Phase 2 stage may be created after Phase 2Z. Corrections to completed phases must use the corrective-subphase rule below.

## 5. Fixed Post-2Z Runtime Tracks

After Phase 2Z, work proceeds in this order:

1. **Restaurant Runtime Track**
2. **Social Runtime Track**
3. **Admin Governance Runtime Track**
4. **Production Readiness Track**

Each track must create its own explicitly approved naming and milestone document before implementation. These tracks must not be renamed to a generic Runtime `Phase 3`.

## 6. Scope and Responsibility Boundaries

- Consumer Runtime owns authenticated consumer data and consumer-facing recommendation/read/write orchestration.
- Phase 2V is a deliberate cross-surface transition that establishes Restaurant Web tenant-safe reads while preserving Consumer public-safe contracts.
- The later Restaurant Runtime Track owns Restaurant Web write operations, staff invitation lifecycle, full staff/role management, restaurant operational workflows, and other owner mutations.
- Social Runtime owns Meal Buddy, matching, invitations, chat, group-table, and social persistence.
- Admin Governance Runtime owns platform review, governance, moderation, cross-tenant administrative access, and audit workflows.
- Production Readiness owns Production activation, operational security sign-off, monitoring, backup/restore, incident handling, and production deployment gates.

## 7. Roadmap Freeze Rules

The phase names, order, and responsibility boundaries in this file are frozen. An implementer must not change them because of convenience, minor documentation drift, a preferred naming scheme, or a small implementation issue.

A roadmap change may be proposed only when evidence demonstrates at least one of:

1. a major security conflict;
2. a material data-corruption risk; or
3. an actual blocker that makes the approved roadmap impossible to execute safely.

Every change requires all of the following before this file is edited:

1. exact repository or runtime evidence;
2. an explicit written impact analysis;
3. human approval;
4. a new explicit roadmap decision; and
5. a documented transition for existing phase references and frozen evidence.

The implementer may report a blocker but may not independently rename, reorder, merge, split, or reassign a frozen phase.

## 8. Corrective Subphase Rule

If a completed phase needs a narrowly scoped correction, use a corrective subphase under that phase rather than creating a new alphabetic Phase 2 stage. A corrective subphase must:

- identify the exact frozen baseline it corrects;
- remain narrower than the parent phase;
- preserve unrelated frozen artifacts;
- define migration, runtime, rollback, and validation impact explicitly;
- require human approval before implementation;
- never conceal a superseded phase-local assertion by rewriting historical evidence; and
- receive a distinct final freeze record.

Corrective subphases do not authorize reopening the roadmap or borrowing scope from a later Runtime Track.
