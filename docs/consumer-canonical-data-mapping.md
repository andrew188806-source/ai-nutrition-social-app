# Consumer Canonical Data Mapping Preparation Phase 1

Date: 2026-07-12
Status: Draft complete for human DB/security review. Not an active migration.

## 1. Scope

This package prepares the consumer-side canonical data model for future Supabase/PostgreSQL integration. It is documentation, draft SQL, validation planning, and static review only.

It does not change Mobile runtime, Restaurant Web runtime, Admin runtime, UI, mock data, compatibility layers, Auth runtime, production Supabase, seeds, migrations, or live database state.

## 2. Restaurant Integration Baseline

The existing Restaurant canonical integration remains the baseline and must not be rebuilt by the consumer schema.

Consumer records may reference these Restaurant canonical IDs:

- `restaurant_id`
- `branch_id`
- `menu_id`
- `menu_item_id`
- `recommendation_id`

Consumer drafts must not recreate restaurant, branch, menu, menu item, branch menu item, nutrition, analytics, staff, or governance tables. Those stay owned by the Restaurant schema package and Restaurant Web read path.

## 3. Existing Mobile Data Inventory

| Area | Current source | Current persistence | Future canonical owner |
| --- | --- | --- | --- |
| Community profile/settings | `apps/mobile/features/community-card-settings/*`, `mealBuddyFlowMock.ts` | module memory and demo mock | `consumer_profiles`, `consumer_private_profiles`, `consumer_preferences`, `taste_profiles`, `dietary_restrictions`, `nutrition_goals` |
| Meal records | `apps/mobile/features/analysis/analysisMealRecordStore.ts` | shared storage adapter | `meal_records`, `meal_record_items` |
| AI analysis sample/corrections | `analysisCorrectionData.ts`, `analysisSessionStore.ts`, `useAnalysisCorrectionState.ts` | module/session state | `meal_analyses`, `meal_corrections` |
| Planned meal | `apps/mobile/features/planned-meal/plannedMealStore.ts` | module memory | `planned_meals` |
| Daily nutrition summary | `nutritionSummary.ts`, derived UI helpers | calculated/read model | `daily_nutrition_summaries` if materialized later |
| Calorie/guilt sharing | `apps/mobile/features/calorie-sharing/calorieSharingMock.ts` | shared storage adapter | `meal_sharing_allocations` plus future social/group-table schema |
| Post-meal completion/rating | `SavedMealRecord` optional fields | same meal record store | `meal_consumption_adjustments`, `user_menu_item_ratings` |
| Food/nutrition memory | `nutrition-memory`, shared `foodMemory.ts` | mock data | future collection table or derived view; deferred from Phase 1 if UI-only |
| Favorites | shared mock `foodMemory.ts`, Restaurant canonical rating/favorite samples | mock only | `favorite_restaurants`, `favorite_menu_items` |
| Recommendations | Restaurant canonical `RecommendationResult`, Mobile recommendation screens/session state | mock/session | `recommendation_sessions`, `recommendation_feedback` |
| Privacy/consent | no production model | none | `consumer_data_consents`, `consumer_data_deletion_requests`, `consumer_data_change_logs` |
| Social people/cards/chats/group tables | community/meal-buddy stores | mock/storage | deferred social schema package; referenced only where consumer profile ownership is needed |

## 4. Canonical Consumer Entities

### Identity and Profile

- `ConsumerProfile`: public/community-safe profile row keyed by `profile_id`, owned by `user_id`.
- `ConsumerPrivateProfile`: private health/profile fields keyed by `user_id`.
- `ConsumerPreferences`: locale, timezone, units, notification and privacy preferences.
- `TasteProfile`: taste, cuisine, meal-time, payment, and dining style preferences.
- `DietaryRestriction`: restrictions, avoided foods, allergies, severity, visibility.
- `NutritionGoal`: active goal targets and macro preferences.
- `SubscriptionEntitlement`: entitlement snapshot model; payment/order implementation remains deferred.

### Meal and Nutrition

- `MealRecord`
- `MealRecordItem`
- `MealAnalysis`
- `MealCorrection`
- `MealConsumptionAdjustment`
- `MealSharingAllocation`
- `PlannedMeal`
- `DailyNutritionSummary`

### Rating and Collection

- `UserRestaurantRating`
- `UserMenuItemRating`
- `FavoriteRestaurant`
- `FavoriteMenuItem`
- `FoodDiaryCollection`: deferred unless the product requires named user collections beyond favorites.

### Recommendation

- `RecommendationSession`
- `RecommendationFeedback`
- `RecommendationAction`: captured as event columns in `recommendation_feedback` for Phase 1.

## 5. Auth Ownership

Supabase `auth.users.id` is the account identity. Consumer domain tables use `user_id uuid not null references auth.users(id)` for owner-scoped private data.

Rules:

- Do not store passwords in public tables.
- `consumer_profiles.user_id` references `auth.users.id`.
- Auth identity and profile identity are separate: `user_id` is account ownership, `profile_id` is product/community identity.
- Private profile data is owner-scoped.
- Public/community profile fields must be exposed through a public-safe view, not by granting wide access to private rows.

