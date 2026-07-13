# Consumer Runtime Integration Phase 2D - Atomic Development Live Meal Record Write

Date: 2026-07-13
Status: Implementation complete. Guard complete. Development deployed. Development live write verified. Freeze candidate.

## Scope

Phase 2D activates one development-only current-user meal create path:

- create one `meal_records` row.
- create its `meal_record_items` rows.
- do both inside one PostgreSQL function transaction.
- return an allowlisted canonical meal record response.
- verify read-after-write through the Phase 2B read service.

No update, delete, upsert, correction write, consumption adjustment write, planned meal write, daily summary write, rating/favorite/recommendation feedback runtime, UI cutover, navigation change, seed, fixture, profile bootstrap, meal bootstrap, production deployment, or next phase work is included.

## Migration

Forward-only migration:

- `supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql`

Exact scope:

- creates `public.create_current_user_meal_record(...)`.
- uses `security definer`.
- fixes `search_path` to `public, pg_temp`.
- derives ownership from `auth.uid()`.
- rejects caller-supplied owner and server-managed fields.
- inserts parent and items inside one function transaction.
- returns allowlisted JSON matching the existing meal row mapper.
- revokes function execute from `public` and `anon`.
- grants function execute only to `authenticated`.
- keeps direct table insert/update/delete privileges revoked for `authenticated` and `anon`.

The migration does not modify existing tables, columns, RLS policies, read grants, restaurant schema, seed data, or fixtures.

## Runtime Contract

Approved public method:

- `ConsumerMealRecordWriteService.createCurrentUserMealRecord(input)`

Approved live adapter:

- `SupabaseConsumerMealRecordWriteRepository`

Approved transport:

- one allowlisted RPC: `create_current_user_meal_record`.

Disallowed in runtime source:

- `.from(...).insert(...)`
- sequential parent/item network writes
- update/delete/upsert
- raw SQL
- Storage
- Realtime
- silent fallback to mock
- caller-provided user identity

## Feature Gates

Frozen defaults remain disabled:

- `AUTH_SOURCE=mock`
- `PROFILE_SOURCE=mock`
- `MEAL_RECORDS_SOURCE=mock`
- `AUTH_ENABLED=false`
- `WRITES_ENABLED=false`
- `MEAL_RECORD_WRITES_ENABLED=false`
- `MEAL_RECORD_LIVE_WRITE_OPT_IN=false`

Development live write requires all of:

- `EXPO_PUBLIC_TASTKIND_ENVIRONMENT=development`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE=supabase-live`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED=true`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN=true`
- `TASTKIND_CONSUMER_PHASE2D_LIVE_MEAL_WRITE=true` for the live smoke script.

Production or missing opt-in fails closed.

## Development Verification

Development project:

- `tastkind-development`

Masked ref:

- `msbg...luye`

Deployment:

- Supabase CLI `2.109.1`.
- `db push` applied only migration `20260713050100`.
- local and remote migration history match after deployment.

Development live write smoke passed:

- live meal write flags accepted.
- live auth flags accepted.
- email sign-in passed.
- canonical session mapped.
- atomic RPC write passed.
- one meal item returned.
- read-after-write passed through current-user live meal read.
- sign-out passed.

Sensitive output:

- credentials printed: false.
- token printed: false.
- session printed: false.
- user ID printed: false.
- record IDs printed: false.
- raw rows printed: false.

## Remaining Warnings

- The live smoke creates one persistent development smoke meal record by design. It is not a seed or fixture and is not committed to the repository.
- There is no idempotency key in the frozen meal schema for this create path, so the smoke must remain explicit opt-in and should not be looped.
- Daily Nutrition Summary recalculation remains deferred.
- UI/Home/Today Intake cutover remains deferred.
