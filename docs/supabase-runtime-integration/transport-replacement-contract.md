# Supabase Transport Replacement Contract

Current transport: `rest`

Transport interface: `ReadonlyDatabaseClient`

Current implementation path:

- `apps/restaurant-web/adapters/supabase/fetch-rest-client.ts`

Future implementation path:

- `apps/restaurant-web/adapters/supabase/supabase-js-readonly-client.ts`

Central factory path:

- `apps/restaurant-web/adapters/supabase/server-readonly-client.ts`

Config variable:

```text
TASTKIND_SUPABASE_TRANSPORT
```

Allowed values:

- `rest`
- `supabase-js`

Default value: `rest`

Files allowed to change for future transport replacement:

- server-only client factory
- transport-specific adapter implementation
- transport tests
- integration docs

Files forbidden to change solely for transport replacement:

- Restaurant Web UI
- Restaurant Web ViewModel shape
- Restaurant service public contract
- RestaurantReadRepository public contract
- shared canonical domain
- shared mock dataset
- frozen schema drafts

Contract tests:

- select request input
- multiple rows output
- single row output
- maybe-single empty output
- timeout semantics
- auth-required behavior
- 401/403 mapping
- query error mapping
- malformed response mapping
- canonical mapper input
- no-write guarantee
- operation-level fallback compatibility

Parity tests:

- REST query result
- SDK query result
- canonical mapper result
- empty result behavior
- nullable behavior
- numeric mapping
- status mapping
- typed error behavior
- authentication-required behavior
- timeout behavior
- fallback behavior
- ViewModel output

Rollback method:

- set `TASTKIND_SUPABASE_TRANSPORT=rest`, or
- set `TASTKIND_RESTAURANT_DATA_SOURCE=mock`

Removal criteria for FetchRestClient:

1. npm and lockfile dependency normalization succeeds.
2. `@supabase/supabase-js` is installed in the Restaurant Web workspace.
3. `SupabaseJsReadonlyClient` implements `ReadonlyDatabaseClient`.
4. Contract tests pass for both transports.
5. REST/SDK parity tests pass.
6. Disposable DB/Auth/RLS tests pass or receive explicit external approval.
7. Production rollback is documented and rehearsed.
8. No UI/service/repository contract regression exists.
9. Engineering handoff approves removal.

Auth/RLS prerequisites:

- user JWT acquisition design
- restaurant employee tenancy verification
- branch manager scope verification
- tenant escape tests
- service-role never exposed to browser

Example replacement sequence:

1. Fix npm/package-lock permissions.
2. Install `@supabase/supabase-js`.
3. Add `SupabaseJsReadonlyClient`.
4. Implement `ReadonlyDatabaseClient` contract.
5. Run transport contract tests.
6. Enable `TASTKIND_SUPABASE_TRANSPORT=supabase-js` in a local test environment.
7. Run REST/SDK parity tests.
8. Run disposable DB/Auth/RLS tests.
9. Keep `rest` rollback available.
10. Remove REST only after all blocking findings are resolved.