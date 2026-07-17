# Phase 2W-B Freeze Candidate Record

Phase: Consumer Runtime Phase 2W-B — Ratings Schema / ACL Review and Local Migration Draft

## Candidate state

- Starting HEAD: `7a18a5fe75a674266415b14aba7299cd7cc88a28`.
- Branch: `main`.
- Phase 2W-A: FROZEN.
- Phase 2W-B local implementation: complete.
- Phase 2W-B Development deployment and validation: complete.
- Phase 2W-B state: **Freeze candidate**.
- Phase 2W-B Frozen: `false` until the candidate is reviewed and committed.
- Phase 2W-C: NOT STARTED.

## Frozen contract candidate

- Restaurant and menu-item target IDs are trimmed, non-empty opaque identifiers. Phase 2W-B does not add target foreign keys or infer a target catalog.
- Ownership comes exclusively from `auth.uid()`; neither write RPC accepts an ownership parameter.
- Optional `meal_record_id` or `meal_record_item_id` linkage must belong to the current user.
- When linkage is supplied, its restaurant/menu-item/branch target must match the rating target; mismatches fail closed.
- Restaurant replacement identity follows the existing current unique index `(user_id, restaurant_id) WHERE is_current=true`.
- Menu-item replacement identity intentionally follows the existing current unique index `(user_id, menu_item_id) WHERE is_current=true`; restaurant and branch do not change that identity.
- Replacement is serialized, retires only the previous current row, inserts one private current row, and retains history.
- Authenticated reads use owner-scoped RLS `SELECT`; authenticated direct table DML remains denied.
- Authenticated writes use the two atomic `SECURITY DEFINER` RPCs with fixed safe search paths.

## Development evidence

- Remote migration history: `33 -> 34`.
- Latest: `20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql`.
- Migration SHA-256: `2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f`.
- Catalog/RLS/ACL verification: PASS.
- Negative rollback smoke: 14/14 PASS.
- D4 restaurant/menu-item atomic replacement: PASS.
- D5 cross-actor RLS isolation: PASS.
- All validation writes used `BEGIN` / `ROLLBACK`; persistent test data created=false.

## Open hardening and carried status

- Feedback string length limits, dislike-reason item count, individual reason length, and total payload boundaries have not been added. They remain **pre-live hardening** and must not be represented as resolved.
- `P2W-A-DEP-001`: OPEN / ACCEPTED / DEFERRED. No dependency or lockfile work is part of this candidate.
- `P2V-PERF-001`: OPEN / DEFERRED.
- N4: BLOCKED / NOT EXECUTED.
- Phase 2V-F: BLOCKED / NOT EXECUTED.
- Production: untouched.

The pre-live hardening items above are not Phase 2W-B Freeze-candidate blockers. Remaining Phase 2W-B blockers: **NONE**.

## Freeze declaration boundary

This record is a candidate, not a final Freeze declaration. `PHASE_2W_B_FREEZE_CANDIDATE=true` and `PHASE_2W_B_FROZEN=false` until explicit review and a later authorized commit. No stage, commit, push, Phase 2W-C work, or Production operation belongs to this record task.