Human decisions required:

- Profile creation trigger vs application-created profile.
- Account disabled/deleted behavior.
- Soft delete and anonymization strategy.
- Data export workflow.
- Consent and terms versioning.
- Locale/timezone/unit defaults.

## 6. Profile Separation

`consumer_profiles` is the public-safe profile base:

- profile display name
- anonymous display name
- mascot avatar key
- real avatar URL/key
- public verification status
- public social/diet summaries
- willingness-to-chat flags

`consumer_private_profiles` holds sensitive or owner-only fields:

- birthdate or age source
- gender if sensitive
- health notes
- private medical/diet notes
- account deletion flags
- data export metadata

Public views should hide private profile fields and only expose allowed community profile output.

## 7. Meal Model

`meal_records` is the canonical meal event. `meal_record_items` are item-level snapshots.

A meal item may come from:

1. canonical restaurant/menu item
2. restaurant/branch without canonical menu item
3. AI detected freeform food
4. user manual entry
5. self-made dish

Therefore `meal_record_items` needs both references and snapshots:

- optional `restaurant_id`
- optional `branch_id`
- optional `menu_item_id`
- `display_name_snapshot`
- `portion_snapshot`
- `nutrition_snapshot jsonb`
- `nutrition_source`
- `nutrition_schema_version`
- `source_entity_version`
- `occurred_at`
- `timezone`
- `confidence_score`
- `correction_status`

Do not mutate Restaurant `menu_items` when a consumer corrects a meal record.

## 8. Nutrition Snapshot / Versioning

Meal history must remain historically stable even if restaurant nutrition later changes.

Required model:

- `meal_records`: meal-level event and timing.
- `meal_record_items`: item snapshots and source references.
- `meal_analyses`: AI model output, photos, estimate confidence, model version.
- `meal_corrections`: user corrections to AI estimates.
- `meal_consumption_adjustments`: actual consumption ratio and completion details.
- `meal_sharing_allocations`: shared/group calorie allocation.
- `daily_nutrition_summaries`: optional materialized daily aggregate.

Open decisions:

- Whether daily summaries are persisted or query-derived for MVP.
- How multi-photo analysis versions are represented.
- Whether post-meal photos create separate analysis rows.
- How long raw photo references are retained.

## 9. Ratings

`user_restaurant_ratings` and `user_menu_item_ratings` are private by default and may be included in anonymous aggregates.

Rules:

- One active/current rating per user and restaurant.
- One active/current rating per user and menu item.
- Optional `meal_record_item_id` links a rating to a consumed meal.
- Edits should be represented by updated row plus optional change log in later phases.
- Restaurant dashboards must not see raw user identity.

## 10. Favorites

Favorites are separate from ratings because the user can favorite without writing a rating.

Rules:

- One active favorite per user/restaurant.
- One active favorite per user/menu item.
- Use `removed_at` for soft deletion.
- Preserve user-owned sort or collection metadata if later needed.

## 11. Recommendation Feedback

`recommendation_feedback` records user actions against a recommendation session/result.

Captured fields:

- `user_id`
- `recommendation_session_id`
- optional Restaurant canonical references
- optional `recommendation_id` from Restaurant recommendation results
- shown/clicked/accepted/dismissed/saved/consumed timestamps
- rating or short feedback
- source surface
- schema version

Restaurant analytics should consume aggregate/de-identified signals only, not raw consumer identity.

## 12. Restaurant References

Consumer data can reference Restaurant canonical records but cannot own them.

Allowed references:

- `restaurant_id` -> Restaurant canonical `restaurants.id`
- `branch_id` -> Restaurant canonical `restaurant_branches.id`
- `menu_id` -> Restaurant canonical `menus.id`
- `menu_item_id` -> Restaurant canonical `menu_items.id`
- `recommendation_id` -> Restaurant canonical recommendation result where applicable

If a meal has no canonical menu item, keep user-entered and AI-detected snapshots instead of fabricating a Restaurant menu item.

## 13. Analytics Relation

Consumer domain records and behavioral analytics are separate layers.

- `meal_records` are domain truth.
- Recommendation clicks are behavioral events/feedback.
- Restaurant performance is aggregated metric output.

Do not make `analytics_events` the source of truth for meals, ratings, favorites, or profiles.

## 14. Privacy Classification

See `docs/consumer-schema-privacy-classification.md` for the detailed matrix.

Summary:

- Public: explicit public profile display fields.
- Consumer-private: preferences, meal records, ratings, favorites.
- Sensitive preference: allergies, health goals, diet restrictions.
- Health/nutrition-related: meal analysis, nutrition snapshots, corrections.
- Internal operational: deletion/export/audit/change logs.
- Aggregated/de-identified: restaurant-facing metric outputs.

## 15. RLS Model

See `docs/consumer-schema-rls-matrix.md`.

Phase 1 drafts assume:

- consumers can read/write their own private rows.
- consumers cannot write another `user_id`.
- restaurants cannot read raw consumer rows.
- restaurants may later read aggregate/de-identified views only.
- platform admin/reviewer access requires separate security review.
- service role is server/job only, never browser runtime.

