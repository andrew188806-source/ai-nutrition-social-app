# Phase 2W Rating Runtime Contract

Status: Phase 2W-A local contract only.

## Frozen schema discovery

### `public.user_restaurant_ratings`

- Primary key: `id uuid default gen_random_uuid()`.
- Ownership: required `user_id uuid`, foreign key to `auth.users(id)` with `on delete cascade`.
- Target: required `restaurant_id text`; it is not a database foreign key.
- Optional meal linkage: `meal_record_id uuid` references `meal_records(id)` with `on delete set null`.
- Rating: required `private_rating numeric`, constrained to the inclusive range 0 through 5. No increment/precision rule is declared.
- Feedback: nullable `taste_feeling`, `portion_feeling`, `price_feeling`, and `repurchase_intent` text.
- Visibility: required text with default `private`; the column has no enum/check constraint.
- Current/history marker: required `is_current boolean` defaulting to true.
- Timestamps: required `rated_at` and `updated_at`, both defaulting to `now()`; there is no `created_at`.
- Current-row uniqueness: one current row per `(user_id, restaurant_id)` through a partial unique index.

### `public.user_menu_item_ratings`

- Primary key: `id uuid default gen_random_uuid()`.
- Ownership: required `user_id uuid`, foreign key to `auth.users(id)` with `on delete cascade`.
- Target: required `restaurant_id text` and `menu_item_id text`; nullable `branch_id text`. None is a database foreign key.
- Optional meal-item linkage: `meal_record_item_id uuid` references `meal_record_items(id)` with `on delete set null`.
- Rating: required `private_rating numeric`, constrained to the inclusive range 0 through 5. No increment/precision rule is declared.
- Menu feedback: nullable `finished boolean`; `dislike_reasons text[]` defaults to an empty array; the four nullable text feedback fields match restaurant ratings.
- Visibility/current/timestamps: the same `visibility`, `is_current`, `rated_at`, and `updated_at` shape as restaurant ratings.
- Current-row uniqueness: one current row per `(user_id, menu_item_id)` through a partial unique index. Restaurant and branch are not part of that index.

## Local canonical contract

- Rating targets are discriminated as `restaurant` or `menu_item`.
- Rating values are finite numbers from 0 through 5 inclusive; fractional values are permitted because the schema does not restrict the step.
- Current records expose private visibility only. Public or aggregate presentation is outside Phase 2W.
- Read lookup and write input never contain an ownership identifier.
- The service checks that a current authenticated session exists, while repositories operate only on the implicit current-user boundary.
- Runtime validation rejects dynamically supplied ownership fields even though the TypeScript input contracts omit them.

## Future authenticated atomic write contract

Phase 2W-D must use an authenticated atomic RPC. Ownership must be derived exclusively from `auth.uid()`. A client may send only the rating target, rating value, schema-supported feedback, and optional meal or meal-item linkage. It must not send `user_id` or receive direct authenticated `INSERT`, `UPDATE`, or `DELETE` privileges.

The function must atomically retire the prior current row and insert its replacement while preserving the partial unique-index invariant. Its SQL name, signature, ACL, and error mapping remain Phase 2W-B/2W-D decisions; Phase 2W-A creates no SQL.
