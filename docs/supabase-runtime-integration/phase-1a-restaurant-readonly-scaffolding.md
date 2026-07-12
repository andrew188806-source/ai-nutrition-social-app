# Supabase Runtime Integration Phase 1A: Restaurant Web Read-only Scaffolding

Date: 2026-07-11
Status: Phase 1A scaffolding complete, live database unverified
Default data source: `mock`

## 1. Scope

This phase adds a feature-flagged Restaurant Web read-only Supabase scaffolding layer. It prepares configuration, server-only client boundaries, row mappers, read repository interfaces, a mock implementation, a Supabase read-only implementation, and guard checks.

It does not start production rollout.

## 2. Accepted Risk

Gate 1.1 remains blocked by missing disposable DB tooling. The SQL drafts, constraints, and RLS policies are not DB-executed or security-certified. This phase accepts only scaffolding risk: code can compile and can be reviewed, but it must keep the mock data source as the default.

## 3. Gate 1.1 Blocked Status

Gate 1.1 is still `Blocked by Missing Disposable DB Tooling` because this workstation does not have `psql`, Supabase CLI, or Docker on PATH. No SQL was executed and no Auth/JWT/RLS harness was run.

## 4. Architecture

Current safe path:

`shared canonical domain -> shared mock dataset -> Restaurant Web mock adapter -> legacy repositories/services -> UI`

New scaffolded path:

`Supabase rows -> server-only readonly client -> row mappers -> RestaurantReadRepository -> future async service/ViewModel boundary`

The current UI remains on the mock path. The Supabase path is present for review and fake-client testing only.

## 5. File Changes

- `apps/restaurant-web/config/restaurant-data-source.ts`
- `apps/restaurant-web/adapters/supabase/errors.ts`
- `apps/restaurant-web/adapters/supabase/server-readonly-client.ts`
- `apps/restaurant-web/adapters/supabase/rows.ts`
- `apps/restaurant-web/adapters/supabase/mappers.ts`
- `apps/restaurant-web/repositories/restaurant-read-repository.ts`
- `apps/restaurant-web/repositories/mock-restaurant-read-repository.ts`
- `apps/restaurant-web/repositories/restaurant-read-repository-factory.ts`
- `apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts`
- `apps/restaurant-web/types/server-only.d.ts`
- `scripts/restaurant-supabase-phase-1a-guard.mjs`
- `.env.example`

## 6. Feature Flag

Supported values:

- `mock`
- `supabase-readonly`

Default:

```text
TASTKIND_RESTAURANT_DATA_SOURCE=mock
```

## 7. Environment Variables

```text
TASTKIND_RESTAURANT_DATA_SOURCE=mock
TASTKIND_SUPABASE_URL=
TASTKIND_SUPABASE_PUBLISHABLE_KEY=
TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK=true
```

Do not use `NEXT_PUBLIC_` for the Restaurant Web Supabase runtime variables. Do not commit `.env.local`, database passwords, service-role keys, access tokens, or production project refs.

## 8. Server-only Client Design

`apps/restaurant-web/adapters/supabase/server-readonly-client.ts` is guarded with `import "server-only"` and exposes an injectable `SupabaseReadonlyClient` interface.

Phase 1A intentionally does not instantiate a live `@supabase/supabase-js` client. The factory throws `SupabaseUnavailableError` unless a fake client is injected into the repository for tests. Before Phase 1B activation, install and wire `@supabase/supabase-js` behind this server-only boundary.

## 9. Repository Interface

`RestaurantReadRepository` exposes read-only methods:

- `getRestaurant`
- `listRestaurants`
- `listRestaurantBranches`
- `getBranch`
- `listMenus`
- `listMenuCategories`
- `listMenuItems`
- `listBranchMenuItems`
- `listMenuItemAliases`
- `getCurrentPublishedNutrition`
- `listCurrentPublishedNutrition`
- `getRestaurantDashboardSummary`
- `getRestaurantExposureAnalytics`
- `getNutritionBadgePerformance`
- `getMenuItemPerformance`

