# Consumer Runtime Phase 2L

## Planned Meals Canonical Read Architecture

Status: Implementation complete, guard complete, default-smoke-skipped, mock-contract-verified, and freeze-ready.

## Scope

Phase 2L prepares planned meals as a canonical read domain for the Consumer runtime.

It does not start Development live planned-meal reads. It does not add migrations, grants, RLS changes, RPCs, writes, seed data, fixtures, UI layout changes, navigation changes, or production behavior.

## Schema Discovery

Frozen Consumer Schema Phase 1.3 contains:

- table: `public.planned_meals`
- date column: `planned_for`
- time column: none
- nutrition field: `planned_nutrition_snapshot`
- status enum: `planned_meal_status`
- RLS: enabled in the frozen RLS migration
- owner policy: `planned_meals_owner_all`
- authenticated SELECT grant: not added as a Phase 2L runtime grant

No `planned_meal_items` table exists in the active frozen schema. Phase 2L therefore models planned meal items as optional canonical child objects derived from a planned meal row or mock contract, not as a separate persistence source.

## Canonical Model

Added canonical types:

- `ConsumerPlannedMeal`
- `ConsumerPlannedMealItem`
- `GetCurrentUserPlannedMealsInput`
- `ConsumerPlannedMealsReadResult`
- `ConsumerPlannedMealsRepository`

The public read input accepts only a planned date. It accepts no user id, session, access token, raw database filter, or ownership field.

Read result statuses:

- `available`
- `empty`
- `unavailable`
- `unauthenticated`
- `invalid_input`
- `read_failed`

Unavailable and empty are intentionally distinct. Empty means the read source is available and no plans exist for the date. Unavailable means the runtime source is disabled or not ready.

## Runtime Source Flag

Source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE`

Allowed values:

- `disabled`
- `mock`
- `supabase_prepared`

Default:

- `disabled`

Unknown values fail closed to `disabled` and register a runtime issue.

## Repository Sources

Disabled source:

- returns canonical `unavailable`
- creates no client
- performs no network request
- performs no database read or write

Mock source:

- deterministic local contract data
- supports available, empty, unavailable smoke coverage
- stable sort by planned date, planned time, and canonical id
- planned nutrition remains separate from actual consumed totals

Supabase prepared source:

- records the frozen `planned_meals` table and column mapping
- returns canonical unavailable because Phase 2M live read has not started
- creates no client
- performs no `.from(...).select(...)`
- performs no RPC

## Shared Overview Integration

`ConsumerTodayIntakeOverviewService` now integrates through `ConsumerPlannedMealsService`.

When planned meals are unavailable:

- overview remains usable
- `plannedMealsStatus` is `unavailable`
- warning includes `planned_meals_unavailable`
- actual meal count, item count, and nutrition totals are unchanged

When planned meals are empty:

- `plannedMealsStatus` is `empty`
- no `planned_meals_unavailable` warning is added

When planned meals are available:

- planned meal display metadata is included in `plannedMeals`
- estimated planned nutrition is not added to actual consumed totals

## Verification

Scripts:

- `npm run test:consumer-phase2l`
- `npm run test:consumer-phase2l-smoke`
- `npm run test:consumer-phase2l-mock-smoke`

Default smoke:

- `SKIPPED`
- no client
- no sign-in
- no network
- no database read
- no database write
- no RPC
- no credentials printed

Mock contract smoke verifies:

- available planned meals
- empty planned meals
- unavailable planned meals
- date filtering
- deterministic sorting
- repeated read identity
- shared overview integration
- planned nutrition excluded from actual totals
- no client, network, database read, database write, or RPC

## Non-Goals

- No migration.
- No grant or RLS change.
- No Development live planned meal read.
- No planned meal write.
- No planned meal RPC.
- No direct Supabase query.
- No UI layout or navigation change.
- No corrections runtime.
- No consumption adjustments runtime.
- No ratings, favorites, or recommendation feedback runtime.
- No seed, fixture, bootstrap, or production operation.
- No push.
- No Phase 2M.

## Phase 2M Prerequisites

Phase 2M should add and verify only after explicit approval:

- confirmed live planned-meal read table/column contract
- minimal authenticated SELECT grant if required
- RLS ownership verification
- Development-only deployment verification
- live repository implementation
- explicit live opt-in smoke
- available and empty live read verification
- actual/planned nutrition separation verification
- no write and no production boundary
