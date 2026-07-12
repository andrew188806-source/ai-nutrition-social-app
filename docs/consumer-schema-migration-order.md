# Consumer Schema Migration Order

Date: 2026-07-12
Status: Draft order. Not an execution plan.

## Preconditions

- Human DB/security review accepted.
- Disposable DB environment is available.
- Restaurant canonical schema baseline exists or is stubbed for FK validation.
- No production database is targeted.
- RLS policies are reviewed before being enabled.

## Draft Order

1. `001_consumer_enums_and_helpers.sql`
   - create enums and helper function drafts.
2. `002_consumer_profiles.sql`
   - create public/private profile split and profile ownership.
3. `003_consumer_preferences_and_goals.sql`
   - create preferences, taste profiles, restrictions, and nutrition goals.
4. `004_meal_records.sql`
   - create meals and meal item snapshot layer.
5. `005_meal_analysis_and_corrections.sql`
   - create AI analysis and correction tables.
6. `006_meal_consumption_and_sharing.sql`
   - create completion and sharing allocation tables.
7. `007_planned_meals_and_daily_summaries.sql`
   - create planned meals and optional daily aggregate table.
8. `008_ratings_and_favorites.sql`
   - create ratings and favorites.
9. `009_recommendation_feedback.sql`
   - create recommendation sessions and feedback/action rows.
10. `010_consumer_privacy_and_consents.sql`
    - create consent and deletion request tables.
11. `011_consumer_audit_and_legacy_mapping.sql`
    - create change log and legacy mapping traceability.
12. `012_consumer_indexes.sql`
    - create performance and uniqueness indexes.
13. `013_consumer_public_private_views.sql`
    - create public-safe and aggregate/de-identified views.
14. `014_consumer_rls_policy_drafts.sql`
    - enable and apply RLS only after security review.
15. `015_consumer_validation_queries.sql`
    - run validation queries in disposable DB only.

## Rollback Notes

No rollback SQL is provided in Phase 1 because no active migration is authorized. Any future migration package must include import batch IDs, rollback metadata, and destructive-operation review.

## Phase 1.3 Active Migration Package

Consumer Schema Phase 1.3 promotes the frozen draft SQL package into local active migration files under `supabase/migrations/`.

Active migration order:

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

Validation-only draft `015_consumer_validation_queries.sql` is intentionally not promoted into the active migration package.

Phase 1.3 does not execute remote Supabase migration, seed data, create fixtures, modify `auth.users`, touch production, or start Consumer Runtime Phase 2.

## Blockers Before Runtime

- generated DB types or approved row types.
- Mobile repository/service design.
- RLS execution harness.
- privacy/legal signoff for retention and deletion.
- development seed package approval.
