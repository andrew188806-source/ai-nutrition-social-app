# Consumer Schema Freeze Manifest

Freeze version: `consumer-schema-phase-1.2-frozen-candidate`
Freeze date: 2026-07-12
Status: Frozen candidate for human DB/security/legal review. Not executable. Not runtime-approved.

## 1. Freeze Authority

This manifest indexes the Consumer Schema Phase 1.2 frozen candidate. It does not authorize SQL execution, active migration creation, seed import, Consumer Auth integration, runtime integration, UI changes, or production readiness.

Authority files:

- `docs/consumer-canonical-data-mapping.md`
- `docs/consumer-schema-decision-register.md`
- `docs/consumer-schema-rls-matrix.md`
- `docs/consumer-schema-privacy-classification.md`
- `docs/consumer-schema-status-enum-mapping.md`
- `docs/consumer-schema-runtime-handoff.md`
- `docs/supabase-consumer-schema-drafts/001_consumer_enums_and_helpers.sql` through `015_consumer_validation_queries.sql`
- `scripts/validate-consumer-schema.mjs`

## 2. SQL Draft List

- `001_consumer_enums_and_helpers.sql`
- `002_consumer_profiles.sql`
- `003_consumer_preferences_and_goals.sql`
- `004_meal_records.sql`
- `005_meal_analysis_and_corrections.sql`
- `006_meal_consumption_and_sharing.sql`
- `007_planned_meals_and_daily_summaries.sql`
- `008_ratings_and_favorites.sql`
- `009_recommendation_feedback.sql`
- `010_consumer_privacy_and_consents.sql`
- `011_consumer_audit_and_legacy_mapping.sql`
- `012_consumer_indexes.sql`
- `013_consumer_public_private_views.sql`
- `014_consumer_rls_policy_drafts.sql`
- `015_consumer_validation_queries.sql`

All SQL files are draft-only and must not be inserted into an active migration path without a later approved migration phase.

## 3. Accepted Decisions

- `auth.users.id` is the login identity.
- `consumer_profiles.user_id` is the Consumer ownership key.
- `consumer_profiles.profile_id` remains the product/community profile identity.
- Passwords, password hashes, and auth email are not Consumer relational keys.
- Profile creation is an application/bootstrap flow; an optional trigger is future-only.
- `consumer_profiles` is public-safe-ish base profile data.
- `consumer_private_profiles` stores sensitive/private profile fields.
- Account lifecycle values are `active`, `disabled`, `deletion_requested`, `anonymizing`, `anonymized`, and `deleted`.
- `meal_records` represent meal events.
- `meal_record_items` represent item/nutrition snapshots and may omit `menu_item_id` for freeform or AI-estimated meals.
- Meal item snapshots include display, portion, nutrition, nutrition source, nutrition schema version, source entity version, event time, and timezone.
- `meal_analyses` stores AI output, inputs, confidence, and `analyzed_at`.
- `meal_corrections` stores user corrections, reason, and `corrected_at`.
- `consumed_ratio` is constrained to `0..1`; actual nutrition is snapshot multiplied by consumed and allocation ratios.
- Sharing allocation sum enforcement is deferred to transaction/RPC/application logic.
- `planned_meals` and `meal_records` are separate; conversion is tracked with `converted_meal_record_id` and idempotency key.
- `daily_nutrition_summaries` is a server-managed cache, not client-owned truth.
- One current summary is allowed per `user_id`, `local_date`, `timezone`, and `calculation_version`.
- Rating/favorite current-state uniqueness uses partial indexes.
- Recommendation feedback is a Consumer domain record, not analytics truth, and requires an idempotency key.
- The 14-day UI window is not a database purge policy.
- Restaurant-facing Consumer aggregate output requires a minimum of 10 distinct consumers.
- Consent records use `consent_type`, `policy_version`, `accepted_at`, optional `withdrawn_at`, source surface, and locale.
- Subscription entitlement is represented as a snapshot model with plan, source, validity window, status, and source reference.
- Social scope and order/payment scope remain deferred.

