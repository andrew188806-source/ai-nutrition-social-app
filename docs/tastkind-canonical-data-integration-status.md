# TastKind Canonical Data Integration Status

Last updated: 2026-07-11

## 1. Core Product Data Principles

- Restaurant, branch, menu item, branch menu item, alias, nutrition, pending menu item, analytics, recommendation, employee, and audit records share one canonical restaurant-platform root under `packages/shared`.
- Mobile, Restaurant Web Console, and Admin Console consume canonical data through per-surface adapters, repositories, services, and ViewModels.
- UI components must not directly import `packages/shared/src/mock/restaurant-platform`.
- High-risk governance actions create `AdminActionDraft` and `AuditLog` records in this mock phase; they do not directly overwrite canonical data.
- Supabase, RLS, production analytics, and the production recommendation engine remain out of scope.

## 2. Canonical Domain Inventory

Primary canonical domain types live in `packages/shared/src/domain/restaurantDomain.ts`:

- `Restaurant`, `RestaurantBranch`, `Menu`, `MenuCategory`, `MenuItem`, `BranchMenuItem`
- `MenuItemAlias`, `Ingredient`, `MenuItemIngredient`
- `MenuItemNutrition`, `NutritionEstimate`, `NutritionReview`, `NutritionChangeLog`
- `PendingMenuItem`, `AnalyticsEvent`, `RecommendationResult`, `MenuItemRating`
- `RestaurantEmployee`, `RestaurantUser`, branch/role assignment and transfer log types
- Governance extensions: `RestaurantReview`, `BranchReview`, `MenuItemMergeCandidate`, `AliasReview`, `DataQualityIssue`, `RecommendationAnomaly`, `AnalyticsEventIssue`, `AdminActionDraft`, `AuditLog`

## 3. Three Product Surfaces

Mobile reads canonical restaurants, branches, menu items, branch menu items, aliases, and nutrition through `apps/mobile/adapters/mock/mobile-restaurant-mock-adapter.ts`. It still keeps compatibility exports for legacy UI and Meal Buddy flows.

Restaurant Web Console maintains restaurant-owned canonical data through `apps/restaurant-web/adapters/mock/restaurant-console-mock-adapter.ts`, repositories, and services. It owns restaurant operations, menu, nutrition, pending items, staff, assistant, and analytics views.

Admin Console governs the same canonical data through `apps/admin-web/adapters/mock/admin-restaurant-mock-adapter.ts`, repositories, services, and governance ViewModels. It reviews restaurants, branches, duplicates, aliases, pending menu items, nutrition, analytics quality, recommendation anomalies, and audit trails.

## 4. Data Flow

The intended flow is consistent:

`shared canonical domain -> shared dataset -> per-application adapter -> repository -> service -> ViewModel -> UI`

Current adapter roots:

- Mobile: `apps/mobile/adapters/mock/mobile-restaurant-mock-adapter.ts`
- Restaurant Web: `apps/restaurant-web/adapters/mock/restaurant-console-mock-adapter.ts`
- Admin Web: `apps/admin-web/adapters/mock/admin-restaurant-mock-adapter.ts`

## 5. Adapter / Repository / Service Architecture

Adapters are the only app-level files allowed to import the shared restaurant-platform mock dataset.

Repositories provide simple canonical record access and ID lookup.

Services perform relationship joins, source separation, governance checks, action-draft attachment, and UI-facing mapping.

ViewModels are application-facing shapes and are not canonical domain replacements.

## 6. ID Relationship Rules

- `RestaurantBranch.restaurantId` must resolve to `Restaurant.id`.
- `Menu.restaurantId` must resolve to `Restaurant.id`.
- `MenuCategory.menuId` must resolve to `Menu.id`.
- `MenuItem.restaurantId` must resolve to `Restaurant.id`.
- `MenuItem.menuCategoryId` must resolve to `MenuCategory.id`.
- `BranchMenuItem.restaurantId`, `branchId`, and `menuItemId` must resolve.
- `MenuItemAlias.menuItemId` must resolve to an official `MenuItem.id`.
- `MenuItemNutrition.menuItemId`, `NutritionEstimate.menuItemId`, and `NutritionReview.menuItemId` must resolve.
- `PendingMenuItem.restaurantId`, `branchId`, and suggested menu item IDs must resolve or be explicitly unresolved.
- `AnalyticsEvent` and `RecommendationResult` canonical IDs must resolve.

The reusable check is `node scripts/audit-canonical-data.mjs`.

## 7. Restaurant / Branch / MenuItem Relationships

Canonical restaurants now include TastKind / 好廚 and the Mobile demo restaurants required by Meal Buddy and analysis flows. Branch-level price and availability live in `BranchMenuItem`, not copied into separate official `MenuItem` rows.

