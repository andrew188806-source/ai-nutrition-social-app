# Supabase Schema Freeze Manifest

Freeze version: supabase-schema-freeze-2026-07-11-phase-1.2
Freeze date: 2026-07-11
Scope: TastKind / Haocu restaurant-platform canonical data schema mapping package
Status: Frozen candidate for human schema/security review. Not approved for execution.

## Authority Files

The schema review baseline is:

- docs/supabase-schema-mapping.md
- docs/supabase-schema-decision-register.md
- docs/supabase-schema-freeze-manifest.md
- docs/supabase-schema-drafts/001_extensions.sql
- docs/supabase-schema-drafts/002_enums_and_lookup_tables.sql
- docs/supabase-schema-drafts/003_restaurants_and_branches.sql
- docs/supabase-schema-drafts/004_restaurant_users_and_staff.sql
- docs/supabase-schema-drafts/005_menus_and_menu_items.sql
- docs/supabase-schema-drafts/006_ingredients_and_nutrition.sql
- docs/supabase-schema-drafts/007_aliases_and_pending_items.sql
- docs/supabase-schema-drafts/008_recommendations.sql
- docs/supabase-schema-drafts/009_analytics_events.sql
- docs/supabase-schema-drafts/010_governance_and_audit.sql
- docs/supabase-schema-drafts/011_indexes.sql
- docs/supabase-schema-drafts/012_views.sql
- docs/supabase-schema-drafts/013_rls_policy_drafts.sql
- docs/supabase-schema-drafts/014_seed_mapping_strategy.sql
- docs/supabase-schema-drafts/015_validation_queries.sql

## Historical / Deprecated Files

- supabase/schema.sql is a deprecated redirect stub and intentionally contains no executable SQL.
- docs/supabase-historical-schema-skeleton.md archives the early Phase 1 schema skeleton for historical reference only.

## Supporting Documents

- docs/tastkind-canonical-data-integration-status.md
- docs/restaurant-canonical-data-boundary.md
- docs/supabase-schema-phase-1-1-freeze-review.md is superseded by Phase 1.2 and retained for audit history only.

## Accepted Decisions

