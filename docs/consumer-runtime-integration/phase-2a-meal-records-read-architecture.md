# Consumer Runtime Integration Phase 2A - Meal Records Read Architecture

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development live read preparation complete. Development live meal read smoke skipped because Phase 2B has not started.

## Scope

Phase 2A adds the read-only Consumer Meal Records architecture for current-user meal records and meal record items. It prepares the repository/service boundary, mock contract, Supabase live adapter contract, row-to-canonical mappers, typed errors, source switching, and development-only smoke harness placeholder.

Phase 2A does not wire Home, Today Intake, Meal Log, Daily Nutrition Summary, UI, navigation, ratings, favorites, recommendations, social, orders, payments, Admin, or Restaurant runtime to live meal data.

Phase 2A does not create schema migrations, RLS migrations, grants, seeds, fixtures, writes, RPC, raw SQL, production deployment, or Development live meal read verification. Phase 2B was not started.

## Repository Audit

Consumer Schema:

- `meal_records` is the canonical meal event table.
- `meal_record_items` stores item-level display, source, portion, nutrition snapshot, consumed ratio, correction status, and parent meal reference.
- Both tables include `user_id` ownership columns and RLS policies using `auth.uid() = user_id`.
- `meal_record_items` also references the parent `meal_records(id)`; Phase 2A preserves both parent and item ownership checks in the mapper.
- Existing Phase 1.3 deployment has only the profile SELECT corrective grant. Phase 2A adds no meal grants.

Canonical domain:

- Phase 2A introduces `ConsumerMealRecord` and `ConsumerMealRecordItem` in `apps/mobile/features/consumer-meals/types.ts`.
- Public read input is a bounded date range and limit only. It does not accept `userId`, `ownerId`, `profileId`, or `externalUserId`.
- Database rows are mapped into canonical camelCase objects before leaving the repository boundary.

Mock dataset:

- The mock path maps existing canonical demo meal data from `analysisMealRecordStore.ts` through `mapSavedMealRecordToConsumerMealRecord`.
- Mock and live repositories share the same `ConsumerMealRecordsRepository` contract.
- Mock reads do not import Supabase SDK or read live environment variables.

Home / Today Intake:

- Existing screens continue using current demo sources.
- No UI cutover happens in Phase 2A.
- Future Home / Today Intake cutover should call `ConsumerMealRecordsService.listCurrentUserMealRecords()` after Phase 2B live verification is complete.

## Architecture

```text
UI
  -> future screen integration point
    -> ConsumerMealRecordsService
      -> ConsumerMealRecordsRepository
        -> MockConsumerMealRecordsRepository
        -> SupabaseConsumerMealRecordsRepository
          -> injected Supabase-like client
```

Boundaries:

- UI does not import Consumer Meals in Phase 2A.
- UI does not import Supabase SDK.
- Service does not construct Supabase queries.
- Supabase query construction is limited to `adapters/supabaseConsumerMealRecordsRepository.ts`.
- Canonical domain types do not expose raw database rows.

## Read Contract

Public service method:

- `listCurrentUserMealRecords(input?: ConsumerMealReadInput)`

Input:

- `startDate?: string` in `YYYY-MM-DD`
- `endDate?: string` in `YYYY-MM-DD`
- `limit?: number`

Rules:

- no arbitrary user identity input.
- default range is bounded.
- maximum range is 31 days.
- maximum limit is 100.
- results are sorted by `occurredAt` descending.
- empty result maps to an empty canonical list.
- invalid range fails closed with typed `meal_read_invalid_range`.

## Source Switching

Frozen defaults:

```text
AUTH_SOURCE=mock
PROFILE_SOURCE=mock
MEAL_RECORDS_SOURCE=mock
AUTH_ENABLED=false
WRITES_ENABLED=false
```

Development live meal read preparation requires:

```text
AUTH_SOURCE=supabase-live
AUTH_ENABLED=true
MEAL_RECORDS_SOURCE=supabase-live
WRITES_ENABLED=false
```

Invalid combinations fail closed. Live transport, mapping, configuration, or authorization failures do not fall back to mock data.

## Ownership Boundary

Current-user source:

- canonical session from `ConsumerAuthPort.getCurrentSession()`.

Live query:

- table: `meal_records`.
- selected columns: explicit allowlist only.
- filter: `user_id = session.user.userId`.
- filter: `deleted_at is null`.
- filter: bounded `meal_date` range.
- sorted by `occurred_at` descending.
- bounded by `limit`.

Mapper:

- validates each meal record `user_id` equals the authenticated session user.
- validates each meal item `user_id` equals the authenticated session user.
- validates each meal item parent `meal_record_id` matches its parent meal.

RLS remains defense-in-depth; Phase 2A does not bypass or loosen RLS.

## Mapping Behavior

Meal record mapping validates:

- id.
- owner.
- meal type.
- source.
- occurred timestamp.
- meal date.
- timezone.
- created/updated timestamps.

Meal item mapping validates:

- item id.
- parent meal id.
- owner.
- display name.
- nutrition source.
- correction status.
- numeric nutrition values.
- consumed ratio.
- optional confidence score.

Malformed rows fail closed with typed mapping errors. Empty items are allowed and map to `items: []`.

## Typed Errors

Phase 2A adds meal-specific typed errors:

- `meal_source_configuration_invalid`
- `meal_session_missing`
- `meal_session_expired`
- `meal_unauthorized`
- `meal_not_found`
- `meal_read_invalid_range`
- `meal_record_mapping_failed`
- `meal_item_mapping_failed`
- `meal_transport_failed`
- `meal_source_unavailable`

No Supabase raw error, credential, token, session, current user ID, or raw row is exposed to UI.

## Development Live Preparation

Smoke harness:

- `npm run test:consumer-phase2a-live-smoke`

Result for Phase 2A:

```text
SKIPPED - Consumer Runtime Phase 2B has not started.
```

The harness does not create a Supabase client, make a network request, run SQL, create a migration, seed data, create fixtures, write meal records, read raw rows, or print credentials.

## Guards

`npm run test:consumer-phase2a` verifies:

- required Phase 2A files exist.
- SDK imports stay limited to the official Phase 1 lazy loader.
- database query construction is limited to the Supabase meal records adapter.
- no UI, navigation, Restaurant, or Admin wiring.
- no schema migration.
- no service role or secret.
- no writes, RPC, Storage, direct fetch, WebSocket, or `select('*')`.
- no arbitrary user ID input in the meal read API.
- source switching fail-closed behavior.
- bounded read range.
- mock mapping.
- live row mapping.
- current-user ownership.
- transport/mapping/session failures.
- no direct network during guard tests.

## Result

Consumer Runtime Phase 2A is a read architecture and development-live preparation milestone only.

Consumer Runtime Phase 2B was not started.
No UI or navigation changes were made.
No Consumer Runtime write operation was implemented or executed.
No profile bootstrap or automatic profile creation was implemented.
No meal record bootstrap, seed, fixture, insert, update, upsert, delete, RPC, raw SQL, schema migration, RLS migration, or grant migration was implemented.