## 4. Deferred Decisions

- Executed RLS verification.
- Supabase Auth/JWT harness.
- Profile bootstrap trigger vs application-only bootstrap implementation.
- Meal sharing atomic sum enforcement.
- Account deletion/anonymization job implementation.
- Meal photo retention and backup retention.
- AI output retention and export behavior.
- Rating history storage shape beyond current-row uniqueness.
- Favorite restore semantics.
- Restaurant aggregate tenancy filters and differencing-attack review.
- Subscription billing/order/payment implementation.
- Social schema: Meal Buddy, matches, invitations, chats, group tables, social public profile.

## 5. Legal And Privacy Review Items

- Account deletion/anonymization table-by-table behavior.
- Legal hold and audit retention.
- Consent policy wording and policy version governance.
- Meal photo and AI output retention.
- Consumer data export workflow.
- Aggregate threshold, dimensions, suppression, and differencing risk.

## 6. DB And Security Review Items

- RLS policy execution with authenticated test users.
- Reviewer/admin role claims and audit model.
- Service-role-only backend boundaries.
- Server-owned daily summary writer.
- Sharing allocation transaction/RPC strategy.
- Generated DB types and migration apply test in disposable database.

## 7. Runtime Blocking Decisions

These block Consumer Runtime Integration:

- RLS/Auth execution harness.
- Server-owned daily summary write path.
- Meal sharing atomic enforcement path.
- Account deletion/anonymization job.
- Consent legal wording and version governance.
- Restaurant aggregate privacy tests and tenancy filters.

## 8. Does Not Block Auth/Profile Scaffolding

These do not block a later mock/default Mobile Auth/Profile scaffolding design phase:

- Profile application bootstrap design.
- Public/private profile separation.
- Basic account lifecycle states.
- Consumer ownership model.
- Locale/timezone/preference shape.
- Consent record structure.

Auth/Profile scaffolding may be designed later, but this freeze does not authorize live writes.

## 9. Explicit Non-Goals

- No Consumer SQL execution.
- No active migration.
- No seed.
- No Consumer Auth runtime.
- No Mobile runtime change.
- No Restaurant Web runtime change.
- No Admin runtime change.
- No UI change.
- No mock dataset removal.
- No compatibility layer removal.
- No social schema activation.
- No orders/payments activation.
- No Consumer RLS verification claim.
- No Consumer Auth completion claim.
- No production-readiness claim.

## 10. Execution Confirmations

- Runtime code change confirmation: no Mobile, Restaurant Web, Admin, or UI runtime integration is authorized by this freeze.
- Active migration confirmation: none created.
- SQL execution confirmation: none executed by this package.
- Seed execution confirmation: none executed.
- Restaurant integration regression status: Restaurant Phase 1C/1D live read guards remain a separate read-only Restaurant runtime boundary; Consumer schema freeze does not alter it.

## 11. Validation Results

Expected validation commands for this frozen candidate:

- `node scripts/validate-consumer-schema.mjs`
- root TypeScript check
- Mobile TypeScript check
- Restaurant Web TypeScript check
- Admin Web TypeScript check
- canonical audit
- Restaurant schema validator and Phase 1A/1B-R guards
- no-runtime-import scan
- no-active-migration/no-write scan
- secret scan
- package-lock diff check

Live Restaurant Phase 1C/1D GET-only guards are allowed only as read-only verification and must not print credentials or use service-role keys.

## 12. Known Limitations

- SQL drafts have not been applied.
- RLS has not been executed.
- Consumer Auth is not integrated.
- Mobile Consumer runtime is not integrated.
- No Consumer seed/import/rollback path exists.
- Restaurant aggregates use a draft view and still require privacy/security review before runtime exposure.
- Social, orders, payments, and billing remain deferred.

