# Phase 2X-A Consumer Favorites Runtime Contract

Status: local canonical contract candidate; no runtime implementation exists in Phase 2X-A.

## Scope and records

Favorites are private current-authenticated-user data. Supported targets are exactly:

- `restaurant`: canonical `restaurantId`.
- `menu_item`: canonical `restaurantId` plus canonical `menuItemId`.

Branch, menu, meal, meal-record, self-made dish, display-card, recommendation-feedback, and generic targets are unsupported. A favorite is independent of any rating row.

Canonical records expose `favoriteId`, discriminated target, `collectionLabel`, `sortOrder`, `createdAt`, and active state. Ownership is implicit and never exposed as an input. Normal reads return active rows only (`removed_at is null`).

## Read contract

The future service surface is:

- `getCurrentUserFavorite(target)` for one target.
- `listCurrentUserFavorites(input)` for a single entity type's active current-user records. `entityType` (`restaurant` or `menu_item`) is a required input. Combined cross-entity listing is deferred.

Single-target states are `available`, `missing`, `disabled`, `unauthenticated`, `invalid_target`, and `read_failed`. List states are `available`, `empty`, `disabled`, `unauthenticated`, and `read_failed`. Raw transport/database errors and ownership IDs never reach UI.

List ordering is deterministic: `sort_order` ascending (`NULLS LAST`), then `created_at` descending, then `id` ascending. Pagination uses a cursor encoding the tuple `(sort_order, created_at, id)`. Page size is bounded from 1 through 50 with default 20. Lists must never load an unbounded table.

## Write contract

The future service surface is:

- `addCurrentUserFavorite(target)`.
- `removeCurrentUserFavorite(target)`.

Results are `added`, `already_present`, `removed`, `already_absent`, `disabled`, `unauthenticated`, `invalid_target`, and `write_failed`.

- Add is atomic and idempotent. If one active row already exists, it returns `already_present` without creating or changing another row.
- If only removed history exists, add inserts a new active row. It does not rewrite or reactivate an arbitrary historical row.
- Remove is a soft removal that atomically sets `removed_at` on the active row. It never hard-deletes history.
- Removing an absent/already-removed target returns `already_absent` without error.
- Phase 2X does not expose collection-label or sort-order mutations. Existing values remain readable; future metadata editing needs a separate approved contract.

The database unique indexes are the final concurrency backstop. The write functions must handle simultaneous duplicate adds deterministically and must not leak unique-violation details.

## Authentication and fail-closed behavior

Every operation first requires the existing Consumer Auth boundary to return a current authenticated session. No port, service input, repository input, mapper, or RPC may accept `user_id` or `userId`. Missing session fails closed as `unauthenticated`; invalid source selection or missing injected dependencies fails closed and never falls back to mock.

## Planned source modes and layering

Phase 2X-B should add an isolated `consumer-favorites` feature with:

1. canonical types, errors, validation, and target identity mapper;
2. read/write repository ports;
3. disabled and deterministic in-memory mock repositories;
4. a Supabase-prepared repository that performs no network operation;
5. current-user service;
6. runtime flags and factory;
7. explicit Mobile composition boundary and presentation-only UI model.

Planned source flags:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE`.
- `EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE`.

The Phase 2X-B defaults are read `mock` and write `disabled`. Prepared/live source selection requires explicit opt-in and dependency injection. Invalid values, missing client, mapping failure, or configuration failure never select mock silently.

## Supabase activation boundary

Phase 2X-C may activate owner-scoped authenticated reads only after a versioned ACL migration/security review verifies RLS, exact table grants, anon/PUBLIC denial, and the linked catalog. Phase 2X-D writes must call approved authenticated atomic functions only. Direct table `INSERT`, `UPDATE`, `DELETE`, or `UPSERT` from Mobile is forbidden.

No Phase 2X-A file implements these layers or activates a source.
