# Supabase Runtime Integration Phase 1C: Development Public Read Activation

Date: 2026-07-11
Status: Development Public Read Verified

## 1. Scope

Phase 1C activated Restaurant Web development public reads through the dependency-free REST transport built in Phase 1B-R.

The activation is development-only and public-read-only.

## 2. Development Environment Proof

A development Supabase environment file was found and loaded from `apps/restaurant-web/.env.local`.

Presence-only checks:

- `TASTKIND_SUPABASE_URL`: present
- `TASTKIND_SUPABASE_PUBLISHABLE_KEY`: present
- `TASTKIND_RESTAURANT_DATA_SOURCE`: resolved as `supabase-readonly`
- `TASTKIND_SUPABASE_TRANSPORT`: resolved as `rest`
- `TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK`: forced to `false` for the smoke test

No full URL or key was printed.

## 3. Project Classification

The URL classified as `supabase-cloud-unclassified`. It did not contain obvious `prod` or `production` markers, but this is not a production-safety proof.

## 4. Environment Variables Used

The smoke test used the configured development URL and publishable key from local env. Values are intentionally omitted.

## 5. Schema Resource Status

All expected public resources exist and returned HTTP 200.

## 6. Activation Pack Status

Development-only activation pack was executed externally in the Supabase SQL Editor before this rerun and reported: `Success. No rows returned`.

Codex did not execute SQL.

## 7. Sample Data Status

Development sample data is present for every tested public resource.

## 8. Public Resources Tested

- `restaurants`: HTTP 200, row count 1
- `restaurant_branches`: HTTP 200, row count 1
- `menus`: HTTP 200, row count 1
- `menu_categories`: HTTP 200, row count 1
- `menu_items`: HTTP 200, row count 1
- `branch_menu_items`: HTTP 200, row count 1
- `current_published_menu_item_nutrition`: HTTP 200, row count 1

## 9. Live REST Request Results

Live GET-only REST requests succeeded for all required public resources.

No response body, URL, key, JWT, or Authorization header was printed.

## 10. Row Mapping Results

The smoke test verified JSON array shape and row counts. Full Restaurant Web UI-facing row mapping remains covered by local mapper/typecheck guards, not by this public smoke output.

## 11. Feature Flag Activation

Smoke test runtime values:

```text
TASTKIND_RESTAURANT_DATA_SOURCE=supabase-readonly
TASTKIND_SUPABASE_TRANSPORT=rest
TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK=false
```

## 12. Fallback-off Result

Executed and passed. No mock fallback was used.

## 13. Fallback-on Result

Not executed in this run because fallback was required to remain false.

## 14. Restaurant Web Service Verification

Public REST connectivity is verified. No UI runtime change was made.

## 15. Public RLS Observations

Publishable-key public reads succeeded for active/published/current public resources. This is a public-read smoke result only and does not replace Gate 1.1 RLS/security review.

## 16. Private Operations Intentionally Excluded

Excluded:

- private dashboard analytics
- pending items
- nutrition estimates/reviews
- menu alias governance data
- restaurant employee/membership data
- audit logs
- admin actions
- raw analytics events
- writes of any kind

## 17. UI Changes

No UI layout, copy, route, flow, or interaction changes.

## 18. Mobile/Admin Changes

No Mobile or Admin runtime changes.

## 19. SQL Executed

Codex executed no SQL.

## 20. Migration Executed

No migration was executed or created by Codex.

## 21. Production Environment Contacted

No production environment was intentionally contacted. The configured Supabase URL was classified only as `supabase-cloud-unclassified`.

## 22. Credentials Committed

No credentials were committed or printed.

## 23. Build / Typecheck / Audit Results

Phase 1C smoke result:

```text
npm --workspace @haocu/restaurant-web run test:phase1c-smoke
```

Result: passed, public REST read verified.

## 24. Gate 1.1 Status

Gate 1.1 remains blocked by missing disposable DB tooling.

## 25. Remaining Security Conditions

- Full disposable DB clean apply remains unverified by Codex.
- Auth/JWT/RLS harness not executed.
- Tenant/branch escape tests not executed.
- Private analytics/auth/admin/mobile integration not activated.
- Production readiness is not claimed.

## 26. Rollback Procedure

Use:

```text
TASTKIND_RESTAURANT_DATA_SOURCE=mock
```

Mock mode does not create the REST client and does not make Supabase requests.

## 27. Next Phase Recommendation

Next recommended phase: Restaurant Web development read-service verification against the live development project, still GET-only and fallback-off, without UI redesign or writes.
## Phase 1D Follow-up

Phase 1D has now verified the Restaurant Web development live read-service path, structural ViewModel parity, fallback-off behavior, mock rollback guard, and private analytics auth-required guard. See `docs/supabase-runtime-integration/phase-1d-restaurant-live-read-parity.md`.

Phase 1C remains a public connectivity milestone; Phase 1D extends it to the read-service parity guard. Neither phase completes Gate 1.1, Auth, RLS, private analytics, writes, Mobile/Admin integration, or production readiness.