Legacy Mobile names are mapped via `MenuItemAlias` where needed.

## 8. Nutrition Data Layers

`MenuItemNutrition` is the official nutrition layer.

`NutritionEstimate` stores AI-generated estimate history.

`NutritionReview` stores review decisions.

`NutritionChangeLog` stores official change history.

Mobile AI analysis and Admin estimate adoption workflows do not overwrite official nutrition directly.

## 9. Alias and PendingMenuItem Workflow

Approved aliases resolve to official `menuItemId` values.

Unresolved food input can become `PendingMenuItem`; it does not automatically create a formal `MenuItem`.

Restaurant Console and Admin Console operate on the same `canonicalPendingMenuItems` records.

Admin actions for mapping pending items, creating aliases, or drafting formal menu items are represented as `AdminActionDraft` and `AuditLog`.

## 10. AnalyticsEvent Workflow

Restaurant Dashboard and Admin data-quality inspection use the same `canonicalAnalyticsEvents`.

Restaurant dashboard metrics are derived from event metadata.

Admin data-quality service checks missing/non-existent IDs, duplicate event IDs, recommendation events without IDs, nutrition-badge events without menu items, and timestamp parseability.

Order/cart events remain mock or reserved until the order system exists.

## 11. Recommendation Reference Principles

Recommendation results reference canonical `restaurantId`, `branchId`, and `menuItemId`.

Admin recommendation anomaly inspection is governance-only. It checks branch availability, discontinued item status, and missing nutrition. It does not implement a recommendation engine.

## 12. Compatibility-Layer Inventory

- Mobile `features/restaurants/restaurantBackendMock.ts`: compatibility facade for existing restaurant UI, analysis, display resolvers, and Meal Buddy. Remove only after consumers move to Mobile services.
- Shared `packages/shared/src/types.ts`: legacy broad MVP types. Keep until non-restaurant historical modules are migrated or explicitly deprecated.
- Restaurant Web legacy routes `/analytics`, `/menu`, `/profile`, `/verification`, `/vip`: retained for route compatibility.
- Admin legacy governance pages: retained for non-restaurant governance areas; restaurant governance pages now use Admin canonical services.

## 13. Items Not Yet Connected

- Supabase schema and RLS
- Production auth and permission enforcement
- Production analytics pipeline
- Production AI recommendation service
- Production AI image-analysis service
- Automatic merge execution
- Orders and payments
- Full migration away from Mobile compatibility exports

## 14. Recommended Next Phase

Next phase: Supabase schema mapping preparation only.

Do not start production connection until the canonical dataset, ID audit script, governance drafts, and compatibility inventory are accepted.

## 15. Prerequisites Before Supabase Schema Mapping

- Freeze canonical IDs for demo restaurants, branches, menu items, aliases, nutrition, pending items, analytics, and recommendations.
- Decide how `AdminActionDraft`, review records, and `AuditLog` map to database tables.
- Define RLS boundaries for Mobile user reads/writes, Restaurant Console restaurant-owned writes, and Admin governance writes.
- Decide migration plan for `packages/shared/src/types.ts` legacy data.
- Add test coverage for `scripts/audit-canonical-data.mjs` or convert it into a typed validation package.


## 16. Supabase Schema Mapping Preparation Status

Supabase Schema Mapping Preparation Phase 1 is complete as a draft design package.

Created preparation artifacts:

- Main mapping document: `docs/supabase-schema-mapping.md`
- Draft SQL files: `docs/supabase-schema-drafts/001_extensions.sql` through `015_validation_queries.sql`

This phase translated the current canonical restaurant domain into a proposed Supabase PostgreSQL design covering restaurants, branches, menus, branch-specific menu availability, aliases, pending menu items, nutrition, analytics, recommendations, restaurant employees, governance actions, audit logs, RLS draft policies, mock-ID-to-UUID traceability, and validation queries.

Runtime integration has not started:

- No app imports Supabase schema draft files.
- No application adapter has been switched.
- The shared mock dataset remains active.
- No production environment variables were changed.
- No Supabase migration was executed.
- RLS policies are draft-only and require security review before use.

Recommended next phase: human review of `docs/supabase-schema-mapping.md` and the draft SQL files before creating active Supabase migrations or import scripts.


## 17. Supabase Schema Mapping Phase 1.1 Freeze Preparation Status

Phase 1.1 review, decision resolution, and freeze-preparation artifacts have been added:

- `docs/supabase-schema-phase-1-1-freeze-review.md`
- `docs/supabase-schema-decision-register.md`

Resolved at draft/documentation level:

- `supabase/schema.sql` is marked as a deprecated historical skeleton, not the schema authority.
- Status mapping for TypeScript/mock values to SQL draft values is documented.
- `nutrition_badge_status` is separated from nutrition verification status.
- Analytics event draft now includes anonymous/session/platform/device/schema-version/ingestion/idempotency coverage.
- Legacy ID to UUID mapping now includes source dataset version, row checksum, import status, and rollback metadata.

