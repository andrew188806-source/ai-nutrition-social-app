# Consumer Runtime Integration Phase 2G - Home / Today Intake Shared Runtime Read Model Preparation

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development live shared-model verification skipped by design. Freeze candidate.

## Scope

Phase 2G prepares a canonical shared read model for future Home and Today Intake cutover. It introduces `getCurrentUserTodayIntakeOverview(input?)` without wiring Mobile UI, changing navigation, or executing a development live read.

Included:

- Existing Home / Today Intake data-origin audit.
- Canonical `ConsumerTodayIntakeOverview` type.
- Shared orchestration service for current-user meal records, calculated daily nutrition, optional stored summary, and optional planned meals.
- Deterministic date handling through an injected clock and explicit timezone.
- Empty / partial / error metadata.
- Mock-only contract verification.
- Hard-skipped live shared-model smoke.

Not included:

- Home UI cutover.
- Today Intake UI cutover.
- UI or navigation changes.
- Summary write-back, insert, update, upsert, delete, seed, fixture, or bootstrap.
- New migration, grant, RLS, SQL, remote Supabase operation, RPC, production deployment, or push.
- Corrections runtime, consumption adjustments runtime, ratings, favorites, recommendation feedback, social, orders, payments, or Admin Consumer Governance.

## Existing Flow Audit

Current Home route:

- File: `apps/mobile/app/index.tsx`.
- Reads demo meal records from `getTodayMealRecords()`.
- Computes nutrition locally with `calculateTodayNutritionSummary(...)`.
- Maps meal slots through `mapMealRecordsToMealSlots(...)`.
- Reads planned dinner from the existing planned meal store.
- Does not import Consumer Supabase SDK or Consumer Runtime adapters.

Current Today Intake route:

- File: `apps/mobile/app/today-intake.tsx`.
- Reads demo meal records from `getTodayMealRecords()`.
- Computes nutrition locally with `calculateTodayNutritionSummary(...)`.
- Reads planned meal state from the existing planned meal store.
- Does not import Consumer Supabase SDK or Consumer Runtime adapters.

Current duplicated source risk:

- Home and Today Intake each compose their own route-level view model.
- Both still use the legacy analysis meal record store until a future UI cutover.
- Nutrition totals are calculated locally today, while Phase 2G prepares the shared service that will become the future single read model.

## Shared Read Model

Type: `ConsumerTodayIntakeOverview`

Fields include:

- `date`
- `timezone`
- `meals`
- `calculatedNutrition`
- `storedNutrition`
- `storedSummaryStatus`
- `mealCount`
- `itemCount`
- `actualConsumedStatus`
- `plannedMeals`
- `plannedMealsStatus`
- `provenance`
- `warnings`
- `status`
- `generatedAt`

The model does not expose arbitrary `userId`, `ownerId`, `profileId`, raw database rows, Supabase responses, UI colors, icons, layout fields, translated strings, or navigation routes.

## Shared Service Architecture

Public method:

- `ConsumerTodayIntakeOverviewService.getCurrentUserTodayIntakeOverview(input?)`

Factory:

- `createConsumerTodayIntakeOverviewService(flags, dependencies)`

Orchestration:

- Reuses `ConsumerMealRecordsService` for current-user meal records.
- Reuses `ConsumerDailyNutritionSummaryService` for optional stored daily summary reads.
- Reuses `calculateDailyNutritionSummary(...)` for actual consumed nutrition.
- Reuses `compareStoredAndCalculatedDailyNutritionSummary(...)` for parity metadata.
- Accepts an optional `ConsumerPlannedMealsRepository`.

The shared service does not import the Supabase SDK, construct database queries, create a second client lifecycle, use RPC, perform writes, or execute raw SQL.

## Source-Of-Truth Rules

Actual consumed meals:

- Source: current-user `meal_records` and `meal_record_items` through the existing read service contract.
- Date filter: exact canonical calendar date.
- Ordering and filtering remain delegated to the Phase 2A / 2B meal read service.

Actual nutrition:

- Source: Phase 2E pure deterministic calculator.
- Stored daily summaries remain cached projections only.
- Stored summary not-found does not make actual consumed totals fail.
- Stored summary item count remains unavailable when the frozen table does not persist item count.

Planned meals:

- Kept separate from actual consumed totals.
- Do not increase actual meal count or nutrition totals.
- Marked unavailable unless an explicit planned meals repository is injected.

## Date And Timezone

- Input accepts only `{ date?: "YYYY-MM-DD" }`.
- Default date comes from the injected clock.
- Timezone defaults to `Asia/Taipei`.
- The service validates real calendar dates and does not use UTC substring slicing.
- Tests use deterministic injected clocks.

## Result Semantics

Complete:

- Meal read succeeded.
- Calculation succeeded.
- One or more actual consumed meals exist.
- No blocking partial warning exists.

Empty:

- Meal read succeeded.
- Calculation succeeded.
- Zero actual consumed meals exist.
- Empty is not treated as transport failure.

Partial:

- Meal read and calculation succeeded, but stored parity failed, stored summary errored, or planned meal loading errored.

Error:

- Returned as typed `ConsumerAuthResult` errors for auth, invalid date, meal transport, or calculation failures.

## Feature Flags

Defaults remain mock:

- `AUTH_SOURCE=mock`
- `PROFILE_SOURCE=mock`
- `MEAL_RECORDS_SOURCE=mock`
- `DAILY_NUTRITION_SOURCE=mock`
- `AUTH_ENABLED=false`
- `WRITES_ENABLED=false`
- `MEAL_RECORD_WRITES_ENABLED=false`

The overview factory rejects mixed meal and daily nutrition sources and rejects write-enabled runtime flags. There is no silent fallback from live to mock.

## Verification

Guard:

- `npm run test:consumer-phase2g`

Live shared-model smoke:

- `npm run test:consumer-phase2g-live-smoke`
- Result: `SKIPPED - Consumer Runtime Home/Today Intake shared live verification has not started.`

The live smoke creates no Supabase client, performs no authentication, performs no network request, reads no meals or summaries, writes nothing, uses no RPC, executes no SQL, creates no migration, seed, fixture, or production operation, and starts no next phase.

## Future Cutover Points

Home can later replace route-local summary composition with the shared overview fields:

- `calculatedNutrition`
- `mealCount`
- `actualConsumedStatus`
- `plannedMeals`
- `status`

Today Intake can later replace route-local meal list and nutrition composition with:

- `meals`
- `calculatedNutrition`
- `storedNutrition`
- `storedSummaryStatus`
- `plannedMeals`
- `provenance`
- `warnings`
- `status`

Future cutover must preserve the current UI layout and remain current-user scoped.

## Boundaries

- No UI change.
- No navigation change.
- No migration.
- No remote Supabase operation.
- No seed or fixture.
- No Consumer Runtime write.
- No summary persistence.
- No RPC.
- No service-role key.
- No secret output.
- No production deployment.
- Consumer Runtime Phase 2H was not started.