## 13. Next Allowed Phase

Next allowed phase: `Consumer Runtime Integration Phase 1A - Mobile Auth/Profile Scaffolding` as design/scaffold only, mock/default safe, no live write activation.
## 14. Phase 1A Follow-Up

Consumer Runtime Integration Phase 1A Mobile Auth/Profile Scaffolding has been completed against this frozen candidate.

Phase 1A did not modify the frozen SQL drafts, execute SQL, create an active migration, seed data, verify RLS, integrate live Supabase Auth, change UI, or enable Consumer writes.

Phase 1A artifacts:

- `docs/consumer-runtime-integration/phase-1a-mobile-auth-profile-scaffolding.md`
- `apps/mobile/features/consumer-auth/*`
- `scripts/consumer-auth-phase-1a-guard.mjs`

The next allowed phase after Phase 1B requires explicit approval for live Auth activation; Consumer writes remain disabled.
## 15. Phase 1B Follow-Up

Consumer Runtime Integration Phase 1B Supabase Auth Transport Preparation was completed after Phase 1A.

Status: Supabase Auth Transport Preparation Complete.

The workspace dependency installation was completed manually by the user. Installed Mobile versions are `@supabase/supabase-js@2.110.2` and `react-native-url-polyfill@3.0.0`; `apps/mobile/package.json` and root `package-lock.json` are consistent.

Phase 1B added SDK-independent provider contracts, canonical mappings, lazy factory shell, official SDK lazy loader, AppState lifecycle boundary, fake-client tests, and guards. It did not read real credentials, create a real client, execute SQL, create migrations, seed data, verify RLS, activate live Supabase Auth, change UI, or enable Consumer writes.

## 16. Phase 1C Follow-Up

Consumer Runtime Integration Phase 1C Development Live Auth is implementation-complete, guard-complete, and development-live-verified.

Phase 1C keeps mock defaults and allows only development live Auth when `AUTH_SOURCE=supabase-live`, `AUTH_ENABLED=true`, `PROFILE_SOURCE=mock` or `supabase-disabled`, and `WRITES_ENABLED=false`.

Phase 1C added live Auth factory wiring, official SDK lazy loading with `processLock`, AsyncStorage and AppState boundaries, sign-in/sign-up/sign-out/restore/refresh/observer adapter behavior, email-confirmation-required mapping, session store refresh/sign-up helpers, `scripts/consumer-auth-phase-1c-guard.mjs`, and the opt-in live smoke script `scripts/consumer-auth-phase-1c-live-smoke.mjs`.

Development live smoke passed for email sign-in, session restore, session refresh, auth observer, sign-out, restore after sign-out, observer unsubscribe, and AppState lifecycle. Optional live email sign-up smoke was skipped because explicit sign-up opt-in was not enabled; sign-up mapping and `email_confirmation_required` remain verified by the Phase 1C guard.

Phase 1C did not wire UI, enable Consumer Profile live read/write, execute SQL, create migrations, seed data, verify RLS, enable anonymous Auth, enable password reset, or start Phase 1D. No real Supabase URL/key, email, password, user ID, token, or session is recorded in this repository. Consumer Runtime Integration Phase 1C is a freeze candidate.

## 17. Phase 1D Follow-Up

Consumer Runtime Integration Phase 1D Development Live Profile Read is implementation-complete, guard-complete, development-live-verified, and frozen after the Phase 1C freeze candidate.

Phase 1D keeps mock defaults and allows only development live current-profile reads when `AUTH_SOURCE=supabase-live`, `AUTH_ENABLED=true`, `PROFILE_SOURCE=supabase-live`, and `WRITES_ENABLED=false`.

Phase 1D added a current-profile service boundary, Supabase profile row contract, canonical profile mapper, live current-profile repository, stricter factory validation, typed profile read errors, `scripts/consumer-profile-phase-1d-guard.mjs`, and the opt-in live smoke script `scripts/consumer-profile-phase-1d-live-smoke.mjs`.

