# Supabase Runtime Integration Phase 1D: Restaurant Live Read Parity

Date: 2026-07-11
Status: Phase 1D Complete - Restaurant Web Development Live Read Verified

## 1. Scope

Phase 1D verifies the Restaurant Web development read runtime from the server-side service boundary through the dependency-free Supabase REST transport.

This phase is development-only, read-only, GET-only, and fallback-off for live verification. It does not change UI layout, copy, routes, Mobile runtime, Admin runtime, shared canonical mock data, database schema, SQL, migrations, seed data, Auth, RLS, or production readiness.

## 2. Development Environment Classification

The Phase 1D guard loaded `apps/restaurant-web/.env.local` and classified the configured URL as `supabase-cloud-unclassified`.

Presence-only environment result:

- `TASTKIND_RESTAURANT_DATA_SOURCE`: `supabase-readonly`
- `TASTKIND_SUPABASE_TRANSPORT`: `rest`
- `TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK`: `false`
- Supabase URL: present, value omitted
- Supabase publishable key: present, value omitted

No full URL, publishable key, secret, service-role key, JWT, response body, or credential file content was printed.

## 3. Runtime Service Path

Verified path:

```text
Restaurant Web server boundary
-> restaurant-read-service
-> RestaurantReadRepository factory
-> SupabaseRestaurantReadRepository
-> ReadonlyDatabaseClient
-> FetchRestClient
-> Development Supabase REST
```

Checks passed:

- Service uses repository factory.
- Service does not import REST transport directly.
- UI-facing console service does not import the server-only read service.
- Supabase repository uses `ReadonlyDatabaseClient` and does not fetch directly.

## 4. Repository Factory Selection

`createRestaurantReadRepository` selects:

- `mock` -> `createMockRestaurantReadRepository()` before any Supabase client construction.
- `supabase-readonly` -> `createSupabaseRestaurantReadRepository(createRestaurantReadonlyDatabaseClient(...))`.

The guard confirmed the mock rollback branch is evaluated before Supabase transport construction.

## 5. Transport Factory Selection

`createRestaurantReadonlyDatabaseClient` selects `FetchRestClient` for `TASTKIND_SUPABASE_TRANSPORT=rest`.

`supabase-js` remains explicitly deferred and throws configuration error until dependency normalization and parity tests are approved.

## 6. Live Public Operations Tested

All live operations used public REST GET with fallback disabled.

| Operation | Repository method | Resource | HTTP | Row count | Fallback | Result |
| --- | --- | --- | --- | ---: | --- | --- |
| Restaurant basic information | `getRestaurant` | `restaurants` | 200 | 1 | false | passed |
| Branch list/detail | `listRestaurantBranches` / `getBranch` | `restaurant_branches` | 200 | 1 | false | passed |
| Published menus | `listMenus` | `menus` | 200 | 1 | false | passed |
| Menu categories | `listMenuCategories` | `menu_categories` | 200 | 1 | false | passed |
| Published menu items | `listMenuItems` | `menu_items` | 200 | 1 | false | passed |
| Branch menu items | `listBranchMenuItems` | `branch_menu_items` | 200 | 1 | false | passed |
| Current published nutrition | `listCurrentPublishedNutrition` / `getCurrentPublishedNutrition` | `current_published_menu_item_nutrition` | 200 | 1 | false | passed |

## 7. Canonical Mapping Results

Passed mapping checks:

- String IDs remain canonical string IDs.
- Supabase snake_case rows map to camelCase domain output.
- `published` maps to canonical `active` for menu/menu-item style values.
- Branch `status` / `is_active` maps to `isActive`.
- PostgreSQL numeric/decimal text maps to JavaScript number.
- Nullable fields map to optional domain fields.
- Timestamp fields remain string timestamps at the domain boundary.
- Current published nutrition maps through the nutrition mapper.
- Unknown statuses fail mapping.
- Malformed string/numeric rows fail mapping.

UI-facing output checks confirmed no raw snake_case keys, raw REST response object, HTTP status details, internal review data, pending data, or rejected nutrition data are exposed by the canonical mapped shape.

## 8. ViewModel Parity Results

The live Supabase read model remains structurally comparable to the mock read model.

Expected UI-facing contract:

```text
{
  restaurant,
  branches,
  menus,
  menuItems,
  branchMenuItems,
  nutrition
}
```

Result: passed.

This verifies structural parity only. It does not require development Supabase IDs to equal mock IDs.

## 9. Fallback-off Result

Fallback-off configuration:

```text
TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK=false
```

Result: passed.

- Public reads passed.
- Fallback was not used.
- Failures are expected to throw typed errors instead of silently reading mock data.
- No mixed Supabase/mock output was observed.

## 10. Fallback-on Result

Fallback-on behavior was verified by development-only source/contract guards, not by mutating the development database.

Scenarios checked:

- Injected test fetch failure: whole-operation mock fallback guard present.
- Test-only invalid resource response: resource allowlist guard present.
- Fake timeout: typed timeout guard present.

