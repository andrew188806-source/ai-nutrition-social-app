# Consumer Schema Runtime Handoff

Date: 2026-07-12
Status: Future handoff. Runtime integration is deferred.

## Current Mock/Runtime Sources

- Community/profile settings: `apps/mobile/features/community-card-settings/*` and Meal Buddy profile mocks.
- Meal records: `apps/mobile/features/analysis/analysisMealRecordStore.ts`.
- Analysis session/corrections: `apps/mobile/features/analysis/*`.
- Planned meals: `apps/mobile/features/planned-meal/plannedMealStore.ts`.
- Calorie/guilt sharing: `apps/mobile/features/calorie-sharing/calorieSharingMock.ts`.
- Restaurant/menu references: canonical Restaurant shared data and Mobile restaurant services.

## Future Backend Boundaries

| Feature | Future tables/service |
| --- | --- |
| profile/settings | `consumer_profiles`, `consumer_private_profiles`, `consumer_preferences` |
| taste/diet/goals | `taste_profiles`, `dietary_restrictions`, `nutrition_goals` |
| meal diary | `meal_records`, `meal_record_items` |
| AI analysis | `meal_analyses`, `meal_corrections` |
| post-meal rating/completion | `meal_consumption_adjustments`, `user_menu_item_ratings` |
| calorie/guilt sharing | `meal_sharing_allocations`; social participant schema deferred |
| planned dinner | `planned_meals` |
| today summary | `daily_nutrition_summaries` or query-derived service |
| favorites | `favorite_restaurants`, `favorite_menu_items` |
| recommendations | `recommendation_sessions`, `recommendation_feedback` |

## Required Runtime Design Before Implementation

- Mobile repository interfaces for profile, meal records, analysis, ratings, favorites, and recommendation feedback.
- generated DB types or hand-written row contracts.
- storage/cache migration away from local demo storage.
- Auth session provider and user ownership model.
- RLS test harness.
- offline/fallback policy for demo vs production.
- import/rollback design for development seed.

## Compatibility Fields To Preserve Initially

- `mealId` until all UI uses canonical `meal_records.id`.
- `restaurantName` and `mealName` snapshots for historical display.
- `restaurantId`, `branchId`, `menuItemId` optional fields for mixed source meals.
- rating/completion fields on `SavedMealRecord` until post-meal tables are wired.
- local storage keys until migration/reset strategy is approved.

## Do Not Do In Runtime Cutover

- Do not make Restaurant tables depend on consumer tables.
- Do not expose service-role credentials to Mobile.
- Do not let restaurants read raw consumer meal rows.
- Do not replace public profile rules with raw private profile access.
- Do not use mock IDs as production UUIDs.
- Do not silently mix Supabase and mock rows in one user-owned operation.
## Phase 1.2 Frozen Candidate Handoff

Next allowed phase: `Consumer Runtime Integration Phase 1A - Mobile Auth/Profile Scaffolding`.

Allowed in that future phase:

- Auth interface boundary design.
- Consumer profile repository interface design.
- mock/default and Supabase feature-flag shape.
- server/client auth boundary design.
- idempotent profile bootstrap flow design.
- fake-client tests.
- no live write activation.

Still excluded:

- Meal records.
- Daily nutrition summaries.
- Ratings.
- Favorites.
- Recommendation feedback.
- Social.
- Orders/payments.
- Consumer SQL execution, migration, seed, production connection, or RLS verification claim.

Critical handoff rules:

- Use `auth.users.id` only as login identity and `user_id` ownership key.
- Use `profile_id` as product/community profile identity.
- Do not expose service-role credentials to browser/runtime clients.
- Do not let Restaurant roles read raw Consumer private profile, meal, rating, favorite, or recommendation feedback rows.
- Do not let clients write server-owned daily summary totals.
## Phase 1A Mobile Auth/Profile Scaffolding Result

Consumer Runtime Integration Phase 1A is complete as scaffolding only.

Created Mobile boundaries:

- `apps/mobile/features/consumer-auth/types.ts`
- `apps/mobile/features/consumer-auth/ports.ts`
- `apps/mobile/features/consumer-auth/errors.ts`
- `apps/mobile/features/consumer-auth/featureFlags.ts`
- `apps/mobile/features/consumer-auth/storage.ts`
- `apps/mobile/features/consumer-auth/factories.ts`
- `apps/mobile/features/consumer-auth/consumerProfileBootstrapService.ts`
- `apps/mobile/features/consumer-auth/sessionStateStore.ts`
- mock auth/profile adapters
- Supabase-disabled auth/profile skeletons

No existing UI, route, meal, social, Restaurant, or Admin runtime has been switched to this scaffold.

Next allowed phase after Phase 1B requires explicit approval for live Auth activation; Consumer writes remain disabled.
## Phase 1B Supabase Auth Transport Preparation Result

Consumer Runtime Integration Phase 1B Supabase Auth Transport Preparation is complete.

Dependency command completed manually by the user:

`npm.cmd install --workspace @haocu/mobile @supabase/supabase-js react-native-url-polyfill`

Installed versions:

- `@supabase/supabase-js@2.110.2`
- `react-native-url-polyfill@3.0.0`

Completed:

- SDK-independent Supabase Auth provider contracts.
- canonical user/session/event/error mapping.
- lazy client factory shell with injected SDK loader.
- official SDK lazy loader in `apps/mobile/features/consumer-auth/supabaseSdkLoader.ts`.
- AppState refresh lifecycle boundary.
- fake-client-only transport tests.
- no-network/no-secret/no-write guards.

No real Supabase URL/key was read, no real client was created, no network request was made, no SQL/migration/seed ran, and live Auth activation remains disallowed until a later approved phase.

## Phase 1C Development Live Auth Result

Consumer Runtime Integration Phase 1C Development Live Auth is implementation-complete, guard-complete, and development-live-verified.

Completed:

- Development live Auth flag validation.
- Supabase Auth client factory fail-closed checks.
- Official SDK lazy loader with React Native URL polyfill and `processLock`.
- Supabase email Auth adapter path for sign-in, sign-up, sign-out, restore, refresh, and auth observer.
- Email confirmation required typed result for sign-up responses without a session.
- AsyncStorage and AppState boundary adapters.
- Session state store sign-up and refresh methods.
- Phase 1C guard script: `npm run test:consumer-phase1c`.
- Opt-in development live smoke script: `npm run test:consumer-phase1c-live-smoke`.
- Development live smoke passed for email sign-in, session restore, session refresh, auth observer, sign-out, restore after sign-out, observer unsubscribe, and AppState lifecycle.
- Optional live email sign-up smoke was skipped because explicit sign-up opt-in was not enabled.
- Sign-up mapping and `email_confirmation_required` are verified by the Phase 1C guard.

Still not done:

- Mobile UI wiring.
- Consumer Profile live read/write.
- Consumer database writes.
- Phase 1D.

No real Supabase URL/key, email, password, user ID, token, or session was printed. No SQL, migration, seed, Consumer Profile write, UI change, Restaurant Web runtime change, or Admin runtime change was made. Phase 1C is a freeze candidate.

## Phase 1D Development Live Profile Read Result

Consumer Runtime Integration Phase 1D Development Live Profile Read is implementation-complete, guard-complete, development-live-verified, and frozen.

Completed:

- Current-user Consumer Profile service boundary: `ConsumerProfileService.getCurrentProfile()`.
- Supabase profile row contract and canonical mapper.
- Development live profile repository with session-bound ownership.
- Live profile factory guard requiring live Auth, Auth enabled, writes disabled, explicit Auth port, and explicit profile client.
- Typed profile read errors for missing session, expired session, unauthorized, not found, mapping failure, transport failure, invalid configuration, and unavailable source.
- Phase 1D guard script: `npm run test:consumer-phase1d`.
- Opt-in development live profile smoke script: `npm run test:consumer-phase1d-live-smoke`.
- Development live smoke passed for authenticated sign-in, canonical session mapping, current-user-only `consumer_profiles` read, canonical profile mapping, and sign-out.
- Consumer Schema Phase 1.3 was deployed to the development project by operator action before the passing smoke.
- Forward-only corrective migration `20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql` grants only authenticated SELECT on `public.consumer_profiles`.
- The profile fixture used for live verification was development operator-created and is not stored in the repository.