Boundary remains unchanged:

- No runtime app was connected to Supabase.
- No adapter/repository/service/ViewModel/UI flow was switched.
- No SQL was executed.
- No active migration was created.
- Shared mock data and compatibility layers remain in place.

Phase 1.1 package is review-ready, not runtime-integration-ready.


## 18. Supabase Schema Mapping Phase 1.2 Final Freeze Status

Supabase Schema Mapping Phase 1.2 Final Decision Freeze is complete as a frozen candidate for human DB/security review.

Freeze artifact:

- `docs/supabase-schema-freeze-manifest.md`

Decision artifact:

- `docs/supabase-schema-decision-register.md`

Historical schema handling:

- `supabase/schema.sql` is now a deprecated redirect stub with no executable SQL.
- The old skeleton is archived in `docs/supabase-historical-schema-skeleton.md`.

Boundary remains unchanged:

- No runtime Supabase integration started.
- No SQL was executed.
- No active migration was created.
- No mock dataset or compatibility layer was removed.
- No app adapter/repository/service/ViewModel/UI flow was changed.

The package is frozen for review, not approved for execution.


## 19. Supabase Schema Gate 1 DB/Security Review Status

Supabase Schema Human DB & Security Review Gate 1 has been completed as a static local review.

Result: Passed with Security Conditions.

Created Gate 1 artifacts:

- `docs/supabase-schema-review/gate-1-db-security-review.md`
- `docs/supabase-schema-review/gate-1-findings-register.md`
- `docs/supabase-schema-review/rls-policy-matrix.md`
- `docs/supabase-schema-review/schema-validation-checklist.md`
- `docs/supabase-schema-review/static-validation-result.json`
- `docs/supabase-schema-review/review-only-validation-fixtures.sql`
- `scripts/validate-supabase-schema.mjs`

Boundary remains unchanged:

- No runtime Supabase integration started.
- No active migration was created.
- No production SQL was executed.
- No app runtime code changed.
- Shared mock dataset and compatibility layers remain active.

Not configured locally:

- Clean PostgreSQL apply test.
- Supabase CLI apply test.
- RLS execution harness.

Next recommended step remains external DB/security review in a disposable Supabase/PostgreSQL environment before any active migration or write-enabled runtime integration.


## 20. Supabase Schema Gate 1.1 Disposable DB/RLS Verification Status

Supabase Schema Gate 1.1 was attempted locally and is blocked by missing disposable DB tooling.

Unavailable locally:

- `psql`
- Supabase CLI
- Docker

Created review-only package for external disposable DB execution:

- `docs/supabase-schema-review/gate-1-1-disposable-db-rls-verification.md`
- `docs/supabase-schema-review/disposable-db-setup-notes.md`
- `docs/supabase-schema-review/gate-1-1-rls-constraint-test-plan.md`
- `docs/supabase-schema-review/generated/schema-review-baseline.sql`
- `docs/supabase-schema-review/generated/schema-review-baseline-manifest.json`
- `scripts/assemble-supabase-schema-review-sql.mjs`

Boundary remains unchanged:

- No runtime Supabase integration started.
- No SQL was executed.
- No active migration was created.
- No production database or Supabase project was contacted.
- No app runtime code changed.

Next step: run the generated review package in a disposable Supabase/PostgreSQL environment. Runtime Integration Phase 1 should not begin yet.

## 19. Supabase Runtime Integration Phase 1A Status

Restaurant Web read-only scaffolding has been added as a reviewable Phase 1A boundary.

Status:

- Integration code: scaffolded.
- Live database connection: unverified.
- RLS: unverified.
- Production readiness: no.
- Default Restaurant Web data source: `mock`.

Phase 1A artifact:

- `docs/supabase-runtime-integration/phase-1a-restaurant-readonly-scaffolding.md`

The current Restaurant Web UI remains on the existing mock adapter/repository/service path. The new Supabase read-only repository is not a production activation and does not change Mobile, Admin Web, shared canonical mock data, active migrations, or UI behavior.

## 20. Supabase Runtime Integration Phase 1B Status

Phase 1B dependency normalization and feature-flag runtime wiring was attempted and is currently blocked.

Status:

- Phase 1A scaffolding: complete.
- `@supabase/supabase-js` dependency normalization: blocked by npm EPERM while writing root `package-lock.json`.
- Restaurant Web service runtime wiring: not started.
- Default data source: `mock`.
- Live Supabase connection: unverified.
- RLS: unverified.

Phase 1B artifact:

- `docs/supabase-runtime-integration/phase-1b-dependency-runtime-wiring.md`

