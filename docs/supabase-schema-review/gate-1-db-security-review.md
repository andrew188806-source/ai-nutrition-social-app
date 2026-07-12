# Supabase Schema Human DB & Security Review - Gate 1

Review date: 2026-07-11
Freeze version reviewed: `supabase-schema-freeze-2026-07-11-phase-1.2`
Gate result: **Passed with Security Conditions**

This Gate 1 review is a static DB/security review of the frozen schema candidate. It does not connect app runtime to Supabase, execute production SQL, create active migrations, seed data, deploy infrastructure, or modify Mobile/Restaurant Web/Admin Web runtime code.

## 1. Review Scope

Reviewed:

- Schema authority and freeze manifest.
- Draft SQL files `001_extensions.sql` through `015_validation_queries.sql`.
- Decision Register and status mapping.
- Nutrition publication model.
- Analytics event schema.
- UUID legacy mapping design.
- RLS policy draft and threat model.
- Deprecated `supabase/schema.sql` handling.

Out of scope:

- Runtime Supabase integration.
- Active migrations.
- Production deployment.
- Production seed import.
- App UI/business logic changes.
- Restaurant Web read-only Supabase adapter implementation.

## 2. Environment

Local tool discovery:

- `psql`: not configured / not found.
- `supabase` CLI: not configured / not found.

Because no disposable PostgreSQL/Supabase test environment is available locally, SQL apply, validation-query execution, and RLS execution tests were not run. Gate 1 therefore combines TypeScript/canonical validation with static SQL dependency/security review.

## 3. Files Reviewed

Authority files:

- `docs/supabase-schema-freeze-manifest.md`
- `docs/supabase-schema-decision-register.md`
- `docs/supabase-schema-mapping.md`
- `docs/supabase-schema-drafts/001_extensions.sql` through `015_validation_queries.sql`

Supporting files:

- `docs/supabase-schema-phase-1-1-freeze-review.md`
- `docs/supabase-historical-schema-skeleton.md`
- `supabase/schema.sql`
- `scripts/audit-canonical-data.mjs`
- `scripts/validate-supabase-schema.mjs`

Gate 1 artifacts:

- `docs/supabase-schema-review/static-validation-result.json`
- `docs/supabase-schema-review/rls-policy-matrix.md`
- `docs/supabase-schema-review/gate-1-findings-register.md`
- `docs/supabase-schema-review/schema-validation-checklist.md`
- `docs/supabase-schema-review/review-only-validation-fixtures.sql`

## 4. SQL Apply Result

Not executed locally.

Reason: no local `psql` or Supabase CLI environment is configured. No production or shared database was contacted.

Static substitute performed:

- `node scripts/validate-supabase-schema.mjs`

Result:

- Draft files reviewed: 15
- Types found: 21
- Tables found: 45
- Views found: 5
- Materialized views found: 3
- Functions found: 4
- Indexes found: 31
- Policies found: 12
- Static dependency issues: 0
- Warnings: Supabase auth helper dependency warnings only

## 5. SQL Dependency Findings

No blocking static dependency findings.

Passed static checks:

- FK referenced relations resolve.
- Index targets resolve.
- `ALTER TABLE` targets resolve.
- RLS policy target tables resolve.
- View and validation-query table references resolve.
- Draft SQL files carry draft-only warning headers.

Warning:

- `auth.uid()` and `auth.jwt()` require a Supabase environment or test stub. This is expected for RLS drafts and blocks only executable RLS simulation, not static review.

## 6. Constraint Findings

No blocking constraint findings.

Confirmed:

- UUID primary-key strategy is present in proposed production tables.
- Important foreign keys are explicit.
- Branch menu item uniqueness is scoped by `(branch_id, menu_item_id)`.
- Alias uniqueness is scoped by restaurant/branch and normalized alias through partial unique indexes.
- Current nutrition uniqueness exists through `menu_item_nutrition_one_current_per_item` partial unique index.
- Analytics idempotency key has a unique constraint.
- Analytics actor-context check exists.
- Legacy mapping uniqueness includes `source_system`, `source_dataset_version`, `source_entity_type`, and `legacy_id`.

Static concern:

- Some draft tables intentionally omit `updated_at` triggers. This is acceptable at draft stage but should be standardized before active migration promotion.

## 7. Nutrition Versioning Test Result

Executable DB tests were not run.

Static review result: passed with no blocking findings.

Confirmed model:

- `nutrition_estimates` stores AI estimate history.
- `nutrition_reviews` stores review workflow.
- `menu_item_nutrition` stores current published/reviewed nutrition rows.
- `nutrition_change_logs` stores immutable before/after history.
- AI estimates do not directly overwrite current published nutrition.
- Public reads should use current verified/published nutrition only.

Test-only fixtures were added to `docs/supabase-schema-review/review-only-validation-fixtures.sql` for future disposable DB checks.

## 8. Analytics Schema Test Result

Executable DB tests were not run.

Static review result: passed with security conditions.

Confirmed fields:

- `id`
- `event_type`
- `user_id`
- `anonymous_id`
- `session_id`
- `restaurant_id`
- `branch_id`
- `menu_id`
- `menu_item_id`
- `recommendation_id`
- `source`
- `platform`
- `device_type`
- `schema_version`
- `occurred_at`
- `ingested_at`
- `event_idempotency_key`
- `metadata`
- `created_at`

Confirmed principles:

- Actor context required except admin/server events.
- `ingested_at` is server-generated by default.
- Event type is validated through lookup table.
- Production ingestion should use RPC, Edge Function, or ingestion service.
- Raw events should not be exposed through unrestricted public client access.
- MVP does not require table partitioning.

## 9. UUID Mapping Review

Static review result: passed.

`legacy_entity_mappings` includes:

- `source_system`
- `source_dataset_version`
- `source_entity_type`
- `legacy_id`
- `canonical_uuid`
- `target_table`
- `import_batch_id`
- `source_row_checksum`
- `import_status`
- `rollback_batch_id`
- `migrated_at`
- `created_at`

Design supports:

- idempotent retry.
- duplicate prevention.
- partial failure tracking.
- rollback traceability.
- legacy ID traceability.

Limitation:

- No import script exists yet. This does not block Restaurant Web read-only integration planning, but blocks seed import or write-enabled runtime integration.

## 10. RLS Access Matrix

Detailed matrix: `docs/supabase-schema-review/rls-policy-matrix.md`

Summary:

- Anonymous users may read approved public restaurant/menu data only.
- Authenticated consumers may read public data and use owned/private records only in future phases.
- Restaurant employees are scoped by membership/role assignment.
- Branch managers are branch-limited.
- Restaurant owners/admins are restaurant-scoped.
- Platform reviewers/admins require security-reviewed platform role handling.
- Service role is server-only and must never be exposed to runtime clients.

## 11. Executed Security Tests

No executable RLS/security tests were run locally.

Reason: no Supabase CLI, no disposable Supabase/PostgreSQL environment, and no auth test harness.

Security work performed:

- Static RLS policy target validation.
- RLS matrix review.
- Direct-client-write threat review.
- SECURITY DEFINER scan.
- Runtime import scan.

## 12. Static-only Security Findings

See `docs/supabase-schema-review/gate-1-findings-register.md`.

Security conditions:

- RLS uses Supabase auth helpers and needs external Supabase security review.
- Production analytics writes must use RPC/Edge/ingestion service.
- Admin/restaurant high-risk writes must use controlled server/RPC flow with audit.

## 13. SECURITY DEFINER Findings

Static scan result:

- No `SECURITY DEFINER` functions found in current draft SQL.

Conclusion:

- No immediate SECURITY DEFINER blocker.
- Any future SECURITY DEFINER function must define safe `search_path`, validate authenticated actor, validate tenant/branch membership, validate inputs, and emit/participate in audit trail as appropriate.

## 14. View / Data Exposure Findings

No blocking static findings.

Reviewed views:

- `published_branch_menu_items`
- `current_menu_item_nutrition`
- `restaurant_exposure_summary`
- `nutrition_badge_performance`
- `menu_item_performance`
- `unresolved_pending_menu_items`
- `restaurant_staff_access_scope`
- `analytics_event_quality_issues`

Notes:

- Public consumption should prefer views that filter active/published/current rows.
- Materialized views are acceptable as draft analytics summaries, but refresh scheduling is deferred.
- Analytics aggregate views must avoid leaking user identity.
- Pending/rejected nutrition and pending menu items must not be exposed through public consumer views.

## 15. Validation Query Results

`015_validation_queries.sql` was statically reviewed but not executed against a database.

Static result:

- Query relation references resolve.
- Coverage includes orphan references, duplicate aliases, duplicate current nutrition, invalid analytics references, missing analytics actor context, invalid recommendations, pending item references, employee assignment references, and branch role scope checks.

## 16. Draft Files Modified

Created:

- `scripts/validate-supabase-schema.mjs`
- `docs/supabase-schema-review/static-validation-result.json`
- `docs/supabase-schema-review/rls-policy-matrix.md`
- `docs/supabase-schema-review/gate-1-findings-register.md`
- `docs/supabase-schema-review/schema-validation-checklist.md`
- `docs/supabase-schema-review/review-only-validation-fixtures.sql`
- `docs/supabase-schema-review/gate-1-db-security-review.md`

No app runtime files were modified.

## 17. Runtime Files Modified

None.

## 18. Blocking Findings

Blocking schema findings: 0.

Blocking runtime-write findings remain by design:

- External RLS/security review required before write-enabled integration.
- Import/rollback script required before seed import.
- SQL apply and validation-query execution required before active migration promotion.

## 19. Non-blocking Findings

- Local SQL execution tooling is not configured.
- Materialized view refresh cadence is deferred.
- Analytics retention/partitioning is deferred.
- Consumer profile schema is deferred outside restaurant read-only scope.
- Generated Supabase DB types do not exist yet.

## 20. Deferred Infrastructure Decisions

- Analytics retention period.
- Analytics partitioning strategy.
- Materialized view refresh jobs.
- Import/rollback execution tooling.
- Supabase generated type workflow.
- Disposable DB validation CI.

## 21. External Security Review Requirements

Required before write-enabled or production runtime integration:

- Supabase Auth custom claims review.
- RLS role simulation.
- Membership/branch tenant escape tests.
- Analytics ingestion endpoint review.
- Admin action/audit write-flow review.
- Any SECURITY DEFINER function review if introduced later.

## 22. Gate Result

Gate result: **Passed with Security Conditions**.

Meaning:

- The frozen candidate has no static schema dependency blocker.
- The draft package remains review-only and is not executable production migration material.
- Restaurant Web read-only Supabase integration may be planned after human approval only if feature-flagged, read-only, and backed by mock fallback.
- Runtime writes, analytics ingestion, seed import, active migrations, and production RLS are not approved by this gate.
