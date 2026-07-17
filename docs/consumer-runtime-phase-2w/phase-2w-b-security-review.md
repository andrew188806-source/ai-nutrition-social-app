# Phase 2W-B Ratings Security Review

Status: local static review and Development catalog/actor validation complete; Freeze candidate.

## Frozen starting state

- Both rating tables have RLS enabled.
- `ratings_owner_all` and `menu_item_ratings_owner_all` enforce `auth.uid() = user_id` through `USING` and `WITH CHECK`.
- Active migrations contain no rating-specific table grants and no rating RPC/function.
- Restaurant current uniqueness is `(user_id, restaurant_id) WHERE is_current=true`.
- Menu-item current uniqueness is `(user_id, menu_item_id) WHERE is_current=true`.

## Ownership and authentication

- Both write functions derive ownership exclusively from `auth.uid()` and reject a null identity.
- No function argument or returned field accepts/exposes caller-selected ownership.
- `SECURITY DEFINER` is paired with the fixed `pg_catalog, public, pg_temp` search path and schema-qualified tables/functions.
- Target-scoped advisory transaction locks cover concurrent first-insert and replacement paths.

## Input and linkage validation

- Rating must be non-null finite `numeric` in the inclusive range 0–5; `NaN` and infinities are rejected explicitly.
- A restaurant rating linked to a meal requires a non-deleted caller-owned meal and at least one caller-owned item for the same restaurant.
- A menu-item rating linkage requires a caller-owned item under a non-deleted caller-owned meal. Restaurant, nullable branch, and menu-item identifiers must match exactly using null-safe branch comparison.
- A missing or cross-owner linkage receives the same not-owned failure; target mismatch is evaluated only after ownership succeeds.

## ACL result intended after deployment

- `authenticated`: table `SELECT` only; execute on the two authenticated write RPCs.
- `authenticated`: no direct table `INSERT`, `UPDATE`, or `DELETE`.
- `anon`: no rating table privilege and no write RPC execute.
- `PUBLIC`: no rating table privilege and no write RPC execute.

## Development evidence and carried status

- Development migration execution: complete; remote history is 34 through `20260717010000`.
- Development catalog/RLS/RPC validation: PASS.
- Negative rollback smoke: 14/14 PASS.
- Restaurant and menu-item atomic replacement: PASS.
- Cross-actor RLS isolation: PASS.
- All validation writes used `BEGIN` / `ROLLBACK`; persistent test data created=false.
- Mobile live adapter and UI cutover: not started.
- `P2W-A-DEP-001`: unchanged; dependency and lockfile remediation remains out of scope.
- Feedback length/count/payload boundaries remain pre-live hardening and are not resolved by Phase 2W-B.
- `P2V-PERF-001`: OPEN / DEFERRED.
- N4 and Phase 2V-F: BLOCKED / NOT EXECUTED.
- Production: untouched.
