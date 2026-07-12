# Consumer Schema Phase 1.1 Freeze Review

Date: 2026-07-12
Status: Review-ready. Not frozen, not runtime-approved.

## 1. Review Scope

Consumer Schema Phase 1.1 reviews the Phase 1 Consumer mapping package and prepares it for a later final freeze decision.

Reviewed:

- consumer canonical mapping
- 15 Consumer SQL draft files
- Auth ownership model
- public/private profile split
- meal and nutrition snapshot model
- ratings/favorites model
- recommendation feedback model
- privacy/retention decisions
- RLS threat model
- status/enum mapping
- static validator output

Not reviewed as complete:

- executable migration readiness
- Supabase Auth runtime
- RLS execution harness
- Mobile runtime integration
- production readiness

## 2. Authority Files

Phase 1.1 review authority:

- `docs/consumer-canonical-data-mapping.md`
- `docs/consumer-schema-decision-register.md`
- `docs/consumer-schema-status-enum-mapping.md`
- `docs/consumer-schema-migration-order.md`
- `docs/consumer-schema-rls-matrix.md`
- `docs/consumer-schema-privacy-classification.md`
- `docs/consumer-schema-validation-plan.md`
- `docs/consumer-schema-runtime-handoff.md`
- `docs/supabase-consumer-schema-drafts/*.sql`
- `scripts/validate-consumer-schema.mjs`

## 3. SQL Draft List

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

All SQL files are draft-only and start with a non-production warning.

## 4. Runtime Code Change Confirmation

No runtime application code is part of Phase 1.1.

No Mobile, Restaurant Web, Admin Web, UI, mock dataset, compatibility layer, Auth runtime, or Supabase runtime was changed for this review.

## 5. Active Migration Confirmation

No active migration exists for this Consumer schema package.

No SQL, seed, migration, database reset, Supabase write, or production contact was executed.

## 6. Cross-file Static Review

The SQL draft package was reviewed for:

- file inventory completeness
- draft-only headers
- enum dependencies
- table dependencies
- foreign key target existence
- index target existence
- view target existence
- RLS policy target existence
- validation query target existence by validator coverage
- naming consistency
- timestamp naming
- soft delete semantics
- UUID / legacy mapping semantics

Result: no blocking static issues found.

## 7. Auth Ownership Review

Accepted draft model:

- `auth.users.id` is account identity.
- Consumer-owned private tables use `user_id uuid references auth.users(id)`.
- `consumer_profiles.profile_id` is product/community identity.
- `user_id` and `profile_id` are intentionally separate.
- Passwords, password hashes, and auth email are not stored in Consumer public tables.

Open before runtime:

- profile creation trigger vs application flow.
- disabled/banned/deleted/anonymized account workflow.
- deletion behavior for meal records, ratings, favorites, recommendation feedback, and audit rows.

## 8. Public / Private Profile Boundary

Accepted draft model:

- `consumer_profiles` stores public-safe base profile data.
- `consumer_private_profiles` stores sensitive owner-scoped data.
- `consumer_public_profiles` is the only public-safe profile view in the draft.
- Restaurant Web must not read raw `consumer_private_profiles`.

Non-blocking review note:

- `real_avatar_url` is conditionally visible through `consumer_public_profiles` only when profile visibility is public. Product display rules may still hide it in Free mode at runtime.

## 9. Meal Domain Review

Accepted draft model:

- `meal_records` are meal-level events.
- `meal_record_items` store item-level references and snapshots.
- Meal item snapshots are required and cannot be replaced by mutable restaurant/menu references.
- AI analysis and user correction are separate tables.
- `consumed_ratio` is constrained to `0..1`.
- sharing allocation ratio is constrained to `0..1`.

Non-blocking finding:

- Allocation sum across multiple participants cannot be fully enforced by a simple row check. It requires a transaction, RPC, trigger, or application-level invariant in a later runtime phase.

## 10. Nutrition Snapshot / Daily Summary Review

Accepted draft model:

- `meal_record_items.nutrition_snapshot` is the historical meal truth.
- `daily_nutrition_summaries` is a server-managed/materialized summary candidate.
- One summary per user/date/timezone is enforced.

Blocking product decision before runtime:

- Whether daily summaries are persisted server-owned rows or computed query results for MVP.

## 11. Ratings / Favorites Review

Accepted draft model:

- Restaurant ratings and menu item ratings are separate.
- Ratings are private by default.
- Current ratings are enforced through partial unique indexes.
- Favorites are separate from ratings.
- Favorites use `removed_at` for soft delete and restore behavior.

Non-blocking product decision:

- Whether rating history is stored as multiple rows or current row plus change log.

## 12. Recommendation Model Review

Accepted draft model:

- `recommendation_sessions` and `recommendation_feedback` are Consumer domain records.
- Restaurant canonical recommendation IDs may be referenced.
- Feedback has idempotency key uniqueness.
- Restaurant analytics should consume aggregate/de-identified output only.
- Raw `user_id` must not be exposed to Restaurant dashboards.

## 13. Privacy / Retention Decisions

Accepted draft classification:

- meal records, AI analysis, corrections, dietary restrictions, health goals, ratings, favorites, and recommendation feedback are Consumer-private or health/nutrition-related.
- restaurant-facing output must be aggregate/de-identified.
- deletion/consent/change logs are internal operational data.

Blocking legal/privacy decisions before runtime:

- meal photo retention period.
- AI output retention period.
- account deletion vs anonymization behavior.
- backup retention expectations.
- aggregate privacy threshold. Draft uses 5 as a placeholder minimum, not final policy.

