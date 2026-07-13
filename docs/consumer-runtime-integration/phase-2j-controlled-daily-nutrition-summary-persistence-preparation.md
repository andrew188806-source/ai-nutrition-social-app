# Consumer Runtime Phase 2J

## Controlled Daily Nutrition Summary Persistence Preparation

Status: Implementation complete, guard complete, default smoke skipped, mock contract smoke verified. Phase 2K not started.

## Scope

Phase 2J prepares the runtime boundary for persisting a current user's daily nutrition summary after recalculating it from canonical meal records.

This phase does not activate live persistence. It adds no migration, RLS change, grant, seed, fixture, remote database operation, UI change, navigation change, or production deployment.

## Canonical Contract

Public service boundary:

- `ConsumerDailyNutritionSummaryPersistenceService.persistCurrentUserDailyNutritionSummary(input)`
- `input.summaryDate` is the only caller-provided public input.

The caller must not provide:

- user id
- profile id
- access token
- session
- raw Supabase payload
- nutrition totals
- meal count
- item count

Identity is derived only as the authenticated current user plus the summary date. The prepared persistence identity is documented as `authenticated_user_summary_date`.

## Calculate Before Persist

The persistence service reads current-user meal records for the requested date through the existing Meal Records service, then uses the Phase 2E pure calculator:

- `calculateDailyNutritionSummary(input)`

The service does not read stored daily summaries, planned meals, corrections, consumption adjustments, ratings, recommendations, or UI state to calculate persistence totals.

## Source Switching

New source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE`

Allowed values:

- `disabled`
- `mock`
- `supabase_prepared`

Default:

- `disabled`

`supabase_prepared` is development-only and fails closed if runtime write flags are enabled. It maps the future RPC payload shape but does not invoke RPC.

## Repository Implementations

Implemented repositories:

- Disabled: `SupabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository`
- Mock: `MockConsumerDailyNutritionSummaryPersistenceRepository`
- Prepared Supabase mapper: `SupabasePreparedConsumerDailyNutritionSummaryPersistenceRepository`

The disabled repository returns `skipped`.

The mock repository stores deterministic in-memory summaries keyed by summary date, timezone, and calculation version. It creates no random ids, no Supabase client, no network request, and no database write.

The prepared Supabase repository exports the future mapper for:

- `persist_authenticated_daily_nutrition_summary`

It does not call `.rpc(...)`, create a client, read a session, or touch the database.

## Future RPC Contract

Future RPC name:

- `persist_authenticated_daily_nutrition_summary`

Prepared argument mapping:

- `p_summary_date`
- `p_timezone`
- `p_calculation_version`
- `p_total_calories`
- `p_total_protein_g`
- `p_total_carbohydrates_g`
- `p_total_fat_g`
- `p_total_fiber_g`
- `p_meal_count`
- `p_item_count`
- `p_source_cutoff_at`
- `p_recalculated_at`

Phase 2K must create and verify the database function, ownership semantics, grants, RLS interaction, and live smoke before runtime invocation is allowed.

## Schema Alignment

Prepared table:

- `public.daily_nutrition_summaries`

Existing identity shape:

- `user_id`
- `local_date`
- `timezone`
- `calculation_version`
- `is_current = true`

Existing unique identity index:

- one current summary per user, local date, timezone, and calculation version.

Phase 2J does not change schema, grants, RLS policies, or data.

## Guards And Smoke

Scripts:

- `npm run test:consumer-phase2j`
- `npm run test:consumer-phase2j-smoke`
- `npm run test:consumer-phase2j-mock-smoke`

Default smoke result:

- `SKIPPED`
- no client
- no network
- no database read
- no database write
- no RPC

Mock contract smoke:

- explicit package script only
- deterministic
- local-only
- no Supabase client
- no network
- no database read/write
- no RPC

## Explicit Non-Goals

- No live summary persistence.
- No database function creation.
- No grants or RLS changes.
- No migration.
- No seed or fixture.
- No UI or navigation wiring.
- No Home / Today Intake behavior change.
- No Meal Log cutover.
- No Consumer Runtime Phase 2K.
