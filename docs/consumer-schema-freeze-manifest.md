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

Consumer Runtime Integration Phase 1D Development Live Profile Read is implementation-complete and guard-complete after the Phase 1C freeze candidate.

Phase 1D keeps mock defaults and allows only development live current-profile reads when `AUTH_SOURCE=supabase-live`, `AUTH_ENABLED=true`, `PROFILE_SOURCE=supabase-live`, and `WRITES_ENABLED=false`.

Phase 1D added a current-profile service boundary, Supabase profile row contract, canonical profile mapper, live current-profile repository, stricter factory validation, typed profile read errors, `scripts/consumer-profile-phase-1d-guard.mjs`, and the opt-in live smoke script `scripts/consumer-profile-phase-1d-live-smoke.mjs`.

Phase 1D reads only the current authenticated user's profile through `getCurrentProfile()`. The live read table allowlist is `user_profiles`, and arbitrary user-id lookup is rejected by the live repository compatibility method.

Development live verification is pending until an opted-in live smoke reads an existing development `user_profiles` row. A missing row is reported as typed `profile_not_found`; Phase 1D does not auto-create, bootstrap, insert, upsert, update, execute SQL, create migrations, seed data, or fall back to mock profile data.

No Mobile UI, navigation, Consumer Profile write, private profile read, meal/recommendation/social/order/payment runtime, Restaurant Web runtime, Admin runtime, production credential, real URL/key/email/password/user ID/token, or full session is recorded in this repository. Phase 2 has not started.
