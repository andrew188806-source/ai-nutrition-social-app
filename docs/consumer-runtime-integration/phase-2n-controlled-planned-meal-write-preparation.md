# Consumer Runtime Phase 2N

## Controlled Planned Meal Write Preparation

Status: Implementation complete, guard complete, default-smoke-skipped, mock-contract-verified, and freeze-ready.

## Scope

Phase 2N prepares planned meal write contracts only.

It does not add migrations, deploy migrations, change grants, change RLS policies, create RPCs, invoke RPCs, perform Development live writes, perform database writes, create seed or fixture data, change UI routes, change navigation, cut over local demo stores, or start Phase 2O.

## Schema Discovery

Frozen `public.planned_meals` schema:

- primary key: `id uuid primary key default gen_random_uuid()`
- owner column: `user_id uuid not null references auth.users(id) on delete cascade`
- date column: `planned_for date not null`
- meal type: `meal_type meal_type not null`
- restaurant/menu refs: `restaurant_id`, `branch_id`, `menu_item_id`
- title/display field: `display_name_snapshot text not null`
- nutrition field: `planned_nutrition_snapshot jsonb not null default '{}'::jsonb`
- status: `planned_meal_status not null default 'planned'`
- conversion refs: `converted_meal_record_id`, `conversion_idempotency_key`
- notes: `note text`
- timestamps: `created_at`, `updated_at`
- check constraint: `planned_meals_conversion_consistency`
- index: `planned_meals_user_date_idx`
- unique constraint/index: only `planned_meals_conversion_idempotency_idx` when `conversion_idempotency_key is not null`
- RLS: enabled
- owner policy: `planned_meals_owner_all` for all operations using `auth.uid() = user_id`
- authenticated read grant: added in Phase 2M
- active item table: none
- dedicated planned time column: none
- soft-delete column: none

Canonical identity for Phase 2N preparation is row id plus authenticated owner. The schema does not provide a unique `user_id + planned_for` save identity. Phase 2O must choose and implement the live atomic identity before Development writes.

## Contracts

Public write inputs:

- `SaveCurrentUserPlannedMealInput`
- `UpdateCurrentUserPlannedMealInput`
- `RemoveCurrentUserPlannedMealInput`

These inputs do not accept caller-provided user id, owner id, profile id, session, access token, refresh token, raw database row, audit fields, or unrestricted SQL/filter fields.

Nutrition snapshots are validated as finite, non-negative canonical numbers for:

- calories
- protein
- carbohydrates
- fat
- fiber

Unknown fields and caller identity fields fail closed before repository invocation.

Write result statuses:

- `saved`
- `updated`
- `removed`
- `skipped`
- `unavailable`
- `unauthenticated`
- `invalid_input`
- `not_found`
- `forbidden`
- `write_failed`

Results expose operation, source, canonical identity kind, planned meal id when applicable, planned date when applicable, meal type when applicable, nutrition snapshot availability, and non-sensitive error code only.

## Repository Sources

Source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE`

Allowed values:

- `disabled`
- `mock`
- `supabase_prepared`

Default:

- `disabled`

Disabled repository:

- returns deterministic `skipped`
- creates no client
- performs no sign-in, network, database read, database write, or RPC

Mock repository:

- deterministic local contract only
- supports save, repeated save, update, remove, remove missing, and owner-isolation simulation
- uses deterministic mock ids
- uses no network, database, RPC, random ids, or current-time drift

Supabase prepared repository:

- maps future RPC arguments
- records future function names
- returns `unavailable`
- creates no client
- performs no `.from(...)`, `.rpc(...)`, direct insert, update, upsert, delete, network, read, or write

## Future RPC Contracts

Prepared function names:

- `save_authenticated_planned_meal`
- `update_authenticated_planned_meal`
- `remove_authenticated_planned_meal`

Phase 2O prerequisites:

- choose canonical live uniqueness/idempotency identity
- decide save/upsert semantics
- decide update-by-row-id semantics
- decide cancel/remove semantics because there is no soft-delete column
- create atomic authenticated RPCs
- derive owner from `auth.uid()`
- accept no caller-provided user id
- enforce owner isolation
- grant minimum authenticated execute
- revoke anon execute
- keep direct table writes unavailable to the runtime
- verify create/read-after-write, update/read-after-write, remove/read-after-write, owner isolation, and no duplicate behavior

## Shared Runtime Boundary

Phase 2N does not modify:

- Mobile Home route
- Today Intake route
- navigation
- shared overview read semantics
- Phase 2M live planned-meals read adapter
- actual meal records
- Daily Nutrition Summary persistence
- corrections runtime
- consumption adjustments runtime
- ratings/favorites/recommendation feedback runtime
- Restaurant Web or Admin runtime

Planned nutrition remains planned metadata only and is not included in actual consumed totals or daily summary persistence.

## Verification

Scripts:

- `npm run test:consumer-phase2n`
- `npm run test:consumer-phase2n-smoke`
- `npm run test:consumer-phase2n-mock-smoke`

Default smoke:

- `SKIPPED`
- no client
- no sign-in
- no network
- no database read
- no database write
- no RPC

Mock contract smoke verifies:

- valid save
- invalid date
- caller user id rejection
- unknown field rejection
- nutrition validation
- deterministic repeated save
- update
- remove
- remove missing
- owner isolation simulation
- disabled source skipped
- prepared source unavailable
- future RPC mapping excludes caller user id
- no client, network, database, write, or RPC

## Non-Goals

- No migration.
- No migration deployment.
- No grant/RLS change.
- No schema change.
- No RPC creation.
- No RPC invocation.
- No Development live write.
- No Production operation.
- No service-role dependency.
- No seed, fixture, bootstrap, or Auth user creation.
- No UI route or navigation change.
- No local demo cutover.
- No lockfile or dependency change.
- No push.
- No Phase 2O.
