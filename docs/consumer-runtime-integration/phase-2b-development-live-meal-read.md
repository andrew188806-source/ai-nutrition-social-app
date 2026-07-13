# Consumer Runtime Integration Phase 2B - Development Live Meal Read

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development live verification complete. Freeze candidate.

## Scope

Phase 2B verifies the read-only current-user Meal Records runtime against the development Supabase project.

This phase does not wire Mobile UI, change navigation, cut over Home/Today Intake, add Daily Nutrition Summary runtime, add meal writes, add ratings/favorites/recommendation feedback runtime, seed data, create fixtures, use service-role credentials, or touch production.

## Hardening From Phase 2A

- Meal read date validation now rejects impossible calendar dates while accepting valid leap-day dates.
- Supabase meal reads order by `occurred_at desc`, then immutable `id desc`.
- Mock meal reads use the same ordering semantics with `occurredAt desc`, then `mealRecordId desc`.
- The Consumer Meals public barrel no longer exports raw Supabase row/query contracts.
- The mock repository catch path uses typed error narrowing and no `as never` cast.

## Development Grant Migration

Forward-only corrective migration:

- `supabase/migrations/20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql`

Exact scope:

- `grant select on table public.meal_records to authenticated;`
- `grant select on table public.meal_record_items to authenticated;`
- `revoke all on table public.meal_records from anon;`
- `revoke all on table public.meal_record_items from anon;`

The migration does not create or modify tables, columns, constraints, policies, functions, triggers, data rows, seeds, fixtures, RPC, or runtime write paths.

## Runtime Read Contract

Approved runtime API:

- `ConsumerMealRecordsService.listCurrentUserMealRecords(input?)`

The live repository:

- obtains the current canonical session from the Consumer Auth boundary.
- filters `meal_records.user_id` by the authenticated session user.
- filters `deleted_at is null`.
- uses bounded `meal_date` start/end filters.
- uses explicit record and nested item column allowlists.
- maps database rows into canonical `ConsumerMealRecord` and `ConsumerMealRecordItem` values.
- validates meal record owner, meal item owner, and meal item parent record.
- does not accept arbitrary user ID, owner ID, profile ID, or external user identity input.
- does not fall back to mock on auth, transport, or mapping failure.

## Development Live Verification

Development live meal read smoke passed.

Result:

- live flags accepted.
- email sign-in passed.
- canonical session established.
- current meal records read passed.
- result count was `0`.
- canonical empty list passed.
- non-empty live row mapping was skipped because no meal records existed for the authenticated development user.
- sign-out passed.

The smoke did not print email, password, access token, refresh token, session, user ID, record IDs, raw database rows, or `.env.local` contents.

## Guard Commands

- `npm run test:consumer-phase2b`
- `npm run test:consumer-phase2b-live-smoke`

Default live smoke remains skipped unless `TASTKIND_CONSUMER_PHASE2B_LIVE_MEAL_SMOKE=true` is provided in the local environment.

## Explicit Exclusions

No Consumer Runtime insert, update, upsert, delete, RPC, raw SQL execution, seed, fixture, profile bootstrap, meal bootstrap, Storage operation, Realtime subscription, Mobile UI change, navigation change, Home/Today Intake cutover, Daily Nutrition Summary runtime, social runtime, recommendation runtime, ratings/favorites runtime, Admin Consumer Governance, production deployment, or Phase 2C work was implemented.
