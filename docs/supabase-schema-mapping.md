# Supabase Schema Mapping Preparation

Last updated: 2026-07-11

## 1. Purpose and Scope

This document maps the current TastKind / Haocu canonical restaurant domain to a proposed Supabase PostgreSQL schema. It is Phase 1 preparation only.

No runtime application has been connected to Supabase. No mock adapter has been removed. No active migration has been executed. The shared mock dataset remains the current runtime source for Mobile, Restaurant Web Console, and Admin Web Console.

## 2. Current Canonical Domain Source

Canonical TypeScript domain:

- `packages/shared/src/domain/restaurantDomain.ts`

Canonical mock dataset:

- `packages/shared/src/mock/restaurant-platform/restaurants.ts`
- `packages/shared/src/mock/restaurant-platform/menus.ts`
- `packages/shared/src/mock/restaurant-platform/nutrition.ts`
- `packages/shared/src/mock/restaurant-platform/pending-menu-items.ts`
- `packages/shared/src/mock/restaurant-platform/analytics-events.ts`
- `packages/shared/src/mock/restaurant-platform/employees.ts`
- `packages/shared/src/mock/restaurant-platform/governance.ts`
- `packages/shared/src/mock/restaurant-platform/assistant.ts`

Current application boundaries remain:

- Mobile adapter: `apps/mobile/adapters/mock/mobile-restaurant-mock-adapter.ts`
- Restaurant Web adapter: `apps/restaurant-web/adapters/mock/restaurant-console-mock-adapter.ts`
- Admin Web adapter: `apps/admin-web/adapters/mock/admin-restaurant-mock-adapter.ts`

## 3. Entity-to-Table Mapping

