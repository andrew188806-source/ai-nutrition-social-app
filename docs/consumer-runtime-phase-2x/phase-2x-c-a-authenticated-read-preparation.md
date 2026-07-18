# Consumer Runtime Phase 2X-C-A — Authenticated Favorites Read Preparation

Status: local preparation candidate; not deployed and not Frozen.

## Development target and preflight status

The approved target is:

- Project name: tastkind-development
- Project ref: msbgnnoorsoefuiwluye
- Production: false

The repository-local linked project-ref matches the approved ref, and existing frozen repository evidence identifies that ref as tastkind-development. This confirms the local target binding only; it is not a fresh remote management-API identity check.

One read-only supabase migration list --linked attempt was made with process-local telemetry opt-out. It stopped with the sanitized error Access token not provided. No login, credential inspection, retry, escalation, or alternate remote channel was used. Therefore:

- remote migration count and local/remote alignment: **UNVERIFIED**
- Development effective ACLs, policies, defaults, catalog identifiers, and object inventory: **UNVERIFIED**
- Development favorite row counts: **UNVERIFIED**
- Development menu-item global uniqueness and parent consistency: **UNVERIFIED**

The operator-run [Phase 2X-C-B read-only preflight](./phase-2x-c-a-development-readonly-preflight.sql) is the hard gate before deployment or live validation. It contains only catalog and aggregate SELECT statements and must never be run against Production.

## Repository discovery

The local versioned schema defines:

- favorite_restaurants.id: UUID primary key
- favorite_restaurants.user_id: UUID, non-null, owner FK
- favorite_restaurants.restaurant_id: text, non-null
- favorite_menu_items.id: UUID primary key
- favorite_menu_items.user_id: UUID, non-null, owner FK
- favorite_menu_items.restaurant_id: text, non-null
- favorite_menu_items.menu_item_id: text, non-null
- nullable collection_label, sort_order, and removed_at
- non-null created_at defaulting to now()

Both tables have RLS enabled in versioned migrations. The existing owner policies are FOR ALL with auth.uid() = user_id in both USING and WITH CHECK. The active partial unique indexes are:

- (user_id, restaurant_id) WHERE removed_at IS NULL
- (user_id, menu_item_id) WHERE removed_at IS NULL

No versioned Favorites RPC or Favorites view exists. The repository-local schema does not grant Favorites table access to authenticated or anon. The linked-catalog verification record says canonical menu_items.id and menu_items.restaurant_id are text, but Development identity representation and actual data consistency remain hard-gated until the read-only preflight runs.

## Conditional ACL migration draft

20260718010000_consumer_favorites_authenticated_read.sql is a local-only, idempotent draft. It:

1. revokes all Favorites table privileges from PUBLIC, anon, and authenticated;
2. grants only table SELECT to authenticated;
3. explicitly keeps INSERT, UPDATE, and DELETE revoked.

It does not create a function, RPC, view, policy, seed, fixture, or write path. Existing owner RLS remains the row boundary. Phase 2X-C-A authors this migration but does not deploy it.

Before Phase 2X-C-B deployment, the operator must confirm:

1. the target is Development project msbgnnoorsoefuiwluye;
2. Production=false;
3. remote migration history is exactly aligned with the 34 pre-candidate local migrations;
4. remote does not already record version 20260718010000;
5. effective ACL, RLS, and policies have completed catalog review.

If this migration remains in the Frozen Repository and remote does not record its version, Phase 2X-C-B deploys it to Development even when the pre-deployment effective ACL happens to match. The migration provides versioned provenance, explicit revocation from PUBLIC/anon/authenticated, an authenticated SELECT-only grant, direct INSERT/UPDATE/DELETE denial, and local/remote migration-ledger alignment.

If remote already records version 20260718010000, the operator verifies that its version, content, and checksum match and does not execute it again. The only valid non-adoption path is to remove the migration candidate before Phase 2X-C-A Freeze and synchronously update the documentation, guard, and implementation plan. A retained local migration may never be permanently skipped on remote solely because current ACLs look equivalent.

## Supabase read repository

The existing Favorites architecture gains one read-only adapter:

- getCurrentUserFavorite(target)
- listCurrentUserFavorites(input)

Restaurant reads use favorite_restaurants. Menu-item reads use favorite_menu_items and filter both restaurant_id and menu_item_id. Every query filters removed_at IS NULL. No query accepts or filters by caller ownership; the authenticated Supabase session plus owner RLS supplies current-user isolation.

List ordering remains:

1. sort_order ASC NULLS LAST
2. created_at DESC
3. id ASC

The keyset predicate encodes (sort_order, created_at, id), including a separate null-sort-order partition. Page size remains default 20 and maximum 50 through the frozen canonical validation boundary.

Rows map explicitly from snake_case and must contain a non-empty ID/target, nullable label, nullable integer sort order, valid timestamp, and null removed_at. Malformed rows, target mismatches, permission denial, authentication failure, database errors, and transport errors fail closed as typed results.

## Source mode and retained behavior

Read sources are disabled, mock, or supabase. Write sources remain only disabled or mock. Both defaults remain disabled.

Supabase read requires explicit source selection, an injected client, and an injected authentication boundary. Missing/invalid source or missing dependency never falls back to mock. Supabase write is rejected. Factory construction makes no query.

The frozen disabled/mock lifecycle, service write semantics, target validation, actor isolation, and Mobile UI remain unchanged. No UI route selects the new source in this phase.

## Phase boundary

This candidate does not establish Development validation. It performs no migration deployment, credential-backed smoke, database write, fixture creation, UI cutover, Production operation, service-role path, N4, or Phase 2Y implementation.
