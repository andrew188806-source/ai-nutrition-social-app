# Consumer Runtime Phase 2K

## Atomic Development Live Daily Nutrition Summary Persistence

Status: Implementation complete, guard complete, development-deployed, development-live-verified, and freeze-ready.

## Scope

Phase 2K activates the previously prepared daily nutrition summary persistence boundary for the development project only.

The runtime flow remains explicit-smoke-only. Mobile UI, navigation, Home, Today Intake, shared intake hooks, app launch, background work, and meal-read flows do not trigger persistence.

## Atomic RPC

RPC name:

- `persist_authenticated_daily_nutrition_summary`

Migration:

- `supabase/migrations/20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql`

The function:

- requires an authenticated caller
- derives ownership only from `auth.uid()`
- accepts no caller-provided `user_id`
- validates summary date, timezone, calculation version, nutrition totals, meal count, and item count
- atomically inserts or updates one current summary for user/date/timezone/calculation version
- returns a canonical summary row shape for runtime mapping

Security:

- `security definer`
- fixed `search_path = public, pg_temp`
- public execute revoked
- anon execute revoked
- authenticated execute granted
- direct `INSERT`, `UPDATE`, and `DELETE` on `public.daily_nutrition_summaries` remain revoked from authenticated and anon
- no service-role dependency

## Identity And Uniqueness

Canonical persistence identity:

- authenticated current user
- summary date
- timezone
- calculation version
- `is_current = true`

The existing unique index is reused:

- `daily_nutrition_summaries_one_current`

No duplicate current row should be created by repeated persistence with the same identity.

## Runtime Source

Source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE`

Allowed values:

- `disabled`
- `mock`
- `supabase`

Default:

- `disabled`

`supabase` requires explicit development flags and global writes enabled, while meal-record writes remain disabled.

## Runtime Flow

Explicit live smoke flow:

1. sign in through Consumer Auth
2. read current-user meal records
3. select deterministic summary date
4. calculate summary via Phase 2E `calculateDailyNutritionSummary`
5. persist through `persist_authenticated_daily_nutrition_summary`
6. read stored summary
7. compare stored/calculated parity
8. repeat persistence
9. verify one current row for the authenticated user/date identity
10. sign out

Totals come only from current-user meal records and the Phase 2E calculator.

Excluded from persistence totals:

- planned meals
- stored summaries as calculator input
- UI totals
- caller-provided totals
- corrections runtime
- consumption adjustments runtime
- ratings, favorites, or recommendation feedback

## Scripts

- `npm run test:consumer-phase2k`
- `npm run test:consumer-phase2k-smoke`
- `npm run test:consumer-phase2k-live-smoke`

Default smoke:

- `SKIPPED`
- no client
- no sign-in
- no network
- no database read
- no database write
- no RPC
- no credential output

Explicit live smoke requires `TASTKIND_CONSUMER_PHASE2K_LIVE_SUMMARY_PERSISTENCE=true` and development-only public credentials/test credentials. It must not print URL, key, email, password, token, session, user UUID, summary UUID, meal UUID, item UUID, raw rows, or raw RPC response.

Development live verification passed with one current-user meal record and one meal item. The calculated summary totals were 123 kcal, 12 g protein, 18 g carbohydrates, 4 g fat, and 3 g fiber. First persistence, read-after-write, stored/calculated parity, second persistence, duplicate-prevention row count, deterministic repeated persistence, and sign-out all passed.

## Non-Goals

- No UI or navigation changes.
- No automatic write-back.
- No app launch persistence.
- No background or scheduled persistence.
- No seed, fixture, bootstrap, or Auth user creation.
- No planned meal, correction, consumption adjustment, rating, favorite, or recommendation runtime.
- No production deployment.
- No push.
- No Phase 2L.