| Current TypeScript type | Current mock dataset | Current consumers | Classification | Proposed database object |
| --- | --- | --- | --- | --- |
| `Restaurant` | `restaurants.ts` | Mobile, Restaurant Web, Admin Web | Canonical data | `restaurants` table |
| `RestaurantBranch` | `restaurants.ts` | Mobile, Restaurant Web, Admin Web | Canonical data | `restaurant_branches`, `branch_business_hours`, `branch_special_hours` tables |
| `Menu` | `menus.ts` | Restaurant Web, Mobile via adapter | Canonical data | `menus` table |
| `MenuCategory` | `menus.ts` | Restaurant Web, Mobile via adapter | Canonical data | `menu_categories` table |
| `MenuItem` | `menus.ts` | All three apps, AI recommendation references | Canonical data | `menu_items` table plus `menu_category_items` join table |
| `BranchMenuItem` | `menus.ts` | Mobile availability/pricing, Restaurant Console | Canonical data | `branch_menu_items` table |
| `MenuItemVariant` | `menus.ts` | Restaurant Console | Canonical data | `menu_item_variants` table |
| `MenuItemAlias` | `menus.ts` | Mobile compatibility lookup, Admin alias review | Canonical data / compatibility bridge | `menu_item_aliases` table |
| `Ingredient` | `nutrition.ts` | Restaurant/Admin nutrition flows | Canonical data | `ingredients` table |
| `IngredientNutrition` | `nutrition.ts` | Nutrition services | Canonical data | `ingredient_nutrition` table |
| `MenuItemIngredient` | `nutrition.ts` | Nutrition services | Canonical data | `menu_item_ingredients` table |
| `MenuItemNutrition` | `nutrition.ts` | Mobile nutrition display, Restaurant/Admin review | Canonical current official/reviewed data | `menu_item_nutrition` table and `current_menu_item_nutrition` view |
| `NutritionEstimate` | `nutrition.ts` | AI/admin nutrition workflow | AI estimate history | `nutrition_estimates` table |
| `NutritionReview` | `nutrition.ts` | Admin review queue | Governance workflow | `nutrition_reviews` table |
| `NutritionChangeLog` | `nutrition.ts` | Admin audit/history | Governance history | `nutrition_change_logs` table |
| `PendingMenuItem` | `pending-menu-items.ts` | Mobile unresolved input, Restaurant/Admin queues | Pending canonical candidate | `pending_menu_items`, `pending_menu_item_candidates`, `pending_menu_item_actions` tables |
| `MealRecord` | Type only in restaurant domain | Mobile meal architecture elsewhere | Application/user data | Future `meal_records`; not in restaurant schema draft except FK references |
| `UserFoodPreference` | Type only | Future AI recommendation | Application/user data | Future consumer profile/preference tables; not drafted here |
| `MenuItemRating` | `analytics-events.ts` | Mobile/Restaurant analytics | User-owned event/feedback data | `menu_item_ratings` table |
| `RecommendationResult` | `analytics-events.ts` | Mobile recommendation and Admin anomaly review | Recommendation reference | `recommendation_results`, `recommendation_reasons` tables |
| `AnalyticsEvent` | `analytics-events.ts` | Restaurant Dashboard, Admin data quality | Analytics record | `analytics_events` table |
| `RestaurantEmployee` | `employees.ts` | Restaurant Console staff | Restaurant-owned staff data | `restaurant_employees` table |
| `RestaurantUser` | `employees.ts` | Restaurant Console auth/account mapping | Account mapping | `restaurant_users` table |
| `EmployeeBranchAssignment` | `employees.ts` | Restaurant staff scope | Staff relationship | `employee_branch_assignments` table |
| `EmployeeRoleAssignment` | `employees.ts` | Staff permissions | Staff relationship | `employee_role_assignments`, `restaurant_roles`, `role_permissions` tables |
| `EmployeeTransferLog` | `employees.ts` | Staff history and analytics | Audit/governance record | `employee_transfer_logs` table |
| `RestaurantReview`, `BranchReview` | `governance.ts` | Admin governance | Governance workflow | `restaurant_change_requests` table |
| `MenuItemMergeCandidate` | `governance.ts` | Admin duplicate review | Governance workflow | `menu_item_merge_candidates` table |
| `AliasReview` | `governance.ts` | Admin alias review | Governance workflow | `alias_reviews` table |
| `DataQualityIssue` | `governance.ts` | Admin data quality | Governance record | `data_quality_issues` table |
| `RecommendationAnomaly` | `governance.ts` | Admin recommendation review | Governance record | `recommendation_anomalies` table |
| `AnalyticsEventIssue` | `governance.ts` | Admin analytics review | Derived quality issue | Prefer `analytics_event_quality_issues` view plus optional `data_quality_issues` rows |
| `AdminActionDraft` | `governance.ts` | Admin draft-and-confirm actions | Governance workflow | `admin_action_drafts` table |
| `AuditLog` | `governance.ts`, `assistant.ts` | Admin/restaurant audit trails | Immutable audit record | `audit_logs` table |
| `AssistantSuggestion`, `AssistantActionDraft` | `assistant.ts` | Restaurant assistant UI | Application ViewModel/mock assistant state | Remain application-level in this phase; may map later to assistant prompt/action tables |

Do not create one table for every UI ViewModel. Application ViewModels remain service-layer objects.

## 4. Table Inventory

Draft SQL files live under `docs/supabase-schema-drafts/` and are intentionally not active Supabase migrations.

Restaurant and branch:

- `restaurants`
- `restaurant_branches`
- `branch_business_hours`
- `branch_special_hours`

Accounts, employees, and memberships:

- `restaurant_users`
- `restaurant_employees`
- `restaurant_memberships`
- `employee_branch_assignments`
- `employee_role_assignments`
- `employee_transfer_logs`
- `restaurant_roles`
- `role_permissions`

Menus and menu items:

- `menus`
- `menu_categories`
- `menu_items`
- `menu_category_items`
- `branch_menu_items`
- `menu_item_variants`
- `option_groups`
- `option_items`
- `menu_item_option_groups`

Aliases and pending items:

- `menu_item_aliases`
- `pending_menu_items`
- `pending_menu_item_candidates`
- `pending_menu_item_actions`

