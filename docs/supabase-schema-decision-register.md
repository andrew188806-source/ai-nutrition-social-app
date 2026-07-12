# Supabase Schema Decision Register

Last updated: 2026-07-11
Freeze version: supabase-schema-freeze-2026-07-11-phase-1.2

Scope: Phase 1.2 final decision freeze. This register does not start runtime Supabase integration, execute SQL, authorize active migrations, or replace mock adapters.

## Decision Status Legend

- Accepted: decision is frozen for the current schema review baseline.
- Deferred: explicitly postponed and must be revisited before the relevant later phase.
- Requires Security Review: design direction is frozen, but security implementation requires review.
- Does Not Block Restaurant Read-only Integration: safe to defer for a future write or infrastructure phase.
- Blocks Runtime Integration: must be resolved before write-enabled or production runtime integration.

## Decision Summary

| ID | Topic | Frozen decision | Status | Blocks runtime integration? | Blocks Restaurant Web read-only integration? |
| --- | --- | --- | --- | --- | --- |
| DB-001 | Schema authority | docs/supabase-schema-mapping.md plus docs/supabase-schema-drafts/*.sql are the schema review baseline. supabase/schema.sql is a deprecated redirect stub. | Accepted | No | No |
| DB-002 | Active migration source | No active migration source exists. Draft SQL can become migrations only after human DB/security review. | Accepted | Yes | No |
| DB-003 | TypeScript status vs SQL status | Keep runtime TypeScript unions unchanged. Import/runtime adapters must map richer SQL statuses. | Accepted | No | No |
| DB-004 | Menu active vs published | Map TS/mock Menu.status active to SQL menu_status published. draft and archived map directly. | Accepted | No | No |
| DB-005 | Branch isActive vs branch_status | Map isActive true to active. Map isActive false to inactive. temporarily_closed and archived require future metadata. | Accepted | No | No |
| DB-006 | Nutrition publication model | menu_item_nutrition stores current published/reviewed nutrition. nutrition_estimates stores raw AI history. | Accepted | No | No |
| DB-007 | AI estimate adoption | AI estimates may become current nutrition only through nutrition_reviews plus confirmed action/audit flow. | Accepted | Yes for writes | No |
| DB-008 | Analytics event type model | Use analytics_event_types lookup table, not PostgreSQL enum. | Accepted | No | No |
| DB-009 | Analytics actor fields | Support user_id and anonymous_id. Require actor context except admin/server events. | Accepted | Yes for analytics writes | No |
| DB-010 | Analytics retention | MVP keeps raw analytics_events unpartitioned. Retention, partitioning, and purge jobs are deferred to infrastructure phase. | Deferred / Does Not Block Restaurant Read-only Integration | No for read-only | No |
| DB-011 | Materialized view refresh | Define materialized views in draft SQL, but no automatic refresh in MVP schema freeze. Refresh cadence is operations-phase work. | Deferred / Does Not Block Restaurant Read-only Integration | No for read-only | No |
| DB-012 | RLS security-definer strategy | Do not rely on SECURITY DEFINER functions in the first read-only integration. Any future SECURITY DEFINER function requires search_path, actor, membership, input, audit, and security review. | Requires Security Review | Yes for writes | No |
| DB-013 | Auth custom claims | Custom claims are not the source of truth for restaurant/branch/employee tenancy. Membership and role tables are source of truth. Platform admin claims require security review. | Accepted / Requires Security Review | Yes for admin writes | No |
| DB-014 | Consumer profile ownership | Consumer private profiles should be owner-scoped and separate from public/community profile views. Exact table design is deferred outside restaurant-platform freeze. | Deferred / Does Not Block Restaurant Read-only Integration | No for restaurant read-only | No |
| DB-015 | Employee/account separation | restaurant_employees are domain records. restaurant_users are login accounts. Not every employee has a login. | Accepted | No | No |
| DB-016 | Restaurant owner/admin branch access | Restaurant owner/admin scope is restaurant-level and can span branches through memberships/role assignments. Branch manager scope is branch-limited. | Accepted | Yes for writes | No |
| DB-017 | Legacy ID mapping | Use legacy_entity_mappings with source_system, source_dataset_version, source_entity_type, legacy_id, canonical_uuid, checksum, import_status, rollback_batch_id. | Accepted | Yes for import | No |
| DB-018 | Import rollback | Track rollback metadata in mapping table. Actual import/rollback script is deferred and must be built before any seed import. | Deferred / Blocks Import | Yes for import | No |
| DB-019 | Assistant persistence | AssistantSuggestion and AssistantActionDraft remain mock/app-level. Production persistence is deferred and does not block Restaurant Web read-only integration. | Deferred / Does Not Block Restaurant Read-only Integration | No | No |
| DB-020 | Analytics ingestion path | Runtime should not rely on direct client insert for production analytics. Use RPC, Edge Function, or ingestion service for validation. | Accepted / Blocks Analytics Writes | Yes for analytics writes | No |
| DB-021 | Direct client writes | Consumer direct writes are limited to low-risk owned records. Restaurant/admin high-risk changes must go through RPC/server flow with audit. | Accepted / Requires Security Review | Yes for writes | No |
| DB-022 | SQL execution | No draft SQL is executed in Phase 1.2. Validation is static/typecheck/audit only. | Accepted | No | No |

## Status Mapping Matrix

| Domain concept | TypeScript/mock value | SQL draft value | Import mapping | Runtime compatibility behavior |
| --- | --- | --- | --- | --- |
| RestaurantStatus | active | active | direct | existing runtime unchanged |
| RestaurantStatus | paused | paused | direct | existing runtime unchanged |
| RestaurantStatus | none | draft, archived | production-only richer states | adapters hide unsupported states until runtime migration |
| RestaurantBranch | isActive true | active | true -> active | current boolean facade may derive from status = active |
| RestaurantBranch | isActive false | inactive | false -> inactive | temporary_closed/archive require future metadata |
| MenuStatus | draft | draft | direct | unchanged |
| MenuStatus | active | published | active -> published | runtime may map published back to active for old UI |
| MenuStatus | archived | archived | direct | unchanged |
| MenuItemStatus | draft | draft | direct | unchanged |
| MenuItemStatus | active | active | direct | unchanged |
| MenuItemStatus | archived | archived | direct | unchanged |
| BranchMenuItem.availability | available | available | direct | unchanged |
| BranchMenuItem.availability | limited | limited | direct | unchanged |
| BranchMenuItem.availability | unavailable | unavailable | direct | unchanged |
| BranchMenuItemStatus | available | available | direct | unchanged |
| BranchMenuItemStatus | hidden | hidden | direct | unchanged |
| BranchMenuItemStatus | discontinued | discontinued | direct | unchanged |
| NutritionBadgeStatus | approved | approved | direct | badge may display as official/approved |
| NutritionBadgeStatus | ai_estimated | ai_estimated | direct | badge may display AI-estimated with product guardrails |
| NutritionBadgeStatus | pending_review | pending_review | direct | hidden/review state |
| NutritionBadgeStatus | missing | missing | direct | no badge/current nutrition unavailable |
| VerificationStatus | verified | verified | direct | official review complete |
| VerificationStatus | ai_estimated | ai_estimated | direct | estimate visible only if product allows |
| VerificationStatus | pending_review | pending_review | direct | review queue state |
| VerificationStatus | rejected | rejected | direct | not publishable |
| MenuItemAliasStatus | pending | pending | direct | not a trusted resolution unless review flow allows |
| MenuItemAliasStatus | approved | approved | direct | trusted alias lookup |
| MenuItemAliasStatus | rejected | rejected | direct | excluded from lookup |
| MenuItemAliasStatus | merged | merged | direct | redirect through canonical target |
| PendingMenuItemStatus | pending | pending | direct | unresolved queue |
| PendingMenuItemStatus | matched_existing_item | matched_existing_item | direct | resolved to existing item |
| PendingMenuItemStatus | confirmed_new_item | confirmed_new_item | direct | new item draft confirmed, not auto-published |
| PendingMenuItemStatus | rejected | rejected | direct | closed/rejected |
| PendingMenuItemStatus | needs_more_information | needs_more_information | direct | unresolved queue |
| AnalyticsEventType | union value | analytics_event_types.event_type | lookup insert/upsert | runtime can keep string union until generated DB types exist |
| AnalyticsSource | union value | analytics_source enum | direct | unchanged |

## Frozen Runtime Integration Gate

Restaurant Web read-only Supabase integration may be planned after human review if it remains feature-flagged and keeps mock fallback. It must not include writes, migrations, seed import, analytics ingestion, RLS production claims, or UI redesign.

Runtime write integration remains blocked until security review, RLS implementation, import/rollback scripts, and SQL validation are complete.

## Runtime Integration Note - Phase 1A Restaurant Web Read-only Scaffolding

A feature-flagged Restaurant Web read-only scaffold may exist while Gate 1.1 remains blocked, provided it keeps `mock` as the default data source, performs no writes, creates no active migrations, does not connect to production, and documents that DB/RLS verification is still incomplete.

This does not change the frozen schema candidate status and does not mark Gate 1.1 as passed.

## Runtime Integration Note - Phase 1B Blocked by Package Lock Permission

Restaurant Web Supabase Runtime Integration Phase 1B was attempted but stopped before runtime service wiring because npm could not update root `package-lock.json` for `@supabase/supabase-js`.

This preserves the Phase 1A mock-default scaffold and does not change Gate 1.1 blocked status.

## Runtime Integration Note - Phase 1B-R REST Transport

Dependency-free REST is the accepted current Restaurant Web read-only transport because package-lock dependency normalization remains blocked. `supabase-js` is deferred and optional.

Transport replacement must not change Repository, Service, ViewModel, UI, shared canonical domain, shared mock dataset, or frozen schema contracts. Future `supabase-js` activation must implement `ReadonlyDatabaseClient` and pass parity tests before selection.

This does not mark Gate 1.1, DB verification, RLS verification, Auth integration, or production readiness as complete.
## Runtime Integration Note - Phase 1C Development Public Read

Phase 1C is blocked by missing development Supabase environment. A development-only public-read activation pack and smoke script exist, but no SQL was executed and no live Supabase project was contacted.

This does not mark Gate 1.1, DB verification, RLS verification, Auth integration, private analytics, or production readiness as complete.
## Runtime Integration Note - Phase 1C Missing Development Schema

Phase 1C smoke testing reached the configured development Supabase project with GET-only REST requests and fallback disabled, but expected public resources returned HTTP 404. The next blocker is development schema/seed application, not runtime wiring.
## Runtime Integration Note - Phase 1C Development Public Read Verified

Phase 1C development public REST reads succeeded with fallback disabled for the required public resources. This validates development public-read connectivity only and does not mark DB/RLS/Auth/security review or production readiness complete.
## Runtime Integration Note - Phase 1D Restaurant Web Development Live Read Parity

Phase 1D verified the Restaurant Web development read-only runtime path with fallback disabled and dependency-free REST transport. Public development resources returned HTTP 200 with one row each for restaurants, branches, menus, menu categories, menu items, branch menu items, and current published nutrition.

The verification covers service/repository/transport path selection, structural ViewModel parity, canonical row mapping, mock rollback, fallback-on guard behavior, and private analytics auth-required exclusion. It does not execute SQL, create migrations, seed data, contact production, use service-role credentials, approve RLS/Auth, or enable write/runtime production integration.
