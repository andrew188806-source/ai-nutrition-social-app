# Consumer Runtime Phase 2M

## Development Live Planned Meals Read

Status: Implementation complete, guard complete, development-deployed, development-live-verified, and freeze-ready.

## Scope

Phase 2M activates a Development-only read path for `public.planned_meals`.

It does not implement planned meal creation, update, deletion, conversion, RPC, seed data, fixtures, UI layout changes, navigation changes, production behavior, or Phase 2N.

## Migration

Forward-only migration:

- `20260713080100_consumer_schema_phase_1_3_authenticated_planned_meal_read_grant.sql`

Exact privilege change:

- `GRANT SELECT ON TABLE public.planned_meals TO authenticated`
- `REVOKE ALL ON TABLE public.planned_meals FROM anon`

The migration does not alter schema, tables, columns, indexes, policies, types, views, functions, RLS semantics, direct write privileges, seed data, or fixture data.

## Runtime Source Flag

Source flag:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE`

Allowed values after Phase 2M:

- `disabled`
- `mock`
- `supabase`
- `supabase_prepared` as deprecated fail-closed compatibility

Default:

- `disabled`

Live reads require explicit Development opt-in:

- `EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE=supabase`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_LIVE_READ_OPT_IN=true`
- live Auth enabled
- Consumer writes disabled

## Live Adapter

The live adapter:

- derives identity from the current authenticated session
- reads `public.planned_meals`
- filters by `user_id` and `planned_for`
- maps `planned_nutrition_snapshot` when present
- maps missing/empty nutrition snapshots to canonical `null`
- returns `available` or `empty` when transport succeeds

Frozen schema boundaries:

- no planned meal time column exists, so live `plannedTime` is `null`
- no planned meal item table exists, so live `items` is `[]`
- planned meals remain display metadata only and do not affect actual consumed totals

## Verification

Scripts:

- `npm run test:consumer-phase2m`
- `npm run test:consumer-phase2m-smoke`
- `npm run test:consumer-phase2m-live-smoke`

Default smoke:

- `SKIPPED`
- no client
- no sign-in
- no network
- no database read
- no database write
- no RPC

Development live smoke result:

- sign-in passed
- current-user meal records read passed
- planned meals live read passed with canonical `empty`
- shared Today Intake overview reported `plannedMealsStatus=empty`
- `planned_meals_unavailable` was not emitted
- planned meals did not change actual meal count, item count, or nutrition totals
- repeated planned read was deterministic
- repeated overview read was deterministic
- sign-out passed

No credentials, tokens, sessions, user IDs, record IDs, planned meal IDs, summary IDs, raw rows, raw snapshots, URL, or key were recorded.

## Non-Goals

- No planned meal write.
- No planned meal RPC.
- No direct table write grant.
- No RLS policy change.
- No schema change.
- No planned meal item table.
- No planned time column.
- No seed, fixture, bootstrap, or Auth user creation.
- No Mobile UI or navigation change.
- No Restaurant Web or Admin runtime change.
- No production operation.
- No push.
- No Phase 2N.