Ingredients and nutrition:

- `ingredients`
- `ingredient_nutrition`
- `menu_item_ingredients`
- `menu_item_nutrition`
- `nutrition_estimates`
- `nutrition_reviews`
- `nutrition_change_logs`

Analytics and recommendations:

- `analytics_event_types`
- `analytics_events`
- `menu_item_ratings`
- `recommendation_results`
- `recommendation_reasons`
- `recommendation_anomalies`

Governance and audit:

- `admin_action_drafts`
- `restaurant_change_requests`
- `menu_item_merge_candidates`
- `alias_reviews`
- `data_quality_issues`
- `audit_logs`

Migration support:

- `legacy_entity_mappings`

## 5. Key Relationships

All relationships use UUID keys in production design. Display names are never relational keys.

- `restaurants -> restaurant_branches`
- `restaurants -> menus -> menu_categories -> menu_category_items -> menu_items`
- `menu_items -> branch_menu_items`
- `menu_items -> menu_item_aliases`
- `menu_items -> menu_item_ingredients -> ingredients`
- `ingredients -> ingredient_nutrition`
- `menu_items -> menu_item_nutrition`
- `menu_items -> nutrition_estimates -> nutrition_reviews -> nutrition_change_logs`
- `pending_menu_items -> pending_menu_item_candidates -> menu_items`
- `analytics_events -> restaurants / restaurant_branches / menu_items / recommendation_results`
- `recommendation_results -> restaurants / restaurant_branches / menu_items`
- `restaurant_users -> restaurant_employees` is optional; not every employee has a login account.
- `restaurant_employees -> employee_branch_assignments / employee_role_assignments / employee_transfer_logs`
- High-risk mutations flow through `admin_action_drafts -> audit_logs`.

## 6. Primary and Foreign Key Rules

Production tables use `uuid primary key default gen_random_uuid()`. Current mock IDs remain stable legacy IDs and are not replaced in code during this phase.

Every canonical reference currently expressed as a mock string ID should be imported through `legacy_entity_mappings`:

- `source_system`
- `source_entity_type`
- `legacy_id`
- `canonical_uuid`
- `target_table`
- `import_batch_id`
- `migrated_at`

Imports must resolve child references through this mapping table, not by display names.

## 7. Enum and Status Decisions

Recommended PostgreSQL enums:

- Stable operational states: restaurant status, branch status, menu status, menu-item status, branch-menu-item availability/status, alias source/status, pending-item status, nutrition source, nutrition verification/review status, employee status, access scope, analytics source, recommendation anomaly status, admin draft status, review request status, data-quality severity.

Recommended lookup tables:

- `analytics_event_types`, because event instrumentation expands often and should not require a database enum migration for every new event.
- `restaurant_roles` and `role_permissions`, because roles and permissions are product/governance configuration.

Trade-off: PostgreSQL enums give stronger constraints and clearer app contracts for stable states. Lookup tables are better for frequently expanded product vocabularies and permissions.

## 8. Index Strategy

Indexes prioritize common reads:

- Public active restaurants, branches, menus, and menu items.
- Branch menu item availability and sold-out filtering.
- Alias lookup by restaurant/branch and normalized alias.
- Pending item queues by restaurant/status.
- Current nutrition per menu item.
- Recommendation history by user and generated time.
- Analytics by restaurant/time, menu item/time, and recommendation ID.
- Staff scope and audit-log target lookups.

Analytics summaries should be produced from raw events via normal or materialized views, not hardcoded summary tables at this phase.

## 9. Nutrition Versioning

Recommended approach:

- `menu_item_nutrition` stores the current official or currently reviewed nutrition row. A partial unique index enforces only one `is_current = true` row per menu item.
- `nutrition_estimates` stores immutable AI estimate history and model versions.
- `nutrition_reviews` records approval, rejection, needs-changes, and partial-adoption decisions.
- `nutrition_change_logs` stores immutable before/after history for official changes.