- docs/supabase-schema-drafts/*.sql is the schema review baseline, not an active migration set.
- supabase/schema.sql is not schema authority.
- Runtime TypeScript unions remain unchanged in Phase 1.2.
- Import/runtime adapters must handle status mapping.
- MenuStatus.active maps to database menu_status published.
- RestaurantBranch.isActive true maps to active; false maps to inactive.
- Employee records are separate from login accounts.
- Restaurant/branch tenancy source of truth is membership and role assignment tables, not broad custom claims.
- nutrition_estimates, nutrition_reviews, menu_item_nutrition, and nutrition_change_logs remain separate layers.
- AI estimates do not directly overwrite current published nutrition.
- Analytics event types use a lookup table.
- Analytics events support user_id and anonymous_id actor contexts.
- Legacy mock IDs map to UUIDs through legacy_entity_mappings.
- Production analytics ingestion should use RPC, Edge Function, or ingestion service instead of direct client inserts.

## Deferred Decisions

- Consumer profile production table/view design.
- Analytics retention period.
- Analytics partitioning.
- Materialized view refresh cadence.
- AssistantSuggestion and AssistantActionDraft production persistence.
- Actual import and rollback script implementation.
- Generated Supabase database types.

## Security-Review-Required Items

- Supabase Auth platform admin/reviewer claim strategy.
- SECURITY DEFINER helper functions, if any are introduced.
- RLS helper search_path and authenticated actor validation.
- Restaurant/branch membership enforcement under RLS.
- Admin action write flows and audit trail guarantees.
- Analytics ingestion endpoint permissions.
- Any direct client write policy.

## Explicit Non-Goals

This freeze does not:

- connect any app to Supabase runtime.
- execute SQL.
- create active migrations.
- reset a database.
- seed a database.
- deploy production infrastructure.
- remove the shared mock dataset.
- remove compatibility layers.
- change app runtime adapters, repositories, services, ViewModels, UI, or business logic.
- implement Restaurant Web read-only integration.
- implement analytics ingestion.
- implement import scripts.

## Runtime Code Change Confirmation

No app runtime code is part of this freeze. The touched files are documentation, draft SQL, and the deprecated Supabase stub only.

## Active Migration Confirmation

No active migration was created. docs/supabase-schema-drafts remains draft-only. supabase/schema.sql is now a non-executable redirect stub.

## Validation Results

Validation commands for this freeze:

- `node scripts/audit-canonical-data.mjs` - passed; 0 orphan references and 0 duplicate IDs.
- `npm.cmd exec -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/mobile -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/restaurant-web -- tsc --noEmit --incremental false` - passed.
- `npm.cmd exec --workspace @haocu/admin-web -- tsc --noEmit --incremental false` - passed.
- Runtime import scan for schema/freeze draft references under `apps`, `packages`, and `scripts` - passed; no runtime references found.

## Known Limitations

- SQL drafts are syntax-reviewed by inspection only; they have not been executed against PostgreSQL/Supabase.
- RLS policies are draft-only and not security-certified.
- No import script exists.
- No generated database types exist.
- No materialized view refresh job exists.
- No analytics retention job exists.
- Restaurant Web read-only Supabase adapter is not implemented yet.

## Next Allowed Phase

Recommended next phase: human DB/security review of the frozen candidate.

After human approval, a narrow Restaurant Web read-only Supabase integration may be planned under a feature flag with mock fallback, but it must not include writes, seed import, analytics ingestion, or active migrations unless separately approved.


## Gate 1 DB/Security Review Status

Gate 1 result: Passed with Security Conditions.

Gate 1 artifacts:

- `docs/supabase-schema-review/gate-1-db-security-review.md`
- `docs/supabase-schema-review/gate-1-findings-register.md`
- `docs/supabase-schema-review/rls-policy-matrix.md`
- `docs/supabase-schema-review/schema-validation-checklist.md`
- `docs/supabase-schema-review/static-validation-result.json`
- `docs/supabase-schema-review/review-only-validation-fixtures.sql`

Gate 1 confirms no static schema dependency blocker in the frozen candidate. It does not approve active migrations, SQL execution against production, runtime writes, analytics ingestion, seed import, or production RLS. External Supabase/PostgreSQL security review remains required before write-enabled integration.


## Gate 1.1 Disposable DB/RLS Verification Status

Gate 1.1 result: Blocked by Missing Disposable DB Tooling.

Reason:

- Local `psql` command is not available.
- Local Supabase CLI is not available.
- Local Docker command is not available.

Prepared external review package:

- `docs/supabase-schema-review/gate-1-1-disposable-db-rls-verification.md`
- `docs/supabase-schema-review/disposable-db-setup-notes.md`
- `docs/supabase-schema-review/gate-1-1-rls-constraint-test-plan.md`
- `docs/supabase-schema-review/generated/schema-review-baseline.sql`
- `docs/supabase-schema-review/generated/schema-review-baseline-manifest.json`
- `scripts/assemble-supabase-schema-review-sql.mjs`

No production environment was contacted, no SQL was executed, no active migration was created, and no app runtime code was changed.

## Runtime Scaffolding Note

Restaurant Web Supabase Runtime Integration Phase 1A added read-only scaffolding after this freeze. It does not execute the frozen SQL, create active migrations, verify RLS, or promote the frozen candidate to DB-verified status.

Scaffolding document:

- `docs/supabase-runtime-integration/phase-1a-restaurant-readonly-scaffolding.md`

## Runtime Phase 1B Follow-up Note

Phase 1B dependency normalization was attempted after Phase 1A scaffolding and is blocked by package-lock write permission. No SQL was executed, no active migration was created, no live Supabase client was activated, and the frozen schema candidate remains unverified by DB/RLS execution.

## Runtime Phase 1B-R REST Transport Note

Restaurant Web read-only REST transport scaffolding was added after the schema freeze. It does not execute SQL, create active migrations, seed data, verify RLS, or promote the frozen schema candidate to DB-verified status.

The default data source remains `mock`; live Supabase activation remains blocked by Gate 1.1 prerequisites.
## Runtime Phase 1C Development Public Read Note

A development-only public-read activation pack was prepared after the schema freeze. It is not an active migration, was not executed, and does not change schema authority. The frozen schema candidate remains unverified by DB/RLS execution.
## Runtime Phase 1C Missing Development Schema Note

The development Supabase project is reachable through GET-only REST, but the expected public-read schema resources are missing. No SQL was executed by Codex and the development activation pack remains a non-authoritative, development-only artifact.
## Runtime Phase 1C Development Public Read Verified Note

The development Supabase project returned HTTP 200 for the Phase 1C public-read smoke resources after the development-only activation SQL pack was applied externally. Codex did not execute SQL, create migrations, seed data, or contact production.
## Runtime Phase 1D Restaurant Web Development Live Read Parity Note

Restaurant Web Phase 1D verified the development read-only service path and public REST resource parity after the schema freeze. This was a GET-only runtime verification using the development environment file and publishable key. Codex did not execute SQL, create migrations, seed data, use service-role credentials, or contact production.

Gate 1.1 remains blocked; the frozen schema candidate is still not approved for write-enabled runtime integration or production readiness.