## 16. UUID Migration

Production IDs should be UUIDs. Existing mock IDs are legacy IDs and must be traceable through `legacy_consumer_entity_mappings`.

Mapping row fields:

- production UUID
- legacy ID
- entity type
- source dataset version
- source row checksum
- import batch
- import status
- rollback batch
- retry count

Do not hardcode Mobile mock IDs as production primary keys.

## 17. Constraints

Required constraints include:

- primary keys for every table.
- owner FKs to `auth.users` for consumer-owned tables.
- composite unique indexes for active ratings/favorites.
- non-negative nutrition values.
- consumed ratio between 0 and 1.
- sharing allocation ratio between 0 and 1.
- current daily summary uniqueness by user/local_date/timezone/calculation_version.
- recommendation feedback idempotency.
- soft-delete aware uniqueness for favorites.

## 18. Indexes

Key indexes:

- `user_id, occurred_at` for meal history.
- `user_id, meal_date` for daily summaries.
- `restaurant_id` and `menu_item_id` lookup indexes for consumer references.
- current active goal by `user_id`.
- active favorites by user/entity.
- recommendation feedback by session and user.

## 19. SQL Draft Inventory

Draft-only SQL files live in `docs/supabase-consumer-schema-drafts/`:

- `001_consumer_enums_and_helpers.sql`
- `002_consumer_profiles.sql`
- `003_consumer_preferences_and_goals.sql`
- `004_meal_records.sql`
- `005_meal_analysis_and_corrections.sql`
- `006_meal_consumption_and_sharing.sql`
- `007_planned_meals_and_daily_summaries.sql`
- `008_ratings_and_favorites.sql`
- `009_recommendation_feedback.sql`
- `010_consumer_privacy_and_consents.sql`
- `011_consumer_audit_and_legacy_mapping.sql`
- `012_consumer_indexes.sql`
- `013_consumer_public_private_views.sql`
- `014_consumer_rls_policy_drafts.sql`
- `015_consumer_validation_queries.sql`

They are not active migrations and must not be applied to production.

## 20. Migration Order

See `docs/consumer-schema-migration-order.md`.

High-level order:

1. enums/helpers
2. profiles
3. preferences/goals
4. meals/items
5. analysis/corrections
6. consumption/sharing
7. planned/daily summaries
8. ratings/favorites
9. recommendation feedback
10. privacy/audit/legacy mapping
11. indexes
12. views
13. RLS review/apply after security review
14. validation queries
15. development seed import after approval

## 21. Validation Queries

See `docs/consumer-schema-validation-plan.md` and `015_consumer_validation_queries.sql`.

Validation covers orphan rows, invalid Restaurant references, duplicate active ratings/favorites, invalid nutrition values, invalid sharing allocations, daily summary duplication, recommendation feedback without session, ownership mismatch, deleted-account residue, public view leakage, and legacy mapping duplicates.

## 22. Development Seed Design

Development seed should be artificial and privacy-safe:

- 2 consumers
- no real emails
- 2 profile/preference sets
- 3+ meal records
- mix of canonical menu item and freeform meal items
- one AI estimate and correction
- one consumption adjustment
- one planned meal
- one daily summary
- one restaurant rating
- one menu item rating
- one favorite restaurant/menu item
- one recommendation session and feedback row

No production user data should be used.

## 23. Deferred Social Scope

The following are out of this consumer schema package:

- MealBuddyCard
- Invitation
- Match
- Chat
- ChatMessage
- GroupTable
- GroupTableMember

They may reference `consumer_profiles.profile_id` later, but their schema belongs to a separate social integration package.

## 24. Deferred Order / Payment Scope

Payment, order, subscription billing, and restaurant ordering are deferred. Consumer ratings/favorites may reference restaurants/menu items, but no order/payment tables are introduced here.

## 25. Runtime Integration Prerequisites

Before Consumer runtime integration:

- human DB/security review of the draft package.
- disposable DB apply test.
- RLS harness with user/restaurant/admin roles.
- generated DB types or approved hand-written row types.
- import/rollback plan for development seed only.
- Mobile service/repository boundary design.
- no direct client writes for high-risk/private server-owned fields.

## 26. Human Decisions Required

- profile creation trigger vs application flow.
- public profile view field list.
- whether daily summaries are persisted or computed.
- retention period for meal photos and AI outputs.
- whether Food Diary collections are MVP tables or derived UI.
- anonymization/deletion workflow.
- aggregate threshold before restaurant dashboards can see consumer-derived metrics; Phase 1.2 candidate threshold is 10 distinct consumers.
- whether ratings keep history or only current row plus audit.

## 27. Explicit Non-Goals

This package does not:

- execute SQL.
- create active migrations.
- seed a database.
- change Mobile runtime.
- change Restaurant Web runtime.
- change Admin runtime.
- change UI.
- remove mocks or compatibility layers.
- integrate Supabase Auth.
- mark Gate 1.1 passed.
- mark Consumer runtime integration ready.