No package-lock manual edit, production credential, SQL execution, active migration, Mobile/Admin runtime change, or UI flow change was made.

## 21. Supabase Runtime Integration Phase 1B-R Status

Phase 1B-R dependency-free REST runtime wiring is complete as a mock-default Restaurant Web read scaffold.

Status:

- npm dependency changes: none.
- root package-lock changes: none.
- Restaurant Web default data source: `mock`.
- Restaurant Web default Supabase transport: `rest`.
- REST client: server-only, dependency-free, GET-only.
- Repository factory: supports mock and supabase-readonly paths.
- Service read boundary: `restaurant-read-service.ts` uses repository factory without exposing transport to UI.
- Live Supabase connection: not executed.
- SQL/migration/seed: not executed.
- Gate 1.1: still blocked.

Artifacts:

- `docs/supabase-runtime-integration/phase-1b-rest-runtime-wiring.md`
- `docs/supabase-runtime-integration/transport-replacement-contract.md`
## 22. Supabase Runtime Integration Phase 1C Status

Phase 1C development public read activation is currently blocked.

Status:

- Development Supabase URL/key: missing.
- `.env.local`: absent.
- Live public REST requests: not executed.
- SQL execution: none.
- Active migration: none.
- Production environment: not contacted.
- Default Restaurant Web data source: `mock`.
- Development activation pack: created but not executed.

Artifacts:

- `docs/supabase-runtime-integration/phase-1c-development-public-read-activation.md`
- `docs/supabase-runtime-integration/development-public-read-activation-pack.sql`
- `scripts/restaurant-supabase-phase-1c-public-read-smoke.mjs`
## Phase 1C Missing Development Schema Rerun

The Phase 1C smoke test was rerun with fallback disabled. It loaded local development credentials from `apps/restaurant-web/.env.local.txt` without printing values. GET-only public REST requests reached the configured Supabase project, but all expected public resources returned HTTP 404.

Current Phase 1C status: `Blocked by Missing Development Schema`.
## Phase 1C Development Public Read Verified

The Phase 1C smoke test was rerun with `apps/restaurant-web/.env.local`, `TASTKIND_RESTAURANT_DATA_SOURCE=supabase-readonly`, `TASTKIND_SUPABASE_TRANSPORT=rest`, and fallback forced to `false`. GET-only public REST reads returned HTTP 200 for all required public resources with row count 1 each.

This verifies development public read connectivity only. It does not complete Gate 1.1, Auth/RLS security review, private analytics, writes, Mobile/Admin integration, or production readiness.
## 23. Supabase Runtime Integration Phase 1D Status

Phase 1D Restaurant Web Development Live Read Cutover & Parity Verification is complete for the development read-only path.

Status:

- Runtime service path: verified from `restaurant-read-service` through repository factory, Supabase REST repository, `ReadonlyDatabaseClient`, and `FetchRestClient`.
- Development data source: `supabase-readonly`.
- Transport: `rest`.
- Fallback during live verification: `false`.
- Public development resources: HTTP 200 with row count 1 for restaurants, branches, menus, menu categories, menu items, branch menu items, and current published nutrition.
- Canonical mapping: verified structurally for camelCase output, status normalization, numeric conversion, nullable fields, timestamp fields, current nutrition, and malformed-row failure behavior.
- ViewModel parity: Restaurant Web read model remains structurally compatible with mock output.
- Mock rollback: verified through factory guard.
- Private analytics: no-JWT reads are guarded with `SupabaseAuthenticationRequiredError`; no service-role key used.

Artifact:

- `docs/supabase-runtime-integration/phase-1d-restaurant-live-read-parity.md`

Boundary remains unchanged:

- No SQL was executed by Codex.
- No migration, seed, database reset, write RPC, POST, PATCH, PUT, or DELETE was executed.
- No production environment was intentionally contacted.
- No Mobile/Admin/UI integration was changed for Phase 1D.
- Gate 1.1, Auth, RLS, private analytics, writes, and production readiness remain blocked/not complete.

## 24. Consumer Canonical Data Mapping Preparation Phase 1 Status

Consumer Canonical Data Mapping Preparation Phase 1 is complete as a draft design and review package.

Created artifacts:

- `docs/consumer-canonical-data-mapping.md`
- `docs/consumer-schema-decision-register.md`
- `docs/consumer-schema-migration-order.md`
- `docs/consumer-schema-rls-matrix.md`
- `docs/consumer-schema-privacy-classification.md`
- `docs/consumer-schema-validation-plan.md`
- `docs/consumer-schema-runtime-handoff.md`
- `docs/supabase-consumer-schema-drafts/001_consumer_enums_and_helpers.sql` through `015_consumer_validation_queries.sql`
- `scripts/validate-consumer-schema.mjs`