Phase 1D reads only the current authenticated user's profile through `getCurrentProfile()`. Phase 1.3 aligns the live read table allowlist to the canonical physical table `consumer_profiles`, and arbitrary user-id lookup is rejected by the live repository compatibility method.

Development live verification passed with an authenticated session, current-user-only `consumer_profiles` read, canonical profile mapping, and sign-out. No credentials, tokens, sessions, user IDs, emails, passwords, or row contents are recorded in this repository. The development profile fixture was operator-created in the development database.

A missing row remains reported as typed `profile_not_found`; Phase 1D does not auto-create, bootstrap, insert, upsert, update, execute SQL, create migrations, seed data, or fall back to mock profile data.

## 18. Phase 1.3 Follow-Up

Consumer Schema Phase 1.3 Formal Migration Activation and Runtime Table Alignment promotes the frozen Consumer Schema draft package into local active migration files under `supabase/migrations/` for future development deployment review.

Phase 1.3 makes the canonical physical profile table decision explicit:

- Database physical table: `consumer_profiles`.
- Ownership column: `consumer_profiles.user_id`.
- Runtime public API: `getCurrentProfile()`.
- Runtime ownership filter: `user_id = canonical session userId`.
- No `user_profiles` compatibility table, alias, or view is introduced.

Phase 1.3 development deployment is complete for the formal migration package plus the forward-only authenticated profile SELECT corrective migration. It does not create seed data, create fixtures, modify `auth.users`, deploy to production, start Consumer Runtime Phase 2, or change Mobile UI/navigation.

Corrective migration:

- `20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql`
- Grants only `SELECT` on `public.consumer_profiles` to `authenticated`.
- Does not grant `anon`, write privileges, `GRANT ALL`, or other Consumer table access.

Local and remote migration history have been aligned by the development operator. RLS remains enabled and the `auth.uid() = user_id` ownership boundary remains active.

No Mobile UI, navigation, Consumer Profile write, private profile read, meal/recommendation/social/order/payment runtime, Restaurant Web runtime, Admin runtime, production credential, real URL/key/email/password/user ID/token, full session, row contents, or fixture contents are recorded in this repository. Phase 2 has not started.

Consumer Runtime Phase 1D is frozen.
Consumer Runtime Phase 2 was not started.
No UI or navigation changes were made.
No Consumer Runtime write operation was implemented or executed.
No profile bootstrap or automatic profile creation was implemented.

## 19. Phase 2A Follow-Up

Consumer Runtime Integration Phase 2A Meal Records Read Architecture and Development Live Read Preparation is implementation-complete and guard-complete.

Phase 2A prepares a read-only current-user Meal Records boundary for `meal_records` and nested `meal_record_items`. It does not execute development live meal read verification; the live meal smoke is intentionally `SKIPPED - Consumer Runtime Phase 2B has not started.`

Phase 2A adds no schema migration, RLS migration, grant migration, seed, fixture, write path, RPC, raw SQL path, UI wiring, navigation wiring, Home/Today Intake cutover, Daily Nutrition Summary runtime, social runtime, recommendation runtime, ratings/favorites runtime, Admin Consumer Governance, production deployment, or Phase 2B work.

The live read preparation preserves the current-user ownership boundary: the repository obtains the canonical session from the Auth boundary, filters `meal_records.user_id` by the current session user, and validates both meal record and meal item ownership while mapping rows into canonical types.

## 20. Phase 2B Follow-Up

Consumer Runtime Integration Phase 2B Development Live Meal Records Read Verification is implementation-complete, guard-complete, development-live-verified, and freeze-ready.

Phase 2B hardens the Phase 2A read architecture with strict calendar date validation, deterministic `occurred_at desc, id desc` ordering, mock/live ordering parity, narrower public exports, and typed mock catch-path handling.

