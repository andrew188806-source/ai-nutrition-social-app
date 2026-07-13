# Consumer Runtime Integration Phase 2F - Development Live Daily Nutrition Summary Read

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development deployment complete. Development live verification complete. Freeze candidate.

## Scope

Phase 2F enables development-only live reads of the cached Consumer Daily Nutrition Summary projection and compares the stored row with an in-memory recalculation from current-user meal records.

Included:

- Forward-only authenticated SELECT grant for `public.daily_nutrition_summaries`.
- Explicit development-only live read flag.
- Daily summary factory wiring for the prepared Supabase read adapter.
- Opt-in Development live smoke for summary read plus meal-read recalculation parity.
- Stored summary `itemCount` unavailable semantics.

Not included:

- Summary insert, update, upsert, delete, write-back, trigger, RPC, seed, fixture, bootstrap, or automatic summary creation.
- UI, navigation, Home, Today Intake, Meal Log, ratings, favorites, recommendations, social, Restaurant Web, Admin, production, or Phase 2G work.

## Runtime Flags

Live summary reads require all of:

- `EXPO_PUBLIC_TASTKIND_ENVIRONMENT=development`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=false`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED=false` or unset

Defaults remain mock and no silent fallback is allowed.

## Migration

New migration:

- `supabase/migrations/20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql`

Privileges:

- Grants only `SELECT` on `public.daily_nutrition_summaries` to `authenticated`.
- Revokes all privileges on `public.daily_nutrition_summaries` from `anon`.
- Does not grant writes, grant anon access, change RLS, change policies, change schema objects, or create data.

RLS remains the row ownership boundary through the frozen `auth.uid() = user_id` policy.

## Read And Parity Behavior

Live summary read:

- Derives current user from the Auth boundary.
- Filters by `user_id`, `local_date`, `timezone`, and `is_current`.
- Uses an explicit column allowlist.
- Returns typed `daily_summary_not_found` when no stored row exists.

Parity:

- Reads current-user meal records for the selected summary date.
- Recalculates in memory with `calculateDailyNutritionSummary(input)`.
- Compares stored vs calculated totals when a stored summary exists.
- Skips parity when the stored summary is missing.
- Skips `itemCount` comparison because the frozen `daily_nutrition_summaries` table does not persist item count.
- Never writes recalculated values back to the database.

## Verification Commands

- `npm run test:consumer-phase2f`
- `npm run test:consumer-phase2f-live-smoke`

The live smoke is skipped unless `TASTKIND_CONSUMER_PHASE2F_LIVE_SUMMARY_READ=true` is explicitly set.

Development live result:

- Authenticated sign-in passed.
- Current-user meal records read passed.
- Current-user `daily_nutrition_summaries` read was authorized and returned typed not-found because no stored summary row existed for the selected date.
- In-memory recalculation from current-user meals passed.
- Stored/calculated parity was skipped because the stored summary row was missing.
- Sign-out passed.
- No credentials, tokens, sessions, user IDs, record IDs, summary IDs, raw rows, or row contents were printed.
- No database write, RPC, SQL, seed, fixture, production deployment, or next phase work was executed.

## Boundaries

- No service-role key.
- No SQL execution from runtime.
- No summary write operation.
- No RPC.
- No seed or fixture creation.
- No UI or navigation change.
- No production deployment.
- Consumer Runtime Phase 2G was not started.
