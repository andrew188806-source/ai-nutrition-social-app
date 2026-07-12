# Consumer Schema Phase 1.3 - Formal Migration Activation and Runtime Table Alignment

Date: 2026-07-13
Status: Implementation complete. Migration package complete. Development deployment complete. Phase 1D development live verification complete. Phase 1D freeze candidate.

## Scope

Phase 1.3 promotes the Consumer Schema Phase 1.2 frozen candidate from review-only draft SQL into local active migration files and aligns the Consumer Runtime Phase 1D profile read table target with the canonical physical schema.

This phase does not execute remote Supabase migrations, seed data, create fixtures, create Auth users, create profile rows, modify Restaurant schema/data, modify Mobile UI/navigation, or start Consumer Runtime Phase 2.

## Draft-To-Active Promotion

Review history remains in:

- `docs/supabase-consumer-schema-drafts/001_consumer_enums_and_helpers.sql`
- through
- `docs/supabase-consumer-schema-drafts/015_consumer_validation_queries.sql`

Formal migration files live in:

- `supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql`
- through
- `supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql`
- plus forward-only corrective migration `supabase/migrations/20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql`

The active package promotes draft files `001` through `014`. Draft file `015_consumer_validation_queries.sql` remains review-only and is intentionally excluded from active migration state.

## Canonical Physical Table Decision

Database physical profile table:

- `consumer_profiles`

Runtime public API:

- `getCurrentProfile()`

Ownership key:

- `consumer_profiles.user_id`

Runtime ownership filter:

- `user_id = canonical session userId`

No compatibility table, alias, or view named `user_profiles` is created. Phase 1D runtime contracts, repository, guard, smoke script, and docs are aligned to `consumer_profiles`.

## Migration Ordering

1. `20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql`
2. `20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql`
3. `20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql`
4. `20260712130400_consumer_schema_phase_1_3_meal_records.sql`
5. `20260712130500_consumer_schema_phase_1_3_meal_analysis_and_corrections.sql`
6. `20260712130600_consumer_schema_phase_1_3_meal_consumption_and_sharing.sql`
7. `20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql`
8. `20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql`
9. `20260712130900_consumer_schema_phase_1_3_recommendation_feedback.sql`
10. `20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql`
11. `20260712131100_consumer_schema_phase_1_3_consumer_audit_and_legacy_mapping.sql`
12. `20260712131200_consumer_schema_phase_1_3_consumer_indexes.sql`
13. `20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql`
14. `20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql`
15. `20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql`

## Created Object Inventory

The active migration package creates:

- 13 enum/helper objects from the frozen draft package.
- 25 Consumer tables.
- 3 Consumer views.
- 28 indexes.
- 24 RLS policies.

Key tables include:

- `consumer_profiles`
- `consumer_private_profiles`
- `consumer_preferences`
- `taste_profiles`
- `meal_records`
- `meal_record_items`
- `daily_nutrition_summaries`
- `user_restaurant_ratings`
- `user_menu_item_ratings`
- `favorite_restaurants`
- `favorite_menu_items`
- `recommendation_sessions`
- `recommendation_feedback`

## RLS And Policy Inventory

RLS is enabled for each Consumer table in the active RLS migration. Owner policies bind records to `auth.uid() = user_id`.

The `consumer_profiles` owner read policy is:

```sql
create policy consumer_profiles_owner_read on consumer_profiles for select using (auth.uid() = user_id);
```

The `consumer_profiles` owner update policy is:

```sql
create policy consumer_profiles_owner_update on consumer_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Consumer Runtime Phase 1D uses read-only runtime behavior. The update policy exists in schema because it was part of the frozen RLS draft, but Phase 1D keeps `WRITES_ENABLED=false` and exposes no profile write runtime.

## Grants

The frozen Consumer Schema drafts did not define explicit grants. Development live profile read verification showed the minimal table-level grant needed for the authenticated current-profile read path.

Forward-only corrective migration:

```sql
grant select on table public.consumer_profiles to authenticated;
```

No `anon` privilege, `INSERT`, `UPDATE`, `DELETE`, `GRANT ALL`, or other Consumer table grant is included. RLS and the `auth.uid() = user_id` ownership policy continue to define which row the authenticated user can read.

## Explicit Exclusions

Phase 1.3 excludes:

- additional remote Supabase migration execution by runtime code.
- runtime `supabase db push`.
- remote `psql`.
- Dashboard SQL execution.
- seed data.
- repository-created fixture data.
- Auth user creation or modification.
- `consumer_profiles` row creation.
- `user_profiles` table/view/alias creation.
- Restaurant schema/data modification.
- Consumer Runtime Phase 2 implementation.
- Mobile UI/navigation changes.
- Consumer runtime writes.
- production deployment or production credentials.

## Development Deployment Prerequisites

Before applying this package to `tastkind-development`, an operator must verify:

- the Supabase target project is development only.
- the linked project ref matches the approved development environment.
- no production project ref or production credential is present.
- dry-run/migration plan is reviewed.
- Restaurant schema/data are protected.
- no seed or Auth user changes are included.
- RLS and ownership behavior can be tested with authenticated development users.

## Development Deployment Result

Consumer Schema Phase 1.3 development deployment is complete. The development operator applied:

- the 14 formal Phase 1.3 Consumer migrations.
- forward-only corrective migration `20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql`.

Local and remote migration history are aligned. The development profile fixture used for Phase 1D live verification was operator-created and is not stored in the repository. No seed package, repository fixture, Auth user creation, production deployment, UI change, navigation change, or Consumer Runtime Phase 2 work is included.

## Roll-Forward Strategy

This package is additive and non-destructive. It contains no table drops, truncation, fixture inserts, seed rows, or Auth user modifications.

## Validation Plan

Static validation commands:

- `npm run validate:consumer-schema`
- `npm run audit:canonical`
- `npm run test:consumer-schema-phase1.3`
- `npm run test:consumer-phase1a`
- `npm run test:consumer-phase1b`
- `npm run test:consumer-phase1c`
- `npm run test:consumer-phase1d`
- root, Mobile, Restaurant Web, and Admin typechecks
- `npm ls`
- `git diff --check`

Remote execution commands are intentionally excluded from Phase 1.3 validation.

## Result

Phase 1.3 prepares and development-deploys the formal Consumer migration package, resolves the Phase 1D `user_profiles` versus `consumer_profiles` mismatch in favor of the frozen canonical schema, and adds the minimal authenticated SELECT grant needed for Phase 1D current-profile reads.

No seed or repository fixture data was created. No Auth user was modified by repository code. Consumer Runtime Phase 2 was not started.