Trade-off: A fully versioned `menu_item_nutrition_versions` model is more historically pure, but it increases query complexity for the current MVP. The recommended current-row plus immutable change-log approach matches the current domain and keeps Mobile/Restaurant/Admin reads simple while preserving auditability.

Official nutrition and AI estimates remain separate. AI estimates must never directly overwrite current official nutrition.

## 10. Alias and PendingMenuItem Workflow

Workflow:

1. User input or AI detection normalizes a food name.
2. Search `menu_item_aliases` by restaurant/branch scope and normalized alias.
3. If no approved alias resolves, search candidate `menu_items`.
4. Create or update `pending_menu_items` using duplicate suppression by restaurant, optional branch, and normalized input.
5. Store candidate matches in `pending_menu_item_candidates`.
6. Restaurant or admin review writes `pending_menu_item_actions`.
7. Resolution options:
   - Map to existing `menu_items`.
   - Create a new menu item draft, not an official active item.
   - Reject as not belonging to the restaurant.
   - Create an approved alias where appropriate.
8. High-risk resolutions may require `admin_action_drafts` and `audit_logs`.

Pending records never automatically enter official menu tables.

## 11. Analytics Event Architecture

`analytics_events` is the raw event table. It supports:

- Menu item impressions, views, favorites, future cart/order events.
- Nutrition badge enabled/disabled events.
- Recommendation impressions/clicks.
- Restaurant page views.
- Pending-menu-item submit/resolve events.
- Employee transfer and role-change events.

Nullable fields depend on event type:

- `restaurant_id` is required for restaurant page, pending item, employee, and most menu/recommendation events.
- `menu_item_id` is required for menu item and nutrition badge events.
- `recommendation_id` is required for recommendation events.
- `branch_id` is required when a branch-specific exposure, availability, or staff event is recorded.
- `user_id` may be null for anonymous or aggregate mock events.

Deduplication:

- Use optional `event_idempotency_key` with a unique constraint.
- Client-generated UUID event IDs are acceptable, but server-side idempotency keys are safer for retries.

Retention:

- Keep raw events for a defined retention window.
- Use materialized views for dashboard summaries.
- Consider partitioning by month once event volume grows.

## 12. Recommendation References

`recommendation_results` stores model output tied to canonical IDs:

- `user_id`
- `restaurant_id`
- `branch_id`
- `menu_item_id`
- score fields
- model version

`recommendation_reasons` stores reason codes separately so the model can add/remove explanations without changing the core result row. `recommendation_anomalies` supports Admin inspection when a recommendation references unavailable items, missing nutrition, or suspicious fit.

## 13. Employee and Account Separation

`restaurant_employees` are staff records. `restaurant_users` are login-capable accounts linked to Supabase Auth via `auth_user_id`.

Not every employee needs a login account. A login account may be linked to an employee when staff portal access is needed. Roles and branch assignments are separate from the auth account so transfers and permission changes remain auditable.

## 14. Governance and Audit Model

High-risk operations should use draft-and-confirm:

- `admin_action_drafts` stores proposed action, target, before/after data, reason, actor, confirmation status, and optional audit link.
- `audit_logs` stores immutable actor/action/target/result/before/after context.
- `restaurant_change_requests`, `menu_item_merge_candidates`, `alias_reviews`, `data_quality_issues`, and `recommendation_anomalies` provide domain-specific review queues.

`before_data` and `after_data` are `jsonb` because audited diffs vary by entity. This is acceptable because the canonical relational records remain normalized in their own tables.

## 15. RLS Draft

The RLS draft in `013_rls_policy_drafts.sql` is not production-certified.

Mobile consumers may read:

- active restaurants
- active branches
- active menu items
- available branch menu items
- current verified official nutrition

Mobile consumers may create or manage their own:

- analytics events
- pending menu item submissions
- future meal records, favorites, and private ratings

Mobile consumers must not edit official restaurants, menu items, staff data, official nutrition, or governance records.

Restaurant users may:

- read/write scoped restaurant data.
- manage branch menu availability and allowed menu drafts.
- submit nutrition updates.
- process pending items within restaurant/branch scope.
- view scoped analytics.
- manage staff only if role permissions allow it.

Restaurant users must not:

- access unrelated restaurants.
- approve platform-level nutrition verification.
- directly mutate platform governance records.

Admin users may:

- review and govern according to platform role.
- use `admin_action_drafts` for high-risk actions.
- read audit logs according to reviewer/auditor scope.

Service role:

- Reserved for trusted import, backfill, analytics aggregation, and scheduled jobs.

## 16. Mock ID to UUID Migration Strategy

Use `legacy_entity_mappings` to preserve traceability from current mock IDs to production UUIDs.

Recommended import flow:

1. For each mock restaurant, branch, menu, category, menu item, alias, nutrition row, estimate, pending item, analytics event, recommendation, employee, and governance record, create or reuse a UUID.
2. Insert a mapping row keyed by `(source_system, source_entity_type, legacy_id)`.
3. Insert parent tables first, then resolve child FKs through the mapping table.
4. Use idempotent `on conflict do nothing` or controlled `do update` only for safe import metadata.
5. Prevent duplicate imports with unique constraints on the mapping table and natural-scope constraints such as alias uniqueness.

Mobile compatibility references remain resolvable by mapping current string IDs to UUIDs at adapter/import boundaries. Do not replace existing mock IDs inside current code in this phase.

## 17. Migration Sequence

Recommended draft order:

1. Extensions and helper functions.
2. Enums and lookup tables.
3. Restaurants, branches, business hours, and special hours.
4. Restaurant users, employees, memberships, roles, permissions, assignments, and transfers.
5. Menus, categories, menu items, branch menu items, variants, and options.
6. Ingredients and nutrition tables.
7. Aliases and pending menu item workflow tables.
8. Recommendation tables.
9. Analytics event tables.
10. Governance and audit tables.
11. Indexes.
12. Views and materialized views.
13. RLS helper functions and draft policies.
14. Seed mapping table/import strategy.
15. Validation queries.

## 18. Views and Materialized Views

Physical tables:

- Canonical entities, relationship tables, governance records, raw analytics events.

Normal views:

- `published_branch_menu_items`
- `current_menu_item_nutrition`
- `unresolved_pending_menu_items`
- `restaurant_staff_access_scope`
- `analytics_event_quality_issues`

Materialized views:

- `restaurant_exposure_summary`
- `nutrition_badge_performance`
- `menu_item_performance`

Application ViewModels:

- Mobile restaurant cards, recommendation cards, Restaurant Web dashboard cards, Admin governance cards.

Trade-off: normal views keep data current with less operational overhead. Materialized views are useful for analytics summaries but require refresh scheduling.

## 19. Required Design Decisions and Recommendations

| Decision | Recommendation | Trade-off |
| --- | --- | --- |
| PostgreSQL enum vs lookup table | Use enums for stable states; lookup tables for analytics event types, roles, and permissions. | Enums are stricter; lookup tables are easier to expand. |
| Soft delete vs hard delete | Soft-delete canonical restaurant/menu/staff entities with `deleted_at`; hard-delete dependent draft rows only when safe. | Soft delete preserves references but requires filtered reads. |
| Current nutrition row vs fully versioned rows | Use one current row plus immutable change logs and AI estimate history. | Simpler reads, still auditable; less pure than full versioning. |
| Raw analytics vs summary tables | Store raw events, derive summaries via views/materialized views. | More flexible, needs retention/aggregation plan. |
| Normal view vs materialized view | Normal for current public/menu state; materialized for analytics. | Materialized views improve dashboard speed but need refresh jobs. |
| Restaurant-level vs branch-level menu ownership | `menu_items` are restaurant-level; `branch_menu_items` owns price and availability. | Prevents duplicate official items; requires joins for branch UI. |
| Display snapshots alongside canonical IDs | Keep canonical IDs primary; allow limited analytics metadata snapshots only. | Avoids name-key bugs while preserving historical event context. |
| Audit `jsonb` before/after fields | Use `jsonb` only in audit/draft records. | Flexible diffs without denormalizing canonical tables. |
| Alias uniqueness scope | Unique by restaurant normalized alias, plus branch scoped uniqueness when branch-specific. | Prevents ambiguous resolution while allowing branch-specific aliases. |
| Pending duplicate suppression | Unique generated duplicate key for unresolved pending records. | Prevents queue spam; resolved/rejected records can remain historical. |
| Employee/auth account relationship | Separate employee records from login accounts. | Supports non-login employees and auditable account lifecycle. |