## 14. RLS Threat Review

Threat scenarios covered in the review package:

- Consumer A reads Consumer B private profile.
- Consumer A reads Consumer B meal records.
- Consumer writes another `user_id`.
- Consumer writes server-owned daily summary fields.
- Consumer creates rating/favorite for another user.
- Restaurant reads raw consumer meal records.
- Restaurant bypasses menu-item filters to infer consumer data.
- Platform reviewer accesses private profile without audit scope.
- Browser client writes legacy mappings.
- Browser client edits consent/deletion audit history.
- Soft-deleted rows bypass uniqueness.
- Public profile view exposes dietary restriction or health notes.

RLS drafts are review-only and use `auth.uid()`, requiring a Supabase test environment before execution claims.

## 15. Development Seed Privacy Review

Accepted seed principles:

- artificial users only.
- no real email addresses.
- no real photos or health data.
- seed batch and dataset version required.
- Restaurant references must point to development Restaurant canonical sample data.
- no social graph data in this package.

No executable seed was created.

## 16. Accepted Decisions

- Consumer schema authority is the Consumer mapping package and draft SQL directory.
- `auth.users.id` owns private data via `user_id`.
- `profile_id` remains product/community identity.
- public/private profile split is required.
- restaurant/menu references are foreign-domain references and do not recreate Restaurant tables.
- meal item snapshots are required.
- AI analysis, correction, consumption adjustment, and sharing allocation are separate concepts.
- ratings and favorites are separate.
- recommendation feedback is Consumer domain, not raw analytics truth.
- production IDs are UUIDs; Mobile mock IDs map through legacy mappings.
- social/order/payment scope is deferred.

## 17. Deferred Decisions

- Food diary named collections.
- subscription entitlement persistence.
- social schema integration.
- order/payment schema integration.
- rating history storage shape.
- planned meal conversion automation.

## 18. Product Decisions Required

- daily summary source of truth.
- favorite restore behavior in UI/product.
- planned meal auto-settlement behavior.
- public profile field list.
- whether public real avatar URL belongs in the public-safe view or is served through signed/object rules later.

## 19. Legal / Privacy Review Required

- meal photo retention.
- AI output retention.
- account deletion/anonymization.
- data export workflow.
- consent versioning.
- aggregate privacy threshold.
- backup retention and legal hold.

## 20. DB / Security Review Required

- RLS policy execution.
- Auth claims and role model.
- platform reviewer/admin policies.
- service-role job boundaries.
- aggregate view privacy threshold enforcement.
- generated DB types.
- transaction/RPC strategy for sharing allocation sums.

## 21. Blocking Findings

No blocking static SQL/document consistency findings were found.

Runtime remains blocked by unresolved security/product/legal decisions and unexecuted RLS/Auth validation.

## 22. Non-blocking Findings

- Draft uses text for some statuses (`planned_meals.status`, deletion request status, analysis status). This is acceptable for review but should be revisited before final freeze.
- Sharing allocation total cannot be guaranteed by row-level checks alone.
- Aggregate threshold uses placeholder value 5.
- Public `real_avatar_url` visibility depends on product policy and may move behind signed media delivery later.

## 23. Known Limitations

- SQL has not been executed.
- RLS has not been tested.
- No Supabase Auth runtime exists.
- No Mobile runtime repository/service integration exists.
- No seed/import/rollback script exists.
- Restaurant Phase 1C/1D live guards may require network approval to rerun.

## 24. Validation Results

Latest local validation:

- `node scripts/validate-consumer-schema.mjs` - passed, 0 issues, 1 expected `auth.uid()` warning.
- `npm.cmd exec -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/mobile -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/restaurant-web -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/admin-web -- tsc --noEmit --incremental false` - passed.
- `node scripts/audit-canonical-data.mjs` - passed.
- `node scripts/validate-supabase-schema.mjs` - passed with existing Supabase auth-helper warnings only.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1a` - passed.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1b-rest` - passed.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1c-smoke` - passed after GET-only network approval; no credentials printed, no writes.
- `npm.cmd --workspace @haocu/restaurant-web run test:phase1d-live` - passed after GET-only network approval; no credentials printed, no writes.
- `npm.cmd --workspace @haocu/restaurant-web run build` - passed.
- runtime import scan for Consumer schema docs under `apps`, `packages`, and `supabase` - passed; no runtime imports.
- package-lock diff scan - passed; no changes.
- active migration / write scan - no Consumer data writes found; one expected RLS `for update` policy text match.
- secret scan - no credentials found; only documentation mentions of not using service-role.

## 25. Next Allowed Phase

Next allowed phase: Consumer Schema Final Decision Freeze after human review of product, legal/privacy, and DB/security decisions.

Not allowed yet:

- Consumer runtime integration.
- Mobile Auth integration.
- Supabase migration execution.
- seed execution.
- production deployment.
- social/order/payment schema activation.
## Phase 1.2 Supersession Note

Consumer Schema Phase 1.1 remains historical review context. Current freeze authority is `docs/consumer-schema-freeze-manifest.md` with freeze version `consumer-schema-phase-1.2-frozen-candidate`.

Phase 1.2 resolves the Phase 1.1 placeholder items for account lifecycle values, planned meal conversion fields, daily summary current-row identity, consent version naming, subscription entitlement snapshot shape, and restaurant aggregate threshold. It still does not authorize SQL execution, active migration, seed, Auth runtime, Mobile runtime, Restaurant/Admin runtime changes, UI changes, RLS verification, or production readiness.