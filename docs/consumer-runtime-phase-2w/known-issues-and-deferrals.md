# Phase 2W Known Issues and Deferrals

Status: Phase 2W-A local implementation complete; all remote evidence deferred.

## Schema and contract issues for Phase 2W-B

- Restaurant, branch, and menu-item identifiers are text and have no database foreign keys in the rating tables.
- Menu-item current-row uniqueness uses `(user_id, menu_item_id)` and does not include restaurant or branch.
- `visibility` and feedback text values have no enum or check constraints.
- The rating range permits any numeric precision between 0 and 5.
- There is no soft-delete timestamp, `superseded_at`, or `created_at`. History is represented only by `is_current`, `rated_at`, and `updated_at`.
- Active migrations contain owner-all RLS policies, but no rating-specific authenticated grants or rating RPC/function.
- Actual Development grants, policies, indexes, and table definitions still require approved read-only catalog verification in Phase 2W-B.

## Existing mock incompatibilities

- `analysisMealRecordStore` stores a meal-completion star value on a local meal record; it is not a restaurant/menu-item rating repository.
- The shared `MenuItemRating` mock includes `isFavorite`, `createdAt`, and `anonymous_aggregate` presentation. Those fields do not define the Phase 2W Consumer contract.
- Meal Log rating and favorite state remains local and is not cut over in Phase 2W-A.

## P2W-A-DEP-001 — pre-existing npm dependency-tree inconsistency

`npm ls --all` reports ELSPROBLEMS in the full recursive dependency tree. This is a pre-existing inconsistency in the repository's dependency tree that was present before Phase 2W began. Phase 2W-A made no changes to `package-lock.json`, did not add, remove, or upgrade any dependency, and did not change any manifest pins. `npm ls --depth=0` passes. The problem is not a Phase 2W-A runtime correctness issue and must not be conflated with the ratings local architecture validation. Resolution requires a separately approved dependency-maintenance pass. This issue does not block local architecture Freeze.

## Preserved deferrals

N4, Phase 2V-F, P2V-PERF-001, Restaurant Web browser lifecycle groups, public hosting, and Production remain unchanged. Phase 2W-B, live reads, atomic writes, UI cutover, Favorites, and Recommendation Feedback have not started.