## 20. Production Implementation Prerequisites

Before runtime Supabase integration:

- Human schema review.
- Security review of all RLS helpers and policies.
- Decide exact Supabase Auth custom-claim strategy for platform roles.
- Decide consumer user/profile table ownership for Mobile user IDs.
- Add SQL linting or test database validation.
- Create idempotent import scripts using `legacy_entity_mappings`.
- Add rollback strategy for real migrations.
- Decide analytics retention, partitioning, and materialized-view refresh cadence.
- Confirm whether assistant suggestion/action drafts need production persistence in this phase.


## 21. Phase 1.1 Freeze Review Addendum

Phase 1.1 review and freeze-preparation artifacts, now superseded by Phase 1.2 final freeze:

- `docs/supabase-schema-phase-1-1-freeze-review.md`
- `docs/supabase-schema-decision-register.md`

Schema authority decision:

- Current review baseline: this mapping document plus `docs/supabase-schema-drafts/*.sql` and the decision register.
- Historical skeleton handling after Phase 1.2: `supabase/schema.sql` is a deprecated redirect stub, and the old skeleton is archived at `docs/supabase-historical-schema-skeleton.md`.
- No draft SQL is an active migration.

Phase 1.1 resolved draft issues:

- `nutrition_badge_status` now has its own SQL enum and no longer reuses nutrition verification status.
- Analytics event draft now includes `anonymous_id`, `menu_id`, `platform`, `device_type`, `schema_version`, and `ingested_at`.
- `legacy_entity_mappings` now includes dataset version, row checksum, import status, and rollback batch metadata.

Freeze label meaning:

- Review-ready: yes.
- Runtime-integration-ready: no.
- Migration-ready: no.


## 22. Phase 1.2 Final Decision Freeze Addendum

Freeze version: `supabase-schema-freeze-2026-07-11-phase-1.2`

Phase 1.2 final freeze artifacts:

- `docs/supabase-schema-freeze-manifest.md`
- `docs/supabase-schema-decision-register.md`
- `docs/supabase-historical-schema-skeleton.md`

Final authority decision:

- Review baseline: `docs/supabase-schema-mapping.md`, `docs/supabase-schema-decision-register.md`, `docs/supabase-schema-freeze-manifest.md`, and `docs/supabase-schema-drafts/*.sql`.
- Deprecated skeleton: `supabase/schema.sql` is a redirect stub with no executable SQL.
- Historical archive: `docs/supabase-historical-schema-skeleton.md`.

Phase 1.2 frozen decisions:

- `RestaurantBranch.isActive = false` maps to SQL `branch_status = 'inactive'`.
- Runtime TypeScript status unions remain unchanged until a runtime integration phase explicitly adds mapping adapters.
- Restaurant/branch/employee tenancy must be resolved through membership and role-assignment tables; custom claims are not the tenancy source of truth.
- Consumer profile table/view design is deferred and does not block Restaurant Web read-only integration.
- MVP analytics does not require partitioning; retention and partitioning are deferred to infrastructure phase.
- Materialized view refresh is an operations concern and not part of the schema freeze.
- Assistant suggestions remain deferred and do not block Restaurant Web read-only integration.

Freeze status:

- Frozen candidate for human review: yes.
- Runtime integration ready: no.
- Active migration ready: no.
