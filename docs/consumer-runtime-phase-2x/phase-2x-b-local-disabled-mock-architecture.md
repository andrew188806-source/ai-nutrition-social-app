# Consumer Runtime Phase 2X-B — Local Disabled/Mock Favorites Architecture

Status: local implementation candidate; not Frozen.

## Boundary

Phase 2X-B adds a dedicated Consumer Favorites runtime boundary. It does not reuse Ratings state and does not add a Supabase client, database adapter, migration, RPC, RLS change, grant, Mobile UI route, or production composition.

The only canonical entities are `restaurant` and `menu_item`. A restaurant target contains only `restaurantId`. A menu-item target contains only `restaurantId` and `menuItemId`. Targets reject additional fields, empty identifiers, `fav-*` values, names, array positions, local meal IDs, rating identities, and caller-provided ownership fields.

The public service exposes only:

- `getCurrentUserFavorite(target)`
- `listCurrentUserFavorites(input)`
- `addCurrentUserFavorite(target)`
- `removeCurrentUserFavorite(target)`

No public Favorites service or repository operation accepts `userId` or `user_id`. Authentication is checked through the injected `ConsumerAuthPort`; a missing or unverifiable session fails closed before repository orchestration.

Canonical records expose `favoriteId`, the discriminated target, `collectionLabel`, `sortOrder`, `createdAt`, and `active`. The internal mock `removedAt` timestamp is not exposed as a caller-owned field; it is mapped to the canonical active state.

## Results and lifecycle

Read states remain `available`, `missing`, `disabled`, `unauthenticated`, `invalid_target`, and `read_failed`. List states remain `available`, `empty`, `disabled`, `unauthenticated`, and `read_failed`. Write states remain `added`, `already_present`, `removed`, `already_absent`, `disabled`, `unauthenticated`, `invalid_target`, and `write_failed`.

Duplicate add returns `already_present`. Removing an absent target returns `already_absent`. Remove sets `removedAt` and never deletes a row. Re-adding a removed target inserts a new active row and leaves the historical row unchanged.

## Disabled and mock sources

Read and write sources are independent and accept only `disabled` or `mock`. Both default to `disabled`. Missing values stay disabled. Unsupported values, including `supabase`, create a configuration issue and cannot silently fall back to mock.

The disabled repository returns typed disabled results and does not mutate state. The mock repository is deterministic and accepts an injected clock, ID generator, actor, initial rows, and optional store. A runtime owns a new store unless a caller deliberately injects a shared store. Actor filtering applies to every mock current read, list, add, remove, and contract-history lookup. The service also requires the injected mock actor to match the authenticated session before repository access.

The factory has no network or database side effect. The flag parser reads only the two public Favorites source keys when no explicit environment object is injected; it reads no credential key. Phase 2X-B does not claim that a Supabase adapter is prepared or live verified.

## List contract

`entityType` is required and each list is limited to one entity type. A combined cross-entity cursor is not implemented. Only rows with `removedAt === null` are visible.

Ordering is exact:

1. `sortOrder` ascending, with null last
2. `createdAt` descending
3. `id` ascending

The opaque cursor encodes the tuple `(sortOrder, createdAt, id)`. Page size defaults to 20 and must be an integer from 1 through 50. Invalid entity type, page size, or cursor fails closed as a typed list read failure.

## Retained later-phase hard gates

Phase 2X-B does not resolve or weaken these later-phase gates:

- Development effective ACL verification
- linked-catalog ID representation and target existence
- menu-item parent consistency
- the existing `favorite_menu_items` uniqueness key omitting `restaurant_id`
- proof that `menu_item_id` is globally unique
- authenticated atomic RPC security
- self-made or local-meal Favorites UX
- privacy retention
- quota contract

Phase 2X-C, Phase 2X-D, Phase 2X-E, and Phase 2Y are not started. Development and Production are untouched. `service_role` is unused. N4 remains BLOCKED / NOT EXECUTED.