Phase 2B adds the forward-only corrective migration `20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql`, which grants only authenticated SELECT on `public.meal_records` and `public.meal_record_items`, and revokes anon privileges on those two tables. It does not change tables, columns, constraints, policies, functions, triggers, data, seeds, fixtures, write privileges, or production configuration.

Development live meal read verification passed against the development project. The authenticated development user had no meal records, so live transport, authorization, canonical empty-list mapping, and sign-out passed; non-empty live row mapping was skipped.

No real Supabase URL/key, email, password, user ID, token, session, raw database row, row contents, or fixture contents are recorded in this repository. No Consumer Runtime write, RPC, raw SQL execution, UI change, navigation change, Home/Today Intake cutover, Daily Nutrition Summary runtime, ratings/favorites/recommendation feedback runtime, production deployment, or Phase 2C work was implemented.

## 21. Phase 2C Follow-Up

Consumer Runtime Integration Phase 2C Controlled Meal Record Write Preparation is implementation-complete, guard-complete, and freeze-ready.

Phase 2C adds a canonical meal record create contract, validation layer, mock-only in-memory write repository, disabled write repository, and Supabase live write adapter that fails closed before transport because atomic parent-and-items writes are not approved until Phase 2D.

Phase 2C adds no active migration, RLS change, grant, seed, fixture, real Supabase insert/update/upsert/delete, RPC, raw SQL execution, UI wiring, navigation wiring, Home/Today Intake cutover, Daily Nutrition Summary runtime, ratings/favorites/recommendation feedback runtime, production deployment, or Phase 2D work.

The Phase 2C live write smoke is hard-skipped with `SKIPPED - Consumer Runtime Phase 2D has not started.`

## 22. Phase 2D Follow-Up

Consumer Runtime Integration Phase 2D Atomic Development Live Meal Record Write is implementation-complete, guard-complete, development-deployed, development-live-verified, and freeze-ready.

Phase 2D adds one forward-only active migration: `20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql`.

The migration creates `public.create_current_user_meal_record(...)`, a `security definer` PostgreSQL function with fixed `search_path`, current-user ownership through `auth.uid()`, parent and item inserts inside one function transaction, allowlisted JSON response, public/anon execute revokes, authenticated execute grant, and direct table write revokes.

Phase 2D does not change frozen draft SQL, existing tables, columns, policies, read grants, Restaurant schema, seed data, fixtures, profile bootstrap, meal bootstrap, UI, navigation, daily summary runtime, ratings/favorites/recommendation feedback runtime, production deployment, or next phase scope.

Development live write verification passed against `tastkind-development` with credentials, tokens, sessions, user IDs, record IDs, item IDs, raw rows, and raw payloads redacted from output.

## 23. Phase 2E Follow-Up

Consumer Runtime Integration Phase 2E Daily Nutrition Summary Read Architecture and Recalculation Design is implementation-complete, guard-complete, and freeze-ready.

Phase 2E adds the canonical daily nutrition summary read contract, mock and disabled repositories, a prepared Supabase read adapter, a pure deterministic recalculation engine, stored/calculated parity comparison, a hard-skipped live smoke, and a Phase 2E guard.

Phase 2E adds no active migration, RLS change, grant change, remote Supabase operation, development live summary read, summary insert/update/upsert/delete, RPC, raw SQL execution, seed, fixture, UI wiring, navigation wiring, Home/Today Intake cutover, ratings/favorites/recommendation feedback runtime, production deployment, or next phase work.

The Phase 2E live smoke is hard-skipped with `SKIPPED - Consumer Runtime Daily Nutrition Summary live verification has not started.`

Known next prerequisite: add and verify a minimal authenticated SELECT grant for `daily_nutrition_summaries` before development live summary read verification.

## 24. Phase 2F Follow-Up