No create/save/insert/update/delete/upsert/approve/reject/publish/analytics-write methods are included.

## 10. Table/view Mapping

| Runtime method | Draft SQL source |
| --- | --- |
| Restaurant reads | `restaurants` |
| Branch reads | `restaurant_branches` |
| Menu reads | `menus` |
| Category reads | `menu_categories` |
| Menu item reads | `menu_items` |
| Branch menu item reads | `branch_menu_items` |
| Alias reads | `menu_item_aliases` |
| Current nutrition reads | `current_published_menu_item_nutrition` |
| Exposure analytics reads | `restaurant_exposure_summary` |
| Nutrition badge performance reads | `nutrition_badge_performance` |
| Menu item performance reads | `menu_item_performance` |

## 11. Status Mapping

Runtime mappers keep existing TypeScript domain unions stable:

- SQL `published` restaurant/menu state maps to runtime `active` where required.
- Branch `status`/`is_active` maps to runtime `isActive`.
- Unknown statuses throw `SupabaseMappingError`.
- Whole rows are not cast directly into canonical entities.

## 12. Nutrition Mapping

The scaffold reads only current published nutrition through `current_published_menu_item_nutrition`. Pending, rejected, raw AI estimates, and review internals are not exposed through consumer-style current nutrition reads.

## 13. Analytics Mapping

Phase 1A supports read-only mapping from summary views:

- exposure summaries
- nutrition badge performance
- menu item performance

It does not insert analytics events, emit recommendation events, or implement ingestion RPCs.

## 14. Error Strategy

Typed errors:

- `SupabaseConfigurationError`
- `SupabaseQueryError`
- `SupabaseMappingError`
- `SupabaseUnavailableError`
- `UnsupportedSchemaVersionError`

## 15. Development Fallback

Development fallback is allowed only when:

1. data source is `supabase-readonly`
2. fallback flag is true
3. environment is not production
4. config/client/query/mapping fails

Fallback returns the mock repository and emits a structured warning through the injected logger.

## 16. Production Fail-closed Behavior

Production must not silently fall back to mock data. Missing URL/key or production fallback enabled causes `SupabaseConfigurationError`.

## 17. Tests Executed

Phase 1A guard:

```text
npm.cmd --workspace @haocu/restaurant-web run test:phase1a
```

Additional validation expected for this phase:

- root TypeScript check
- Mobile TypeScript check
- Restaurant Web TypeScript check
- Admin Web TypeScript check
- canonical audit
- runtime import scan
- write-operation scan
- secret/service-role reference scan

## 18. Tests Not Executed

Not executed in Phase 1A:

- SQL apply
- active migration
- seed import
- database reset
- Supabase project linking
- disposable DB RLS harness
- production build with live Supabase credentials
- runtime browser verification against live Supabase

## 19. Runtime Limitations

- Current Restaurant Web UI still uses the synchronous mock repository path.
- Supabase repository is async and not yet wired into the existing UI services.
- `@supabase/supabase-js` is not imported by Phase 1A code.
- A generated database type package does not exist yet.

## 20. Security Limitations

- RLS remains unverified.
- Tenant/branch escape tests remain unexecuted.
- No service-role or secret key may be used in browser/runtime code.
- No direct client writes are allowed.

## 21. DB Prerequisites

Before activation:

- Gate 1.1 disposable DB clean apply passes.
- Recreate passes.
- Constraint tests pass.
- Validation queries pass.
- Auth/JWT/RLS harness passes or receives explicit external security approval.
- Tenant/branch escape tests show no escape.
- `@supabase/supabase-js` is installed and lockfile is updated.
- Generated DB types or reviewed row interfaces are accepted.

## 22. Next Activation Gate

Next gate is Phase 1B activation planning, not live production rollout. Phase 1B may wire Restaurant Web services to the async repository only after Gate 1.1 or an approved external review explicitly clears the database/RLS prerequisites.
