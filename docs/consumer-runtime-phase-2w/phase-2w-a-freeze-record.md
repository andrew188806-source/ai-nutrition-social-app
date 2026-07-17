# Phase 2W-A Freeze Record

Phase: Consumer Runtime Phase 2W-A — Ratings Contract and Local Architecture

## Identity

- Starting HEAD: `65862d35363411ece9191bdd1d06a672ff9802ef`
- Freeze date: 2026-07-17
- Branch: `main`

## ChatGPT authorization

ChatGPT formally reviewed and authorized Phase 2W-A local architecture Freeze. Judgment criteria satisfied: guard 50/50, contract smoke 26/26, typecheck pass, canonical audit pass, migration count unchanged, no Supabase/network/credential/service_role/database write, default read=mock, default write=disabled, fail-closed on invalid and disabled sources, future write confirmed authenticated atomic RPC with auth.uid() ownership, npm ls --depth=0 pass, pre-existing ELSPROBLEMS accepted as P2W-A-DEP-001.

## Phase 2W-A file scope — 20 original files

Runtime (10 files under `apps/mobile/features/consumer-ratings/`):

- `errors.ts`
- `types.ts`
- `ports.ts`
- `validation.ts`
- `consumerRatingService.ts`
- `featureFlags.ts`
- `factories.ts`
- `index.ts`
- `adapters/mockConsumerRatingRepository.ts`
- `adapters/disabledConsumerRatingRepository.ts`

Documentation (6 files under `docs/consumer-runtime-phase-2w/`):

- `implementation-plan.md`
- `rating-runtime-contract.md`
- `architecture-and-source-modes.md`
- `known-issues-and-deferrals.md`
- `phase-transition-decision.md`
- `validation-plan.md`

Roadmap (1 file):

- `docs/tastkind-runtime-integration-roadmap.md`

Validation scripts (2 files under `scripts/`):

- `consumer-ratings-phase-2w-a-guard.mjs`
- `consumer-ratings-phase-2w-a-contract-smoke.mjs`

Package (1 file):

- `package.json` (two Phase 2W-A scripts added only)

Freeze commit total: 21 files (20 originals + `phase-2w-a-freeze-record.md`).

## Schema discovery summary

### `public.user_restaurant_ratings`

- Primary key: `id uuid` generated via `gen_random_uuid()`.
- Ownership: `user_id uuid` NOT NULL, FK to `auth.users(id)` with `ON DELETE CASCADE`.
- Target: `restaurant_id text` NOT NULL; no database FK.
- Optional meal linkage: `meal_record_id uuid` nullable, FK to `meal_records(id)` with `ON DELETE SET NULL`.
- Rating: `private_rating numeric` NOT NULL, constrained 0–5. No step/precision restriction.
- Feedback: nullable `taste_feeling`, `portion_feeling`, `price_feeling`, `repurchase_intent` text.
- Visibility: `visibility text` NOT NULL, default `'private'`; no enum constraint.
- Current marker: `is_current boolean` NOT NULL, default `true`.
- Timestamps: `rated_at`, `updated_at`; both default `now()`; no `created_at`.
- Current-row uniqueness: partial unique index on `(user_id, restaurant_id)` where `is_current`.

### `public.user_menu_item_ratings`

- Primary key: `id uuid` via `gen_random_uuid()`.
- Ownership: `user_id uuid` NOT NULL, FK to `auth.users(id)` with `ON DELETE CASCADE`.
- Target: `restaurant_id text` and `menu_item_id text` NOT NULL; nullable `branch_id text`. No database FKs.
- Optional meal-item linkage: `meal_record_item_id uuid` nullable, FK to `meal_record_items(id)` with `ON DELETE SET NULL`.
- Rating: `private_rating numeric` NOT NULL, constrained 0–5.
- Menu feedback: nullable `finished boolean`; `dislike_reasons text[]` defaults to `'{}'`.
- Visibility/current/timestamps: same shape as restaurant ratings.
- Current-row uniqueness: partial unique index on `(user_id, menu_item_id)` where `is_current`. Restaurant and branch are excluded from this index.

## Local contracts, ports, mock, disabled, service, factory

### Contracts (types.ts)

- `ConsumerRatingReadSource`: `"mock" | "disabled"`.
- `ConsumerRatingWriteSource`: `"mock" | "disabled"`.
- `ConsumerRatingValue`: `number`.
- Lookup types: `ConsumerRestaurantRatingLookup` (kind="restaurant", restaurantId) and `ConsumerMenuItemRatingLookup` (kind="menu_item", menuItemId).
- Target types extend lookups with optional meal/meal-item linkage; no ownership fields.
- Result discriminated unions: `available | missing | disabled | unauthenticated | invalid_input | read_failed | write_failed`.
- Record types: `ConsumerCurrentRestaurantRatingRecord` and `ConsumerCurrentMenuItemRatingRecord` share a base of `ratingId, ratingValue, visibility, isCurrent, feedback, ratedAt, updatedAt`.
- `visibility` is always `"private"`.

### Ports (ports.ts)