This phase maps Mobile consumer data into a future Supabase schema for profiles, private profile data, preferences, taste/diet/goals, meal records, meal item snapshots, AI analysis, corrections, consumption adjustments, sharing allocations, planned meals, daily summaries, ratings, favorites, recommendation sessions/feedback, privacy consents, deletion requests, change logs, and legacy ID traceability.

Boundary remains unchanged:

- No SQL was executed.
- No active migration was created.
- No seed was executed.
- No Mobile runtime was changed.
- No Restaurant Web runtime was changed.
- No Admin runtime was changed.
- No UI was changed.
- No production Supabase environment was contacted.
- Restaurant canonical schema remains the source for restaurant/menu references.
- Social scope (Meal Buddy, invitations, matches, chats, group tables) remains deferred to a later social schema package.
- Gate 1.1, Consumer Auth, RLS execution, runtime integration, and production readiness remain incomplete.

## 25. Consumer Schema Phase 1.1 Review Status

Consumer Schema Phase 1.1 Review, Decision Resolution & Freeze Preparation is complete as a review-ready package.

Created/updated artifacts:

- `docs/consumer-schema-status-enum-mapping.md`
- `docs/consumer-schema-phase-1-1-freeze-review.md`
- `docs/consumer-schema-decision-register.md`
- `docs/consumer-schema-rls-matrix.md`
- `docs/consumer-schema-privacy-classification.md`
- `docs/consumer-schema-validation-plan.md`
- `scripts/validate-consumer-schema.mjs`

Phase 1.1 results:

- Cross-file static review: passed by validator.
- Consumer Auth ownership model: reviewed, runtime execution still blocked.
- Public/private profile boundary: reviewed.
- Meal snapshot model: reviewed.
- Daily summary model: reviewed; source-of-truth decision remains blocking before runtime.
- Ratings/favorites model: reviewed.
- Recommendation feedback model: reviewed.
- RLS threat review: documented; execution remains unverified.
- Privacy/retention decisions: documented; legal/privacy decisions remain blocking before runtime.
- Status/enum mapping: documented; unknown values fail closed.

Boundary remains unchanged:

- No SQL was executed.
- No active migration was created.
- No seed was executed.
- No Supabase write was made.
- No Auth runtime was integrated.
- No Mobile, Restaurant Web, Admin, UI, mock dataset, or compatibility layer was changed for Consumer runtime.
- Social, order, and payment schemas remain deferred.
- Consumer schema is review-ready, not frozen, not RLS-verified, not runtime-integrated, and not production-ready.

## 26. Consumer Schema Phase 1.2 Final Freeze Status

Consumer Schema Phase 1.2 Final Decision Freeze is complete as a frozen candidate for human DB/security/legal review.

Freeze artifact:

- `docs/consumer-schema-freeze-manifest.md`

Updated artifacts:

- `docs/supabase-consumer-schema-drafts/001_consumer_enums_and_helpers.sql` through `015_consumer_validation_queries.sql`
- `docs/consumer-schema-decision-register.md`
- `docs/consumer-schema-status-enum-mapping.md`
- `docs/consumer-schema-rls-matrix.md`
- `docs/consumer-schema-privacy-classification.md`
- `docs/consumer-schema-runtime-handoff.md`
- `scripts/validate-consumer-schema.mjs`

Frozen candidate decisions include account lifecycle values, meal item snapshot versioning, AI analysis/correction timestamps, planned meal conversion idempotency, server-managed daily summary cache shape, aggregate threshold `>= 10`, consent policy versioning, and subscription entitlement snapshot model.

Boundary remains unchanged:

- No Consumer SQL was executed.
- No active migration was created.
- No seed was executed.
- No Consumer Auth runtime was integrated.
- No Mobile, Restaurant Web, Admin, or UI runtime was changed for Consumer integration.
- No mock dataset or compatibility layer was removed.
- Social, orders, payments, RLS verification, Consumer Auth completion, and production readiness remain deferred.
## 27. Consumer Runtime Integration Phase 1A Status

Consumer Runtime Integration Phase 1A Mobile Auth/Profile Scaffolding is complete as a disabled-by-default Mobile architecture boundary.

Created artifacts:

- `docs/consumer-runtime-integration/phase-1a-mobile-auth-profile-scaffolding.md`
- `apps/mobile/features/consumer-auth/*`
- `scripts/consumer-auth-phase-1a-guard.mjs`

Added capabilities:

- canonical Consumer Auth runtime types.
- canonical Consumer Profile runtime types.
- Auth port and Profile repository interfaces.
- mock Auth adapter and mock Profile repository.
- Supabase-disabled Auth/Profile skeletons.
- feature flags and factories.
- session state boundary.
- idempotent profile bootstrap orchestration.
- typed error model.
- fake-client guard tests.

Boundary remains unchanged:

