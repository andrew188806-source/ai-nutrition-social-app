# Consumer Runtime Integration Phase 2E - Daily Nutrition Summary Read Architecture and Recalculation Design

Date: 2026-07-13
Status: Implementation complete. Guard complete. Live summary verification skipped. Freeze candidate.

## Scope

Phase 2E prepares the Consumer Daily Nutrition Summary runtime boundary without enabling live reads or persistence.

Included:

- Canonical daily nutrition summary type.
- Current-user daily summary read service and repository contract.
- Mock repository based on canonical mock meal records.
- Disabled repository for fail-closed behavior.
- Prepared Supabase read adapter for `daily_nutrition_summaries`.
- Pure deterministic recalculation engine.
- Stored vs calculated parity comparison.
- Phase 2E guard and hard-skipped live smoke.

Not included:

- Development live summary read.
- Summary insert, update, upsert, delete, or persistence.
- Remote migration, RLS change, grant change, RPC, trigger, seed, fixture, or production deployment.
- UI, navigation, Home, Today Intake, Meal Log, Daily Summary UI, ratings, favorites, recommendation feedback, social, orders, payments, or Admin runtime work.

## Schema Audit

Frozen table:

- `daily_nutrition_summaries`

Schema facts:

- Ownership key: `user_id` references `auth.users(id)`.
- Date key: `local_date`.
- Timezone key: `timezone`.
- Current uniqueness is modeled by `daily_nutrition_summaries_one_current` on `(user_id, local_date, timezone, calculation_version)` where `is_current = true`.
- Stored nutrition fields: `total_calories`, `total_protein_g`, `total_carbohydrates_g`, `total_fat_g`, `total_fiber_g`.
- Metadata fields: `calculation_version`, `source_cutoff_at`, `recalculated_at`, `is_current`.
- RLS policy draft: `daily_summaries_owner_read` using `auth.uid() = user_id`.
- Authenticated SELECT grant: not yet added as a forward-only migration.

Phase 2E therefore does not enable live summary reads. A future development-live read phase must add and verify the minimal authenticated SELECT grant before using the prepared adapter.

## Source of Truth

Actual consumed nutrition source:

- `meal_records`
- `meal_record_items`

Derived projection:

- `daily_nutrition_summaries`

Phase 2E treats stored summaries as a cached projection. Recalculation uses canonical meal item nutrition only and does not double count record totals. Planned meals are not mixed into actual consumed totals.

Deferred rules:

- Meal corrections are fail-closed until correction selection and materialization rules are frozen.
- Consumption adjustments are fail-closed until adjustment application rules are frozen.
- Planned meals remain outside actual consumed totals.

## Runtime Contract

Public read method:

- `ConsumerDailyNutritionSummaryService.getCurrentUserDailyNutritionSummary(input)`

Input:

- `summaryDate`
- optional `timezone`

The input does not accept `userId`, `ownerId`, `profileId`, or external identity fields. Current user identity is always derived from the auth boundary in live repository preparation.

Missing stored summary behavior:

- Typed `daily_summary_not_found`.

## Recalculation

Public functions:

- `calculateDailyNutritionSummary(input)`
- `compareStoredAndCalculatedDailyNutritionSummary(stored, calculated, tolerance)`

Rules:

- Pure and deterministic.
- No `Date.now()`, `new Date()`, environment access, storage, network, Supabase SDK, or UI dependency.
- Uses item totals and item `consumedRatio`.
- Excludes other dates.
- Empty day returns zero nutrition with `calculationStatus: "missing"`.
- Invalid nutrition returns typed `daily_summary_invalid_nutrition`.
- Corrections and consumption adjustments return typed `daily_summary_rule_unavailable` until their rules are frozen.
- Parity comparison never writes and returns deterministic differences.

## Feature Flags

New source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE`

Allowed values:

- `mock`
- `supabase-disabled`
- `supabase-live`

Frozen default:

- `mock`

Phase 2E behavior:

- `supabase-live` fails closed because development live summary reads have not started.
- Unknown values fail closed.
- Mock path creates no Supabase client and makes no network request.
- No silent fallback from live transport or mapping errors to mock.

## Verification

Commands:

- `npm run test:consumer-phase2e`
- `npm run test:consumer-phase2e-live-smoke`

Live smoke result:

- `SKIPPED - Consumer Runtime Daily Nutrition Summary live verification has not started.`

Guard coverage:

- No UI change.
- No navigation change.
- No migration inventory change.
- No summary write.
- No RPC.
- No raw SQL.
- No service role.
- No secret.
- No production.
- No direct network request.
- Pure deterministic recalculation.
- Planned meals separated from actual consumed totals.

## Remaining Warnings

- Authenticated SELECT grant for `daily_nutrition_summaries` is not deployed yet.
- Development live summary read is not verified.
- Correction and consumption adjustment application rules are deferred.
- Stored summary `itemCount` is not present in the frozen table; stored-row mapping returns `itemCount: 0` and parity should compare item count only when a calculated summary is available.
- Phase 2D created one persistent development smoke meal record; Phase 2E does not read it live.