Result: passed.

When fallback is enabled in non-production, the service fallback is whole-operation fallback to mock and logs a structured warning with safe metadata only. It does not merge Supabase rows and mock rows inside one read model.

## 11. Mock Rollback Result

Mock rollback setting:

```text
TASTKIND_RESTAURANT_DATA_SOURCE=mock
```

Result: passed.

- `FetchRestClient` is not constructed.
- Supabase credentials are not required.
- Supabase requests are not made.
- UI-facing read contract remains valid through the mock repository.

## 12. Private Analytics Exclusion

Without user JWT, these operations are guarded to throw `SupabaseAuthenticationRequiredError` before private analytics reads:

- `getRestaurantDashboardSummary`
- `getRestaurantExposureAnalytics`
- `getNutritionBadgePerformance`
- `getMenuItemPerformance`

Phase 1D tightened this guard to resource-level private analytics enforcement in `FetchRestClient`.

No raw analytics event read/write was executed. No service-role key was used.

## 13. Public Data Exposure Observations

Public development reads are currently available for:

- active restaurant
- active branch
- published menu
- published menu item
- available branch menu item
- current published nutrition

Internal resources are blocked by the client allowlist and were not queried with service-role credentials:

- `pending_menu_items`
- `nutrition_estimates`
- `nutrition_reviews`
- `restaurant_employees`
- memberships / roles
- `audit_logs`
- `admin_action_drafts`
- raw private analytics events

This is a development read observation only and does not replace RLS/Auth/security review.

## 14. UI Verification

No UI layout, copy, route, flow, data-source banner, or browser-exposed credential change was made.

Server-side read path parity was verified. Interactive browser verification was not required for this phase because the task scoped the change to runtime/service path and guards.

## 15. Runtime Files Modified

- `apps/restaurant-web/adapters/supabase/fetch-rest-client.ts`
- `apps/restaurant-web/package.json`
- `scripts/restaurant-supabase-phase-1d-live-read-parity.mjs`

## 16. UI Files Modified

None.

## 17. Mobile/Admin Files Modified

None for Phase 1D.

## 18. Write Operations

None.

No SQL, migration, seed, database reset, POST, PATCH, PUT, DELETE, write RPC, or production deployment was executed.

## 19. Credentials Committed

No credentials were committed or printed.

The local environment file remains outside documentation and output.

## 20. Production Environment Contacted

No production environment was intentionally contacted.

The configured development URL was classified as `supabase-cloud-unclassified`; this is not production proof.

## 21. Tests and Builds

Executed validation:

- `npm.cmd --workspace @haocu/restaurant-web run test:phase1a` - passed.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1b-rest` - passed.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1c-smoke` - passed; HTTP 200 and row count 1 for all required public resources.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1d-live` - passed; HTTP 200 and row count 1 for all required public resources.
- `npm.cmd exec -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/mobile -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/restaurant-web -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/admin-web -- tsc --noEmit --incremental false` - passed.
- `node scripts/audit-canonical-data.mjs` - passed; no orphan references or duplicate IDs.
- `node scripts/validate-supabase-schema.mjs` - passed with existing Supabase auth-helper warnings only.
- `npm.cmd --workspace @haocu/restaurant-web run build` - passed.
- `@supabase/supabase-js` package/lock scan - no matches.
- `package-lock.json` diff scan - no changes.
- Restaurant Web runtime secret/service-role/NEXT_PUBLIC Supabase scan - no matches.
- Restaurant Web runtime write-pattern scan - no matches.
- Runtime schema artifact import scan under `apps` and `packages` - no matches.
- Server/client boundary scan for `restaurant-read-service` imports from app/components/UI-facing service - no matches.

No response body, full URL, key, JWT, or credential was printed during live checks.

## 22. Known Limitations

- Gate 1.1 disposable DB/RLS verification remains blocked.
- Auth session wiring is not implemented.
- RLS execution harness is not run.
- Tenant and branch escape tests are not run.
- Private analytics remain excluded from live no-JWT reads.
- Production readiness is not claimed.
- `supabase-js` transport remains deferred.
- The live parity guard verifies structural parity, not semantic equality with mock IDs.

## 23. Gate 1.1 Status

Gate 1.1 remains blocked by missing disposable DB/RLS verification.

Phase 1D does not mark DB verification, RLS verification, Auth integration, private analytics, writes, Mobile/Admin integration, or production readiness complete.

## 24. Rollback Instructions

Use mock data source:

```text
TASTKIND_RESTAURANT_DATA_SOURCE=mock
```

Mock rollback avoids `FetchRestClient`, Supabase credentials, and Supabase requests.

## 25. Next Phase Recommendation

Next recommended phase: keep Restaurant Web on development read-only verification while preparing Auth/RLS review harnesses. Do not start write-enabled runtime, Admin Supabase integration, Mobile Supabase integration, private analytics, or production activation until Gate 1.1 and security review are complete.