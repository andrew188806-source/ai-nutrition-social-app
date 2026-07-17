# Phase 2W-E0 Freeze Candidate Record

Phase: Phase 2W-E0 — Canonical Restaurant/Menu Intake & Governance Foundation

Status: **Freeze candidate; not Frozen before an explicitly authorized successful commit**.

## Baseline and prior evidence

- Starting branch: `main`.
- Starting HEAD: `5dd693a57c34220f4d0cb7f4dab40f3a5c38eca5`.
- Phase 2W-D is satisfied by the existing frozen Phase 2W-B/C evidence recorded in `phase-2w-d-satisfaction-record.md`; E0 does not recreate or rerun SQL, RPCs, migrations, or adapters.
- Phase 2W-E Mobile Cutover is `NOT_STARTED`.

## Frozen contract candidate

- An observation is separate from a canonical entity. A name, photo, address, or location is evidence only and never a canonical identifier.
- Canonical and registered provisional targets both use opaque server-generated IDs. Name-only, fuzzy-name, photo-only, or location-similarity evidence cannot auto-resolve an existing target.
- Merge preserves an alias, redirect, references, and history. Ordinary lifecycle does not hard-delete canonical or provisional targets.
- The complete governance state machine includes `received`, `resolving`, `resolved_existing`, `pending_resolution`, `externally_supported`, `community_supported`, `partner_review`, `admin_review`, `active`, `inactive_suspected`, `archived`, `rejected`, and `merged`, including partner/admin escalation and reversible inactive/archive paths.
- Catalog existence, availability, partner relationship, and nutrition verification are independent dimensions. A nutrition badge represents nutrition verification only; it does not assert existence confirmation or a partner relationship.
- An exact item badge requires a current valid verified item. A restaurant/branch badge is projected when at least one current valid nutrition-verified item exists in that scope; it does not verify every item.
- Recommendation trust tiers remain 1 through 5 after allergy, safety, availability, and user-exclusion hard filters. Hard filters always override trust; single-user provisional tier 5 is excluded from general recommendations.
- Reporting and reward contracts preserve partner/admin review, appeal, reopen, reversal, and the rule that a reward cannot be `issued` before its report is `confirmed`.

## Partner claim queue contract

- Historical discovery eligibility is the inclusive interval `partnerVerifiedAt - 60 days <= lastObservedAt <= partnerVerifiedAt`.
- Live pending intake is the disjoint interval `partnerVerifiedAt < lastObservedAt <= now`.
- `createdAt` never determines discovery eligibility. It is retained only as the final temporal deterministic sorting tie-breaker before stable ID.
- Missing or invalid observation time, future observation time, invalid authority/current time, `partnerVerifiedAt > now`, or `observedAt > lastObservedAt` fails closed.
- Existing canonical menu ownership/claim is outside the discovery window and is not limited to 60 days.
- Queue delivery is cursor-based, capped at 20 items, supports defer/resume, delivers once per restaurant/branch scope, preserves branch-separated routing, and routes ambiguous branch evidence to headquarters/admin rather than an arbitrary branch.

## Implementation boundary and carried status

- E0 contains shared canonical contracts, pure policies, ports, documentation, guard, and in-memory smoke only.
- Database tables, migrations, SQL/RPCs, persistence adapters, partner queue infrastructure, Admin UI, Restaurant Web UI, and Mobile cutover remain unimplemented by E0.
- `P2W-A-DEP-001`: OPEN / ACCEPTED / DEFERRED.
- `P2V-PERF-001`: OPEN / DEFERRED.
- N4: BLOCKED / NOT EXECUTED.
- Phase 2V-F: BLOCKED / NOT EXECUTED.
- Production: untouched.

## Validation evidence

- E0 static guard: 41/41 PASS before this record; the updated guard additionally binds this Freeze contract.
- E0 contract smoke: 45/45 PASS.
- Phase 2W-A/B/C contract regressions: PASS with native exit code `0`.
- Root, Mobile, Admin, and Restaurant Web typechecks: PASS.
- Canonical data audit and `npm ls --depth=0`: PASS.
- Migration inventory remains 34 through `20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql`; migration and lockfile diffs remain empty.

## Freeze declaration boundary

This record prepares a candidate only. A successful explicitly authorized commit is required before `PHASE_2W_E0_FROZEN=true` may be declared.

- `PHASE_2W_E0_FREEZE_CANDIDATE=true`
- `PHASE_2W_E0_FROZEN=false`
- `PHASE_2W_E_MOBILE_CUTOVER=NOT_STARTED`

