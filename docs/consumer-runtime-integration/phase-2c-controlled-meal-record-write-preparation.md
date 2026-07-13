# Consumer Runtime Integration Phase 2C - Controlled Meal Record Write Preparation

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development live write smoke hard-skipped. Freeze candidate.

## Scope

Phase 2C prepares the canonical Consumer Meal Record create boundary without activating live database writes.

Approved runtime API:

- `ConsumerMealRecordWriteService.createCurrentUserMealRecord(input)`

Canonical create input:

- record fields: `mealType`, `occurredAt`, `mealDate`, optional `timezone`, `title`, `note`, `source`, and `items`.
- item fields: optional restaurant/menu references, display snapshot fields, portion, nutrition snapshot, nutrition source, source entity version, confidence score, and consumed ratio.

Rejected input:

- ownership fields such as `userId`, `ownerId`, `profileId`, `externalUserId`, and snake-case variants.
- server-managed fields such as `id`, `mealRecordId`, `mealRecordItemId`, `createdAt`, `updatedAt`, `deletedAt`, and snake-case variants.
- unknown top-level or item fields.

## Runtime Boundary

The mock write repository can create canonical in-memory meal records for guard verification only.

The Supabase disabled write repository always returns a typed `meal_write_disabled` result.

The Supabase live write repository validates the authenticated session and create input, then returns `meal_write_atomicity_not_supported`. It does not call Supabase transport, does not insert parent or item rows, and does not attempt partial writes.

Phase 2D must provide the approved atomic parent-and-items write strategy, grants, RLS verification, and development live write smoke before any real write can execute.

## Feature Gates

Defaults remain fail-closed:

- `AUTH_SOURCE=mock`
- `MEAL_RECORDS_SOURCE=mock`
- `AUTH_ENABLED=false`
- `WRITES_ENABLED=false`
- `MEAL_RECORD_WRITES_ENABLED=false`

Mock write preparation requires both the global writes flag and meal-record write flag in fake guard tests. Supabase live meal writes remain blocked in Phase 2C even when both write flags are true.

## Guard Commands

- `npm run test:consumer-phase2c`
- `npm run test:consumer-phase2c-live-smoke`

The live smoke result is intentionally:

`SKIPPED - Consumer Runtime Phase 2D has not started.`

## Explicit Exclusions

No Mobile UI change, navigation change, Home/Today Intake cutover, Daily Nutrition Summary runtime, social runtime, recommendation runtime, ratings/favorites runtime, Restaurant Web runtime, Admin runtime, schema migration, RLS migration, grant migration, remote migration, SQL execution, seed, fixture, insert, update, upsert, delete, RPC, Storage operation, Realtime subscription, production connection, or Phase 2D work was implemented.