Consumer Runtime Integration Phase 2F Development Live Daily Nutrition Summary Read is implementation-complete, guard-complete, development-deployed, development-live-verified, and freeze-ready. It adds a development-only read path for the cached daily nutrition summary projection.

Phase 2F adds one forward-only active migration: `20260713060100_consumer_schema_phase_1_3_authenticated_daily_summary_read_grant.sql`.

The migration grants only authenticated SELECT on `public.daily_nutrition_summaries` and revokes anon privileges on that table. It does not grant INSERT, UPDATE, DELETE, ALL, or anon access; does not modify RLS policy semantics; does not change existing schema objects; and does not create seed, fixture, or consumer rows.

The runtime remains mock by default and live summary reads require explicit development opt-in with writes disabled. Development live verification passed: current-user meal reads succeeded, the stored summary read was authorized and returned typed not-found for the selected date, in-memory recalculation succeeded, and stored/calculated parity was skipped because no stored row existed. Stored item count is marked unavailable because the frozen table does not persist it.

Phase 2F does not wire Mobile UI or navigation, does not write summaries back, does not use RPC, does not touch Restaurant Web or Admin runtime, does not deploy to production, and does not start Phase 2G.

## 25. Phase 2G Follow-Up

Consumer Runtime Integration Phase 2G Home / Today Intake Shared Runtime Read Model Preparation is implementation-complete, guard-complete, live-shared-model-skipped, and freeze-ready.

Phase 2G adds no active migration, RLS change, grant change, remote Supabase operation, development live shared-model read, summary write, meal write, RPC, raw SQL execution, seed, fixture, UI wiring, navigation wiring, Home/Today Intake cutover, Restaurant Web runtime, Admin runtime, production deployment, or next phase work.

The phase adds a canonical shared read model, `ConsumerTodayIntakeOverview`, plus `getCurrentUserTodayIntakeOverview(input?)` orchestration through the Consumer Meal Records service, Daily Nutrition Summary service, Phase 2E calculator, and optional planned meals repository.

Stored summaries remain cached projections. Stored summary not-found is metadata, not failure. Stored item count unavailable remains explicit. Planned meals stay separate from actual consumed totals. The factory rejects mixed meal/summary sources and write-enabled flags.

The Phase 2G live smoke is hard-skipped with `SKIPPED - Consumer Runtime Home/Today Intake shared live verification has not started.`

## 26. Phase 2H Follow-Up

Consumer Runtime Integration Phase 2H Development Live Shared Intake Read is implementation-complete, guard-complete, development-live-verified, and freeze-ready.

Phase 2H adds no active migration, RLS change, grant change, database write, meal write, summary write-back, planned meal write, RPC invocation, raw SQL execution, seed, fixture, UI wiring, navigation wiring, Home/Today Intake cutover, Restaurant Web runtime, Admin runtime, production deployment, push, or next phase work.

The default Phase 2H live smoke is skipped without explicit opt-in. The explicit Development live smoke passed through current-user Auth, live Meal Records read, live Daily Nutrition Summary read, Phase 2E recalculation, Phase 2G shared orchestration, deterministic repeat read, and sign-out.

The verified live overview is `partial` because actual consumed meal data exists while optional stored summary and planned meals runtime are unavailable. Partial reasons are `planned_meals_unavailable` and `stored_summary_unavailable`. No mock fallback, raw row leakage, credential output, write, RPC, seed, fixture, or production operation occurred.

## 27. Phase 2I Follow-Up

Consumer Runtime Integration Phase 2I Home / Today Intake Shared Read Model Cutover is implementation-complete, guard-complete, development-live-verified, and freeze-ready.

Phase 2I changes Mobile Home and Today Intake read composition only. Both routes now read through `useTodayIntakeUiModel(...)`, which maps the shared `ConsumerTodayIntakeOverview` into existing UI component shapes. The route files no longer directly import legacy meal record selectors, legacy nutrition summary calculators, planned meal display composition, meal repositories, daily summary repositories, Supabase adapters, or Supabase SDK modules.