Still not done:

- Mobile UI wiring.
- Consumer Profile writes/bootstrap.
- Consumer private profile/preferences/taste reads.
- Meal, recommendation, social, orders, payments, or sharing runtime reads/writes.
- Consumer Runtime SQL execution, seed, fixture creation, profile bootstrap, automatic profile creation, or production readiness.
- Phase 2.

Current live read table allowlist: `consumer_profiles`.
Current live read API: `getCurrentProfile()` only. The live repository rejects arbitrary user-id lookup instead of querying.

No real Supabase URL/key, email, password, user ID, token, session, row contents, or fixture contents are recorded in this repository. No Consumer Runtime write operation, profile bootstrap, automatic profile creation, UI change, navigation change, Restaurant Web runtime change, or Admin runtime change was made. Consumer Runtime Phase 2 was not started.

## Phase 2A Meal Records Read Architecture Result

Consumer Runtime Integration Phase 2A Meal Records Read Architecture and Development Live Read Preparation is implementation-complete and guard-complete.

Completed:

- `apps/mobile/features/consumer-meals/*` read-only meal records boundary.
- canonical `ConsumerMealRecord` and `ConsumerMealRecordItem` types.
- bounded current-user read contract with date range and limit.
- mock repository mapping existing demo meal records into the canonical read contract.
- Supabase live repository contract for `meal_records` with nested `meal_record_items`.
- row-to-canonical mappers with owner, parent, enum, timestamp, and numeric validation.
- meal source switching with mock default and explicit live preparation flags.
- typed meal read errors.
- Phase 2A guard script: `npm run test:consumer-phase2a`.
- Development live meal read smoke placeholder: `npm run test:consumer-phase2a-live-smoke`.

Still not done:

- Home / Today Intake / Meal Log cutover.
- Daily Nutrition Summary runtime recalculation.
- Development live meal read verification.
- Meal writes, updates, deletes, corrections, consumption adjustments, ratings, favorites, recommendation feedback, social, orders, payments, Admin governance, or production deployment.
- Any schema, RLS, grant, seed, or fixture change.
- Phase 2B.

Current live read table allowlist: `meal_records` through the Phase 2A meal read adapter. Nested `meal_record_items` are selected only as child rows in the explicit column allowlist.

No real Supabase URL/key, email, password, user ID, token, session, raw database row, row contents, or fixture contents are recorded in this repository. No Consumer Runtime write operation, raw SQL, RPC, profile bootstrap, automatic profile creation, UI change, navigation change, Restaurant Web runtime change, or Admin runtime change was made. Consumer Runtime Phase 2B was not started.

## Phase 2B Development Live Meal Read Result

Consumer Runtime Integration Phase 2B Development Live Meal Records Read Verification is implementation-complete, guard-complete, development-live-verified, and freeze-ready.

Completed:

- Phase 2A hardening for strict calendar date validation, stable `occurred_at desc, id desc` ordering, mock/live ordering parity, narrowed public exports, and typed mock catch-path handling.
- Forward-only corrective migration `20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql`.
- Authenticated SELECT grants for `public.meal_records` and `public.meal_record_items`.
- Explicit anon privilege revokes for both meal read tables.
- Phase 2B guard script: `npm run test:consumer-phase2b`.
- Opt-in development live meal read smoke script: `npm run test:consumer-phase2b-live-smoke`.
- Development live smoke passed for live flags, email sign-in, canonical session, current-user meal read, canonical empty list, and sign-out.

Still not done:

- Home / Today Intake / Meal Log cutover.
- Daily Nutrition Summary runtime.
- Meal writes, updates, deletes, corrections, consumption adjustments, ratings, favorites, recommendation feedback, social, orders, payments, Admin governance, or production deployment.
- Seed, fixture, profile bootstrap, meal bootstrap, or automatic data creation.
- Phase 2C.

Current live read table allowlist: `meal_records` plus nested `meal_record_items` through the explicit column allowlist. The live repository still rejects arbitrary user identity input and reads only the current authenticated session user's records.

No real Supabase URL/key, email, password, user ID, token, session, raw database row, row contents, or fixture contents are recorded in this repository. No Consumer Runtime write operation, raw SQL, RPC, UI change, navigation change, Restaurant Web runtime change, Admin runtime change, production deployment, or Phase 2C work was made.

## Phase 2C Controlled Meal Record Write Preparation Result

Consumer Runtime Integration Phase 2C Controlled Meal Record Write Preparation is implementation-complete, guard-complete, and freeze-ready.

Completed:

- Canonical `createCurrentUserMealRecord(input)` write service boundary.
- Meal create input validation for dates, timestamps, item count, nutrition values, known fields, and payload size.
- Explicit rejection of ownership fields and server-managed fields.
- Mock in-memory write repository for fake guard verification only.
- Disabled write repository returning typed `meal_write_disabled`.
- Supabase live write repository that validates session/input and then fails closed with `meal_write_atomicity_not_supported`.
- Phase 2C guard script: `npm run test:consumer-phase2c`.
- Phase 2C live write smoke script: `npm run test:consumer-phase2c-live-smoke`, hard-skipped because Phase 2D has not started.

Still not done:

- Real Consumer Runtime meal insert/update/upsert/delete.
- Atomic parent-and-items write transaction/RPC/application strategy.
- Write grants, RLS write verification, live write smoke, seed, fixture, or profile/meal bootstrap.
- UI wiring, Home/Today Intake cutover, Daily Nutrition Summary runtime, ratings/favorites/recommendation feedback runtime, social runtime, Restaurant Web runtime, Admin runtime, production deployment, or Phase 2D.

No real Supabase URL/key, email, password, user ID, token, session, raw database row, row contents, or fixture contents are recorded in this repository. No Consumer Runtime write operation, RPC, raw SQL execution, migration, seed, fixture, UI change, navigation change, production deployment, or Phase 2D work was implemented.

## Phase 2D Atomic Development Live Meal Write Result

Consumer Runtime Integration Phase 2D Atomic Development Live Meal Record Write is implementation-complete, guard-complete, development-deployed, development-live-verified, and freeze-ready.

Completed:

- Forward-only atomic meal write migration `20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql`.
- PostgreSQL function `public.create_current_user_meal_record(...)`.
- Function ownership derived only from `auth.uid()`.
- Function execute revoked from `public` and `anon`, granted only to `authenticated`.
- Direct table insert/update/delete privileges remain revoked.
- Supabase write adapter now uses only the allowlisted atomic RPC.
- Development live write smoke passed with atomic write and read-after-write verification.

Still not done:

- UI wiring, Home/Today Intake cutover, Daily Nutrition Summary runtime, corrections, consumption adjustments, planned meal writes, ratings, favorites, recommendation feedback, social runtime, Admin Consumer Governance, production deployment, or Phase 3.

No real Supabase URL/key, email, password, user ID, token, session, record ID, item ID, raw RPC payload, raw database row, row contents, or fixture contents are recorded in this repository. No direct sequential insert, update, delete, upsert, seed, fixture, profile bootstrap, automatic meal bootstrap, UI change, navigation change, production deployment, or next phase work was implemented.

## Phase 2E Daily Nutrition Summary Architecture Result

Consumer Runtime Integration Phase 2E Daily Nutrition Summary Read Architecture and Recalculation Design is implementation-complete, guard-complete, live-summary-skipped, and freeze-ready.

Completed:

- Canonical daily nutrition summary type and current-user read service boundary.
- `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE` source flag with frozen default `mock`.
- Mock and disabled daily nutrition summary repositories.
- Prepared Supabase read adapter for `daily_nutrition_summaries` with explicit column allowlist, current-user filter, exact date filter, timezone filter, and `limit(1)`.
- Pure deterministic `calculateDailyNutritionSummary(input)` engine.
- Stored vs calculated parity comparison helper.
- Phase 2E guard script: `npm run test:consumer-phase2e`.
- Phase 2E live smoke script: `npm run test:consumer-phase2e-live-smoke`, hard-skipped because live summary verification has not started.

Still not done:

- Authenticated SELECT grant migration for `daily_nutrition_summaries`.
- Development live summary read verification.
- Summary persistence or recalculation writes.
- Correction and consumption adjustment application rules.
- Home / Today Intake / Meal Log cutover, Daily Summary UI, ratings, favorites, recommendation feedback, social runtime, Admin Consumer Governance, production deployment, or next phase work.

No real Supabase URL/key, email, password, user ID, token, session, raw database row, row contents, or fixture contents are recorded in this repository. No migration, remote operation, Consumer Runtime summary write, RPC, raw SQL execution, seed, fixture, UI change, navigation change, production deployment, or next phase work was implemented.

## Phase 2F Development Live Daily Nutrition Summary Read Result

Consumer Runtime Integration Phase 2F Development Live Daily Nutrition Summary Read is implementation-complete, guard-complete, development-deployed, development-live-verified, and freeze-ready. It adds a development-only live read of `daily_nutrition_summaries` and a no-write parity check against current-user meal records.

Phase 2F adds the forward-only migration `20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql`, which grants only authenticated SELECT on `public.daily_nutrition_summaries` and revokes anon privileges on that table. It does not grant writes, change RLS policies, create data, seed, fixture, bootstrap, or touch production.

The runtime remains mock by default. Live summary reads require explicit development flags, live Auth, Auth enabled, daily summary source set to `supabase-live`, daily summary live read opt-in, and Consumer writes disabled. The live repository continues to derive ownership from the current session and filters by `user_id`, `local_date`, `timezone`, and `is_current`.

Stored summaries are treated as cached projections. The live smoke passed with current-user meal reads, authorized stored-summary transport, typed not-found for a missing stored summary row, in-memory recalculation, parity skipped because no stored row existed, and sign-out. Stored `itemCount` is explicitly unavailable because the frozen summary table does not persist it, so item-count parity is skipped instead of inventing zero.

Phase 2F does not implement summary write-back, insert/update/upsert/delete, RPC, UI wiring, navigation wiring, Home/Today Intake cutover, ratings/favorites/recommendation feedback runtime, social runtime, Restaurant Web runtime, Admin runtime, production deployment, or Phase 2G.

## Phase 2G Home / Today Intake Shared Read Model Preparation Result

Consumer Runtime Integration Phase 2G Home / Today Intake Shared Runtime Read Model Preparation is implementation-complete, guard-complete, live-shared-model-skipped, and freeze-ready.

Phase 2G adds `ConsumerTodayIntakeOverview`, `ConsumerTodayIntakeOverviewService`, and `createConsumerTodayIntakeOverviewService(...)`. The shared read model composes current-user meal records, deterministic calculated nutrition, optional stored daily summary data, optional planned meals, provenance, warnings, and empty / partial / error metadata.

The shared service reuses the Phase 2A / 2B meal read service, the Phase 2E calculator, and the Phase 2F daily nutrition summary read service. It does not import the Supabase SDK, construct queries, create a client, write summaries, call RPC, execute SQL, expose arbitrary user identity, or leak raw rows.

Home and Today Intake remain unwired in Phase 2G. Their current route-local view models still use the existing analysis meal record store until a future UI cutover. The live shared-model smoke is intentionally hard-skipped with `SKIPPED - Consumer Runtime Home/Today Intake shared live verification has not started.`

Phase 2G does not add a migration, modify schema/RLS/grants, execute a remote Supabase operation, create seed/fixture/bootstrap data, change UI or navigation, touch Restaurant Web or Admin runtime, deploy to production, or start the next phase.