- `ConsumerRatingReadRepository`: `getCurrentUserRestaurantRating`, `getCurrentUserMenuItemRating`, `listCurrentUserRatings`. No ownership argument.
- `ConsumerRatingWriteRepository`: `createOrReplaceCurrentUserRating`. No ownership argument.

### Validation (validation.ts)

- `hasOwnershipField` detects `userId` or `user_id` at runtime and rejects with `rating_ownership_field_rejected`.
- Rating value must be `Number.isFinite(v) && v >= 0 && v <= 5`.
- Lookup and write target validation is applied before repository operations.

### Mock repository (mockConsumerRatingRepository.ts)

- Fixtures are constructor-injected and deep-cloned; default fixtures are deterministic.
- Clock is injectable; default is a fixed ISO timestamp.
- No `Date.now()`, `Math.random()`, or wall-clock dependency.
- `createOrReplaceCurrentUserRating`: marks prior current row `isCurrent: false`, appends new current row.
- History is preserved; `assertSingleCurrentRecordPerTarget` enforces single current row per target.
- Restaurant and menu-item target keys use isolated namespaces (`restaurant:<id>` vs `menu_item:<id>`).

### Disabled repository (disabledConsumerRatingRepository.ts)

- All read and write methods return `{ status: "disabled", error: ConsumerRatingReadDisabledError | ConsumerRatingWriteDisabledError }`.
- Never delegates to another source.

### Service (consumerRatingService.ts)

- Requires injected `ConsumerAuthPort`.
- Checks for a current authenticated session before any repository call.
- Validation is applied before auth check for write; for read, auth check follows validation.
- Catches unexpected repository exceptions and returns typed `read_failed` or `write_failed`.

### Feature flags (featureFlags.ts)

- Reads `EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE` and `EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_WRITE_SOURCE` from env.
- Unknown value: records an issue and returns `"disabled"`. Does not fall back to `"mock"`.

### Factory (factories.ts)

- `createConsumerRatingRepositories`: resolves read and write repositories from flags; rejects if flags have any issues.
- `createConsumerRatingRuntime`: additionally requires an explicit `ConsumerAuthPort`; throws `ConsumerRatingConfigurationInvalidError` if absent.
- No silent fallback to mock on error.

## Default source modes

| Source | Default |
|---|---|
| Read source | `mock` (absent env var) |
| Write source | `disabled` (absent env var) |
| Invalid read env | `disabled` (not mock) |
| Invalid write env | `disabled` (not mock) |

## Future authenticated atomic write decision

Phase 2W-D must use an authenticated atomic RPC. Ownership is derived exclusively from `auth.uid()`. A client sends only the rating target, rating value, feedback, and optional linkage. It must not send `user_id` and must not receive direct `INSERT`, `UPDATE`, or `DELETE` authenticated privileges. The RPC name, signature, ACL, and error mapping are Phase 2W-B/2W-D decisions; Phase 2W-A creates no SQL.

## Guard result

Guard: 50/50 PASS. No failures. Migration count = 33, latest = `20260716060000_restore_restaurant_internal_reader_set_option.sql`. No generated artifacts, no staged diff, no UI cutover.

## Contract smoke result

Contract smoke: 26/26 PASS. TypeScript contract compilation passed. All behavioral checks passed: restaurant and menu-item reads, missing lookup, deterministic list, current-row replacement with history, target namespace isolation, invalid rating values, ownership rejection, disabled typed errors, invalid-source no-fallback, authentication gate, factory auth requirement.

## Typecheck and canonical audit

- Root typecheck (`npm run typecheck`): PASS.
- Mobile workspace typecheck: PASS.
- Canonical data audit (`node scripts/audit-canonical-data.mjs`): PASS.

## Dependency validation

- `npm ls --depth=0`: PASS.
- `npm ls --all`: **pre-existing ELSPROBLEMS present** — not PASS. See P2W-A-DEP-001 in known-issues-and-deferrals.md. This is a pre-existing full recursive dependency-tree inconsistency. Phase 2W-A did not add, remove, or upgrade any dependency. `package-lock.json` is unchanged. Manifest pins are unchanged. This does not block local architecture Freeze.

## Migration state

- Migration count: 33 (unchanged from baseline).
- Latest migration: `20260716060000_restore_restaurant_internal_reader_set_option.sql`.
- Migration diff: empty.

## No Supabase / network / credential / service_role / database write

- No `@supabase/` import in any Phase 2W-A runtime source.
- No `fetch`, `XMLHttpRequest`, `WebSocket`, or `axios` call.
- No database table name (`user_restaurant_ratings`, `user_menu_item_ratings`) in runtime source.
- No `.rpc()` call.
- No `service_role` reference.
- No credential accessed or output.
- No network call made.
- No database read or write performed.

## N4 status

N4: BLOCKED / NOT EXECUTED. N4 gates remain open and unmodified. This phase has no N4 scope.

## Production

Production: UNTOUCHED. No Production operation was performed.

## Phase 2W-B status

Phase 2W-B: NOT STARTED. Schema/ACL review and migration drafting have not begun.

## Push status

Commit not pushed. Remote is unchanged.