The actual consumed source remains current-user meal records plus calculated nutrition from the shared overview. Planned meals remain separate display metadata and are not included in actual consumed totals. Stored summary absence and planned runtime absence produce partial metadata without hiding available meals.

Phase 2I adds no active migration, RLS change, grant change, database write, meal write, summary write-back, planned meal write, RPC invocation, raw SQL execution, seed, fixture, bootstrap, Restaurant Web runtime, Admin runtime, production deployment, push, or Phase 2J work.

The default Phase 2I live smoke is skipped without explicit opt-in. The explicit Development live UI-facing smoke passed with one current-user meal, one item, partial status, stored summary unavailable, planned meals unavailable, nutrition parity against the shared overview, deterministic repeat UI read, and sign-out.

## 28. Phase 2J Follow-Up

Consumer Runtime Integration Phase 2J Controlled Daily Nutrition Summary Persistence Preparation is implementation-complete, guard-complete, default-smoke-skipped, mock-contract-verified, and freeze-ready.

Phase 2J adds a preparation-only persistence boundary for daily nutrition summaries. It calculates totals from current-user meal records using the Phase 2E pure calculator before handing a canonical payload to a persistence repository.

The public service input accepts only `summaryDate`. It does not accept user id, token, session, nutrition totals, meal count, item count, or raw database payloads. Ownership remains current authenticated user plus summary date.

The new source flag is `EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE`, with default `disabled`. Phase 2J allowed `disabled`, `mock`, and `supabase_prepared`; Phase 2K promotes the live value to `supabase`. The Phase 2J prepared mode mapped the future `persist_authenticated_daily_nutrition_summary` payload contract without invoking RPC.

Phase 2J adds no active migration, RLS change, grant change, remote Supabase operation, live summary persistence, database read in default smoke, database write, RPC invocation, seed, fixture, bootstrap, UI wiring, navigation wiring, Restaurant Web runtime, Admin runtime, production deployment, push, or Phase 2K work.

The default Phase 2J smoke is skipped without creating a Supabase client, network request, database read, database write, or RPC invocation. The mock contract smoke is deterministic and local-only.

## 29. Phase 2K Follow-Up

Consumer Runtime Integration Phase 2K Atomic Development Live Daily Nutrition Summary Persistence is implementation-complete, guard-complete, development-deployed, development-live-verified, and freeze-ready.

Phase 2K adds one forward-only active migration:

- `20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql`

It creates `public.persist_authenticated_daily_nutrition_summary(...)`, an authenticated-only atomic persistence RPC for `daily_nutrition_summaries`. The RPC derives ownership from `auth.uid()`, accepts no caller-provided user id, validates canonical summary inputs, and reuses the existing current-summary unique identity.

Execute privileges are bounded to authenticated. Public and anon execute are revoked. Direct authenticated and anon `INSERT`, `UPDATE`, and `DELETE` privileges on `public.daily_nutrition_summaries` remain revoked.

Runtime source values for daily summary writes are now `disabled`, `mock`, and `supabase`; the default remains `disabled`. The `supabase` path is explicit development-only and is not wired to UI or navigation.

Phase 2K does not add seed data, fixtures, bootstrap data, Auth users, automatic summary creation, UI write-back, planned meal runtime, corrections runtime, consumption adjustments runtime, ratings, favorites, recommendation feedback, Restaurant Web runtime, Admin runtime, production deployment, push, or Phase 2L work.

Development live verification passed with current-user meal read, Phase 2E calculation, atomic RPC persistence, read-after-write, stored/calculated parity, repeated persistence, same user/date duplicate prevention, deterministic nutrition values, and sign-out. No URL, key, email, password, token, session, user UUID, record UUID, summary UUID, raw row, or raw RPC response is recorded.
