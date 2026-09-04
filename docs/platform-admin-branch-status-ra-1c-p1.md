# RA-1C-P1 governed branch status application

RA-1C-P1 activates one fixed Platform Admin operation: previewing and changing a single canonical RestaurantBranch between `active` and `inactive`. It consumes the frozen RA-1C-P0 public RPCs and creates no database object or alternate mutation authority.

The server verifies the incoming bearer at `/auth/v1/user`, asks `platform_admin_has_permission_v1` for `admin_restaurant_branch.status.write`, and then calls only `platform_admin_restaurant_branch_status_v1` or `platform_admin_set_restaurant_branch_status_v1`. The fixed route is `GET/POST /api/platform-admin/restaurant-branches/[branchId]/status`. Responses are private, uncacheable, bounded DTOs. PostgreSQL rows and errors are never returned.

`GET` accepts one exact `restaurantId` query value. `POST` accepts exactly `restaurantId`, `expectedStatus`, `nextStatus`, `expectedVersion`, `reasonCode`, and a UUID-v4 `requestId`; the body is at most 2 KiB. Versions are decimal strings and are never converted to JavaScript numbers. The only transitions are `active` to `inactive` with `operational_pause`, and `inactive` to `active` with `operational_resume`.

The `/restaurant-review` surface reads canonical identifiers only from its query and enables the control only after a successful live preview. Existing review cards stay explicitly labelled mock data and cannot supply a live target. The control requires a scoped confirmation. A stale result refreshes preview without resubmitting. An uncertain submission retains the same request and requestId for an explicit retry; a later intentional operation creates a new UUID.

Live composition is opt-in with `TASTKIND_ADMIN_BRANCH_STATUS_DATA_SOURCE=supabase`, `TASTKIND_SUPABASE_URL`, and a validated modern publishable key in `TASTKIND_SUPABASE_PUBLISHABLE_KEY`. Missing or invalid configuration leaves the control disabled. There is no browser token entry, browser Supabase client, service-role key, direct table fallback, generic RPC bridge, or mock success fallback.

Run local validation with:

```text
npm run test:platform-admin-ra-1c-p1
npm run test:platform-admin-ra-1c-p1-smoke
npm run test:platform-admin-ra-1c-p1-mutations
```

The Development harness is prepared but inert by default. Its preflight is enabled with `TASTKIND_PLATFORM_ADMIN_RA1C_P1_DEVELOPMENT_PREFLIGHT=1`; live acceptance additionally requires the separate write opt-in and an Admin base URL. HTTPS or HTTP on exact loopback is accepted so the frozen production build can be exercised locally without deployment. It is hard-pinned to `synthetic-fixture-branch-b`, observes `dev-branch-xinyi` only for an unchanged fingerprint, uses the existing lifecycle identity, restores the target to active, and revokes the temporary Admin membership.