- No live Supabase Auth request was made.
- No Consumer profile live read/write was made.
- No SQL, migration, or seed was executed.
- No Consumer RLS was verified.
- No service-role or secret key was used.
- No Mobile UI/layout/copy/navigation flow was changed.
- No MealRecord, nutrition summary, rating/favorite, recommendation feedback, social, orders, or payments runtime was changed.
- Restaurant Web and Admin runtime were not modified for Consumer integration.

Next Consumer runtime phase after Phase 1B requires explicit approval for live Auth activation; Consumer writes remain disabled.
## 28. Consumer Runtime Integration Phase 1B Status

Consumer Runtime Integration Phase 1B Supabase Auth Transport Preparation is complete.

Dependency command completed manually by the user:

`npm.cmd install --workspace @haocu/mobile @supabase/supabase-js react-native-url-polyfill`

Result:

- `@supabase/supabase-js@2.110.2` is installed for Mobile.
- `react-native-url-polyfill@3.0.0` is installed for Mobile.
- `apps/mobile/package.json` and root `package-lock.json` are consistent.
- Expo remains `^54.0.0` / installed `54.0.34`; React Native remains `0.81.5`.

Created preparation artifacts:

- `docs/consumer-runtime-integration/phase-1b-supabase-auth-transport-preparation.md`
- `apps/mobile/features/consumer-auth/supabaseAuthContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseAuthMappers.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/supabaseSdkLoader.ts`
- `apps/mobile/features/consumer-auth/appStateRefreshLifecycle.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `scripts/consumer-auth-phase-1b-guard.mjs`

Boundary remains unchanged:

- No live Supabase Auth request was made.
- No Consumer profile live read/write was made.
- No SQL, migration, or seed was executed.
- No Consumer RLS was verified.
- No secret/service-role key was used.
- No UI, MealRecord, social, orders, payments, Restaurant runtime, or Admin runtime was changed for Consumer integration.

Next step must not start automatically. A later approved phase may explicitly activate live Auth transport; do not enable Consumer Profile writes, RLS verification claims, or production readiness in Phase 1B.

## 29. Consumer Runtime Integration Phase 1C Status

Consumer Runtime Integration Phase 1C Development Live Auth is implementation-complete, guard-complete, and development-live-verified.

Status:

- Default Consumer Auth source: `mock`.
- Default Consumer Profile source: `mock`.
- Default Consumer Auth enabled flag: `false`.
- Default Consumer writes enabled flag: `false`.
- Development live Auth path: available only with explicit Phase 1C flags.
- Consumer Profile live runtime: disabled.
- Consumer database writes: disabled.
- Development live smoke: complete.
- Optional live email sign-up smoke: skipped because explicit sign-up opt-in was not enabled.
- Sign-up mapping and `email_confirmation_required`: verified by Phase 1C guard.
- Phase 1C freeze status: freeze candidate.
- Phase 1D: not started.

Artifacts:

- `docs/consumer-runtime-integration/phase-1c-development-live-auth.md`
- `apps/mobile/features/consumer-auth/featureFlags.ts`
- `apps/mobile/features/consumer-auth/factories.ts`
- `apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts`
- `apps/mobile/features/consumer-auth/supabaseSdkLoader.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts`
- `apps/mobile/features/consumer-auth/asyncStorageConsumerAuthStorage.ts`
- `apps/mobile/features/consumer-auth/reactNativeAppStateSource.ts`
- `apps/mobile/features/consumer-auth/sessionStateStore.ts`
- `scripts/consumer-auth-phase-1c-guard.mjs`
- `scripts/consumer-auth-phase-1c-live-smoke.mjs`

No Mobile UI, Restaurant Web runtime, Admin runtime, SQL, migration, seed, Consumer Profile write, database query, Storage upload, Realtime connection, service-role key, production credential, URL/key/email/password/user ID/token, or full session was recorded in the repository.

Phase 1D was later started by explicit approval. See the Phase 1D status section below.

## 30. Consumer Runtime Integration Phase 1D Status

Consumer Runtime Integration Phase 1D Development Live Profile Read is implementation-complete, guard-complete, development-live-verified, and frozen.

Status:

- Default Consumer Auth source: `mock`.
- Default Consumer Profile source: `mock`.
- Default Consumer Auth enabled flag: `false`.
- Default Consumer writes enabled flag: `false`.
- Development live profile path: available only with explicit Phase 1D flags.
- Consumer Profile writes/bootstrap: disabled.
- Consumer private profile, preferences, taste profile, meal, recommendation, social, order, payment, and sharing runtime: not started.
- Development live smoke: passed with authenticated sign-in, canonical session mapping, current-user-only `consumer_profiles` read, canonical profile mapping, and sign-out.
- Phase 1D freeze status: frozen.
- Phase 2: not started.

Artifacts:

- `docs/consumer-runtime-integration/phase-1d-development-live-profile-read.md`
- `apps/mobile/features/consumer-auth/consumerProfileService.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileContracts.ts`
- `apps/mobile/features/consumer-auth/supabaseProfileMappers.ts`
- `apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts`
- `apps/mobile/features/consumer-auth/errors.ts`
- `apps/mobile/features/consumer-auth/featureFlags.ts`
- `apps/mobile/features/consumer-auth/factories.ts`
- `scripts/consumer-profile-phase-1d-guard.mjs`
- `scripts/consumer-profile-phase-1d-live-smoke.mjs`

Runtime boundary:

- Approved live read API: `getCurrentProfile()`.
- Approved table allowlist: `consumer_profiles`.
- Ownership filter: current authenticated session `userId`.
- Arbitrary user-id profile lookup: rejected in the live repository.
- Missing profile row: typed `profile_not_found`, with no bootstrap/write/fallback.
- Development profile fixture: operator-created in the development database; no fixture row contents, email, password, UUID, token, or session values are stored in the repository.

No Mobile UI, navigation, Restaurant Web runtime, Admin runtime, Consumer Runtime SQL execution, seed, repository fixture creation, Consumer Profile write, profile bootstrap, automatic profile creation, Storage upload, Realtime connection, service-role key, production credential, URL/key/email/password/user ID/token, full session, row contents, or fixture contents were recorded in the repository.

## 31. Consumer Schema Phase 1.3 Formal Migration Activation Status

Consumer Schema Phase 1.3 Formal Migration Activation and Runtime Table Alignment is deployed to development and aligned with Phase 1D live profile verification.

Status:

- Formal migration package: prepared under `supabase/migrations/` and development-deployed by operator action.
- Canonical physical profile table: `consumer_profiles`.
- Phase 1D runtime profile table target: aligned to `consumer_profiles`.
- Runtime public API remains: `getCurrentProfile()`.
- Ownership filter remains: `user_id = current authenticated session userId`.
- `user_profiles` compatibility table/view/alias: not created.
- Development remote deployment: complete.
- Corrective migration: `20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql`.
- Corrective privilege: authenticated SELECT on `public.consumer_profiles` only.
- `anon` profile table grant: not added.
- authenticated write privilege: not added.
- Seed/repository fixture/Auth user creation: not executed by repository code.
- Consumer Runtime Phase 2: not started.

Artifacts:

- `docs/consumer-schema-phase-1-3-formal-migrations.md`
- `supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql` through `20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql`
- `supabase/migrations/20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql`
- `scripts/consumer-schema-phase-1-3-guard.mjs`

Boundary:

- Draft SQL files remain review history.
- Validation-only SQL is not part of the active migration package.
- Restaurant schema/data are not modified.
- Local and remote migration history are aligned by development operator action.
- RLS remains enabled and `auth.uid() = user_id` remains the ownership boundary.
- No production project was touched.

## 32. Consumer Runtime Integration Phase 2A Status

Consumer Runtime Integration Phase 2A Meal Records Read Architecture and Development Live Read Preparation is implementation-complete and guard-complete.

Status:

- Default Consumer Auth source: `mock`.
- Default Consumer Meal Records source: `mock`.
- Default Consumer Auth enabled flag: `false`.
- Default Consumer writes enabled flag: `false`.
- Development live meal read path: prepared only with explicit Phase 2A flags.
- Development live meal read smoke: skipped because Consumer Runtime Phase 2B has not started.
- Home / Today Intake / Meal Log cutover: not started.
- Daily Nutrition Summary runtime: not started.
- Meal writes, updates, deletes, corrections, ratings, favorites, recommendation feedback, social, orders, payments, and Admin Consumer Governance: not started.
- Phase 2B: not started.

Artifacts:

- `docs/consumer-runtime-integration/phase-2a-meal-records-read-architecture.md`
- `apps/mobile/features/consumer-meals/*`
- `scripts/consumer-meal-records-phase-2a-guard.mjs`
- `scripts/consumer-meal-records-phase-2a-live-smoke.mjs`

Runtime boundary:

- Approved live read API: `ConsumerMealRecordsService.listCurrentUserMealRecords()`.
- Approved table: `meal_records`.
- Approved nested rows: `meal_record_items` through explicit column allowlist.
- Ownership source: current authenticated session `userId`.
- Arbitrary user-id meal lookup: not exposed.
- Empty result: canonical empty list.
- Malformed row: typed mapping error, no fallback.

No Mobile UI, navigation, Restaurant Web runtime, Admin runtime, schema migration, RLS migration, grant migration, seed, fixture, Consumer Runtime write, RPC, raw SQL, Storage upload, Realtime connection, service-role key, production credential, URL/key/email/password/user ID/token, full session, raw row, row contents, or fixture contents were recorded in the repository.

## 33. Consumer Runtime Integration Phase 2B Status

Consumer Runtime Integration Phase 2B Development Live Meal Records Read Verification is implementation-complete, guard-complete, development-live-verified, and freeze-ready.

Status:

- Default Consumer Auth source: `mock`.
- Default Consumer Meal Records source: `mock`.
- Default Consumer Auth enabled flag: `false`.
- Default Consumer writes enabled flag: `false`.
- Development live meal read path: available only with explicit Phase 2B opt-in flags.
- Development live meal read smoke: passed with authenticated sign-in, current-user meal read, canonical empty list, and sign-out.
- Home / Today Intake / Meal Log cutover: not started.
- Daily Nutrition Summary runtime: not started.
- Meal writes, updates, deletes, corrections, ratings, favorites, recommendation feedback, social, orders, payments, and Admin Consumer Governance: not started.
- Phase 2C: not started.

Artifacts:

- `docs/consumer-runtime-integration/phase-2b-development-live-meal-read.md`
- `supabase/migrations/20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql`
- `scripts/consumer-meal-records-phase-2b-guard.mjs`
- `scripts/consumer-meal-records-phase-2b-live-smoke.mjs`

Runtime boundary:

- Approved live read API: `ConsumerMealRecordsService.listCurrentUserMealRecords()`.
- Approved table: `meal_records`.
- Approved nested rows: `meal_record_items` through explicit column allowlist.
- Ownership source: current authenticated session `userId`.
- Arbitrary user-id meal lookup: not exposed.
- Empty result: canonical empty list.
- Malformed row: typed mapping error, no fallback.
- Stable ordering: `occurred_at desc`, then `id desc`.

Corrective migration:

- Grants authenticated SELECT on `public.meal_records`.
- Grants authenticated SELECT on `public.meal_record_items`.
- Revokes anon privileges on both meal read tables.
- Does not grant writes, use `GRANT ALL`, create data, change policies, change schema objects, seed, create fixtures, or touch production.

No Mobile UI, navigation, Restaurant Web runtime, Admin runtime, Consumer Runtime write, RPC, raw SQL, Storage upload, Realtime connection, service-role key, production credential, URL/key/email/password/user ID/token, full session, raw row, row contents, or fixture contents were recorded in the repository.

## 34. Consumer Runtime Integration Phase 2C Status

Consumer Runtime Integration Phase 2C Controlled Meal Record Write Preparation is implementation-complete, guard-complete, and freeze-ready.

Status:

- Default Consumer Auth source: `mock`.
- Default Consumer Meal Records source: `mock`.
- Default Consumer Auth enabled flag: `false`.
- Default Consumer writes enabled flag: `false`.
- Default Consumer meal record writes enabled flag: `false`.
- Mock write repository: available only for fake guard verification.
- Supabase live meal write repository: fail-closed with `meal_write_atomicity_not_supported`.
- Development live write smoke: hard-skipped because Consumer Runtime Phase 2D has not started.
- Home / Today Intake / Meal Log cutover: not started.
- Daily Nutrition Summary runtime: not started.
- Real meal writes, updates, deletes, corrections, ratings, favorites, recommendation feedback, social, orders, payments, and Admin Consumer Governance: not started.
- Phase 2D: not started.

Artifacts:

- `docs/consumer-runtime-integration/phase-2c-controlled-meal-record-write-preparation.md`
- `apps/mobile/features/consumer-meals/writeValidation.ts`
- `apps/mobile/features/consumer-meals/consumerMealRecordWriteService.ts`
- `apps/mobile/features/consumer-meals/mealWriteMappers.ts`
- `apps/mobile/features/consumer-meals/adapters/mockConsumerMealRecordWriteRepository.ts`
- `apps/mobile/features/consumer-meals/adapters/supabaseDisabledConsumerMealRecordWriteRepository.ts`
- `apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`
- `scripts/consumer-meal-records-phase-2c-guard.mjs`
- `scripts/consumer-meal-records-phase-2c-live-smoke.mjs`

Boundary:

- Approved preparation API: `ConsumerMealRecordWriteService.createCurrentUserMealRecord(input)`.
- Ownership source: current authenticated session only.
- Arbitrary user identity input: rejected by validation.
- Live write behavior: typed fail-closed result before any Supabase write transport.
- Atomic live writes: deferred to Phase 2D.

No Mobile UI, navigation, Restaurant Web runtime, Admin runtime, schema migration, RLS migration, grant migration, remote migration, Consumer Runtime live write, RPC, raw SQL, Storage upload, Realtime connection, service-role key, production credential, URL/key/email/password/user ID/token, full session, raw row, row contents, seed, or fixture was created by Phase 2C.
