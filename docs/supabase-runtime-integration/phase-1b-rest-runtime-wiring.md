# Supabase Runtime Integration Phase 1B-R: Dependency-Free REST Runtime Wiring

Date: 2026-07-11
Status: Phase 1B-R scaffold and mock-default runtime wiring complete
Default data source: `mock`
Default transport: `rest`

## 1. Scope

Phase 1B-R replaces the blocked `supabase-js` dependency plan with a dependency-free, server-only, GET-only REST transport for Restaurant Web read scaffolding.

This phase wires a transport-neutral read client into the Restaurant Web read repository path while keeping existing UI behavior mock-default.

## 2. Long-term REST Decision

REST is the accepted current transport because package-lock writes are blocked in this environment. `supabase-js` remains deferred and optional.

## 3. Package-lock Blocker History

Phase 1B attempted to add `@supabase/supabase-js`, but npm failed with EPERM while opening root `package-lock.json`. No manual lockfile edit was made.

## 4. Why No Dependency Is Required

Supabase PostgREST read operations can be represented through server-side `fetch` for the limited read-only scope. This does not cover Auth, Realtime, Storage, Edge Functions, or production activation.

## 5. Architecture

`Restaurant Web UI -> ViewModel -> Service -> RestaurantReadRepository -> ReadonlyDatabaseClient -> FetchRestClient -> Supabase PostgREST API`

UI does not import REST, transport config, URL, headers, or JWT logic.

## 6. Transport-neutral Client Interface

`ReadonlyDatabaseClient` exposes one method:

```ts
select<T>(resource, options): Promise<T>
```

It supports allowlisted resources, selected fields, filters, order, limit, optional access token, timeout, and single/maybe-single semantics.

## 7. Server-only Boundary

`FetchRestClient` and the server client factory use `import "server-only"` and are intended for server-side Restaurant Web data loading only.

## 8. Publishable-key-only Rule

REST requests use:

```text
apikey: <publishable key>
Accept: application/json
```

No service-role key, secret key, database password, or browser-exposed secret is allowed.

## 9. Optional User JWT Context

`ReadonlySelectOptions.accessToken` may add:

```text
Authorization: Bearer <user access token>
```

No Auth callback or session integration is implemented in this phase.

## 10. Public Read Operations

Public-style reads include restaurants, branches, menus, menu categories, menu items, branch menu items, aliases, and current published nutrition.

## 11. Auth-required Private Operations

Private analytics operations can require user access token context. Missing token maps to `SupabaseAuthenticationRequiredError` in the REST client boundary.

## 12. Resource Allowlist

Allowed resources:

- `restaurants`
- `restaurant_branches`
- `menus`
- `menu_categories`
- `menu_items`
- `branch_menu_items`
- `menu_item_aliases`
- `current_published_menu_item_nutrition`
- `restaurant_exposure_summary`
- `nutrition_badge_performance`
- `menu_item_performance`

## 13. Safe Query Builder

The REST client uses `URL` and `URLSearchParams`, typed filters, order allowlists, bounded limit, timeout with `AbortController`, and typed errors for non-2xx responses and malformed response shapes.

## 14. Row Mapping

Existing mappers remain the canonical row-to-domain conversion point. Whole-row casts are forbidden.

## 15. Client Factory

`TASTKIND_SUPABASE_TRANSPORT=rest` creates `FetchRestClient`.

`TASTKIND_SUPABASE_TRANSPORT=supabase-js` is explicit but deferred and throws configuration error until dependency normalization and parity tests pass.

## 16. Repository Factory Wiring

`createRestaurantReadRepository` now creates:

- mock repository for `TASTKIND_RESTAURANT_DATA_SOURCE=mock`
- REST-backed Supabase repository for `TASTKIND_RESTAURANT_DATA_SOURCE=supabase-readonly`

Mock mode does not create fetch or Supabase transport clients.

## 17. Service Wiring

`restaurant-read-service.ts` provides server-side read model helpers using the repository factory. Existing UI-facing synchronous mock calls remain unchanged to preserve current demo behavior.

## 18. Analytics Mapping

Analytics read models map summary views only. No analytics event ingestion or write endpoint exists.

## 19. Development Fallback

Development fallback is whole-operation fallback to mock when `supabase-readonly` fails and fallback flag is enabled. Warnings include operation, error category, data source, selected transport, environment, fallback used, and safe IDs only.

## 20. Production Fail-closed

Production may not silently fall back to mock data. Production fallback enabled throws configuration error.

## 21. Fake Fetch Tests

Phase 1B-R guard verifies the fake-fetch contract statically: base URL construction, headers, GET-only behavior, timeout semantics, resource allowlist, typed errors, and no secret/browser env leakage.

## 22. Transport Contract Tests

Transport contract checks are captured in `transport-replacement-contract.md` and enforced by the Phase 1B-R guard.

## 23. Database Tests Not Executed

No SQL, seed, migration, database reset, Supabase login, project linking, or live Supabase request was executed.

## 24. RLS Tests Not Executed

No Auth/JWT/RLS or tenant escape harness was executed.

## 25. Gate 1.1 Blocked Status

Gate 1.1 remains blocked by missing disposable DB tooling.

## 26. Security Limitations

REST wiring is not production-ready. RLS is unverified, Auth is not integrated, and private restaurant tenancy must still be validated before activation.

## 27. Transport Replacement Contract

See `docs/supabase-runtime-integration/transport-replacement-contract.md`.

## 28. Exact Files Allowed to Change During Future Replacement

Allowed future replacement files:

- `apps/restaurant-web/adapters/supabase/server-readonly-client.ts`
- a future `SupabaseJsReadonlyClient` implementation under `apps/restaurant-web/adapters/supabase/`
- transport-specific tests and docs

Forbidden future replacement blast radius: repository public contract, service signatures, ViewModel shapes, UI, shared canonical domain, shared mock dataset, and database schema.

## 29. Environment Variable Switching Method

```text
TASTKIND_SUPABASE_TRANSPORT=rest
TASTKIND_SUPABASE_TRANSPORT=supabase-js
```

No `NEXT_PUBLIC_` transport flag is allowed.

## 30. REST/SDK Coexistence Strategy

REST remains default. A future SDK transport must implement `ReadonlyDatabaseClient` and pass parity tests before becoming selectable.

## 31. Parity Test Requirements

Future parity tests must compare REST and SDK outputs for rows, empty results, nullable fields, numeric mapping, status mapping, typed errors, auth-required behavior, timeout behavior, fallback behavior, and ViewModel output.

## 32. FetchRestClient Removal Conditions

Do not remove `FetchRestClient` until dependency normalization, SDK implementation, contract tests, parity tests, DB/Auth/RLS tests, production rollback, and handoff approval are complete.

## 33. Production Rollback Path

Set data source back to `mock` or transport back to `rest`. Do not alter UI or shared domain for rollback.

## 34. Remaining Activation Requirements

- Gate 1.1 disposable DB/RLS verification
- live Supabase credentials in a non-production test environment
- Auth/JWT session integration design
- tenant/branch escape tests
- production build and server runtime verification
## Phase 1C Follow-up

Phase 1C development public read activation is blocked until a verified development Supabase URL and publishable key are provided outside the repository. The REST transport remains mock-default and dependency-free.