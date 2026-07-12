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
