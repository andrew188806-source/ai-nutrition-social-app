# Consumer Schema RLS Matrix

Date: 2026-07-12
Status: Phase 1.2 frozen candidate policy matrix. Requires security review and execution harness.

## Roles

| Role | Description |
| --- | --- |
| anonymous | no authenticated user |
| authenticated consumer | `auth.uid()` matches consumer-owned `user_id` |
| restaurant employee | authenticated restaurant account, no raw consumer access |
| restaurant branch manager | restaurant branch-scoped account, aggregate access only |
| restaurant owner/admin | restaurant-scoped account, aggregate access only |
| platform reviewer | internal reviewer, scoped and audited |
| platform admin | highly privileged internal role, security-review required |
| service role | server/job only, never browser runtime |

## Table Access Draft

| Table/view | anonymous | authenticated consumer | restaurant roles | platform reviewer/admin | service role |
| --- | --- | --- | --- | --- | --- |
| `consumer_public_profiles` | read public-safe fields | read public-safe fields | read public-safe fields only if product allows | read for moderation | full server/job |
| `consumer_profiles` | no direct access | read/update own allowed fields | no direct access | reviewed access only | full server/job |
| `consumer_private_profiles` | none | read/update own | none | reviewed access only | full server/job |
| `consumer_preferences` | none | read/update own | none | reviewed access only | full server/job |
| `taste_profiles` | none | read/update own | none | reviewed access only | full server/job |
| `dietary_restrictions` | none | read/write own | none | reviewed access only | full server/job |
| `nutrition_goals` | none | read/write own | none | reviewed access only | full server/job |
| `subscription_entitlements` | none | read own entitlement snapshot | none | reviewed access only | full server/job |
| `meal_records` | none | read/write own | none | reviewed access only | full server/job |
| `meal_record_items` | none | read/write own through parent meal | none | reviewed access only | full server/job |
| `meal_analyses` | none | read/write own through parent meal | none | reviewed access only | full server/job |
| `meal_corrections` | none | read/write own through parent analysis | none | reviewed access only | full server/job |
| `meal_consumption_adjustments` | none | read/write own through parent meal | none | reviewed access only | full server/job |
| `meal_sharing_allocations` | none | read/write own allocation | aggregate/de-identified only | reviewed access only | full server/job |
| `planned_meals` | none | read/write own | none | reviewed access only | full server/job |
| `daily_nutrition_summaries` | none | read own | aggregate/de-identified only | reviewed access only | full server/job |
| `user_restaurant_ratings` | none | read/write own | aggregate/de-identified only | reviewed access only | full server/job |
| `user_menu_item_ratings` | none | read/write own | aggregate/de-identified only | reviewed access only | full server/job |
| `favorite_restaurants` | none | read/write own | aggregate/de-identified only | reviewed access only | full server/job |
| `favorite_menu_items` | none | read/write own | aggregate/de-identified only | reviewed access only | full server/job |
| `recommendation_sessions` | none | read own | none | reviewed access only | full server/job |
| `recommendation_feedback` | none | read/write own | aggregate/de-identified only | reviewed access only | full server/job |
| privacy/deletion/change-log tables | none | read own request/consent where safe | none | reviewed access only | full server/job |
| `restaurant_consumer_aggregate_metrics` | none | no raw rows | read aggregate above threshold | read aggregate | full server/job |

## Draft Rules

- Consumers may not set rows for another `user_id`.
- Consumers may not write server-owned aggregate fields.
- Restaurants may not read raw meal records, ratings, favorites, dietary restrictions, or private profile rows.
- Aggregate restaurant views need a minimum 10-consumer cohort threshold before exposure.
- Platform reviewer/admin policies require audit and security review.
- Service role policies are server/job only.
## Phase 1.1 Threat Review Matrix

| Scenario | Expected protection | Current draft coverage | Remaining review |
| --- | --- | --- | --- |
| Consumer A reads Consumer B private profile | owner-scoped `auth.uid() = user_id` | owner RLS policies on private/profile/preference tables | execute in Supabase RLS harness |
| Consumer A reads Consumer B meal records | owner-scoped meal policies | owner policies on `meal_records`, `meal_record_items`, analyses/corrections/adjustments | execute parent-child ownership tests |
| Consumer writes another `user_id` | `with check (auth.uid() = user_id)` | owner write policies for private tables | generated API must not override user_id server-side incorrectly |
| Consumer writes daily summary server fields | no client write policy for summaries | select-only owner policy on `daily_nutrition_summaries` | define server job/RPC writer |
| Consumer creates rating/favorite for another user | owner `with check` | owner policies on ratings/favorites | execute insert/update tests |
| Restaurant reads raw meal records | no restaurant policies on raw tables | no restaurant raw table access in draft | verify Restaurant role cannot query raw tables |
| Restaurant bypasses menu-item filters to infer consumer data | aggregate view threshold only | `restaurant_consumer_aggregate_metrics` has minimum 10-consumer cohort threshold | final threshold and tenancy filter require review |
| Platform reviewer reads private data without audit | no reviewer policy yet | reviewer/admin intentionally omitted | design audited reviewer path before runtime |
| Browser client writes legacy mappings | no client policy | no owner policy on `legacy_consumer_entity_mappings` | service-only import path required |
| Browser client edits consent/deletion audit history | limited owner insert/read only | consent owner read; deletion request insert only | exact consent update/revoke workflow required |
| Soft-deleted favorite bypasses uniqueness | partial unique indexes | active favorite unique indexes use `removed_at is null` | restore behavior product decision |
| Public view leaks health/diet restrictions | public-safe view excludes private table fields | `consumer_public_profiles` excludes private columns | SQL execution validation query required |

## Server-Owned Field Notes

These fields/tables should be server/job managed, not broad direct Mobile writes:

- `daily_nutrition_summaries`
- `consumer_data_change_logs`
- `legacy_consumer_entity_mappings`
- aggregate/de-identified restaurant views
- platform reviewer/admin moderation fields
- deletion/anonymization completion metadata

## RLS Execution Prerequisite

The draft policies use `auth.uid()`. Phase 1.2 static review can confirm shape only; it cannot prove RLS correctness without a disposable Supabase/PostgreSQL environment and authenticated test users.
