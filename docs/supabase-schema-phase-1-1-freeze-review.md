# Supabase Schema Mapping Phase 1.1 Freeze Review

> Superseded by Phase 1.2 final freeze. See `docs/supabase-schema-freeze-manifest.md` and `docs/supabase-schema-decision-register.md` for current freeze authority.

Last updated: 2026-07-11

This is a review, decision-resolution, and freeze-preparation document. It does not connect runtime applications to Supabase, execute SQL, create active migrations, seed a database, or replace mock adapters.

## 1. Phase Boundary Check

Phase 1 artifacts present:

- docs/supabase-schema-mapping.md
- docs/supabase-schema-drafts/001_extensions.sql through 015_validation_queries.sql
- docs/supabase-schema-decision-register.md
- docs/tastkind-canonical-data-integration-status.md

Runtime boundary check:

- Runtime applications still use shared mock data through per-app mock adapters.
- Mobile, Restaurant Web, and Admin Web adapter/repository/service/ViewModel boundaries remain unchanged.
- No runtime import references docs/supabase-schema-drafts or docs/supabase-schema-mapping.md.
- packages/services/src/supabase.ts remains a placeholder and does not import @supabase/supabase-js.
- No Supabase SQL was executed as part of this review.
- No active migration was created.

## 2. Schema Authority Decision

Current review baseline:

- docs/supabase-schema-mapping.md
- docs/supabase-schema-drafts/*.sql
- docs/supabase-schema-decision-register.md

Historical skeleton:

- supabase/schema.sql

Decision: supabase/schema.sql is retained as a deprecated historical skeleton only. It must not be used as an active migration or schema authority. A warning header has been added to that file.

Freeze candidate rule: the docs/supabase-schema-drafts directory is still draft-only. Frozen candidate status means ready for human schema review, not ready for direct execution.

## 3. Status Mapping Review

Status mismatch risks identified and resolved at draft/documentation level:

- MenuStatus active in TypeScript/mock maps to published in SQL.
- RestaurantBranch.isActive maps to richer branch_status.
- NutritionBadgeStatus now has its own SQL enum instead of incorrectly reusing nutrition_verification_status.

See docs/supabase-schema-decision-register.md for the full mapping matrix.

## 4. Nutrition Publication Model Review

Recommended model for freeze candidate:

- menu_item_nutrition stores the current published/reviewed nutrition row used for display.
- nutrition_estimates stores AI estimate history.
- nutrition_reviews stores review decisions.
- nutrition_change_logs stores immutable before/after history.
- AI estimates may be adopted only through explicit review/action confirmation.
- Rejected and pending estimates must not become published nutrition.

Open risk: the current TypeScript domain still allows MenuItemNutrition.source = ai_estimated. Runtime compatibility can remain, but production service semantics must distinguish current display row from raw estimate history.

## 5. Analytics Event Schema Review

Phase 1.1 draft fields now cover:

- user_id
- anonymous_id
- restaurant_id
- branch_id
- menu_id
- menu_item_id
- recommendation_id
- session_id
- source
- platform
- device_type
- schema_version
- occurred_at
- ingested_at
- event_idempotency_key
- metadata
- created_at

Risk classification:

- user_id is personal data and requires owner-scoped RLS.
- anonymous_id can still be pseudonymous personal data and should be treated carefully.
- metadata must not become the only home for important relational references.
- schema_version must be incremented when event payload contracts change.

Open decisions:

- Retention period.
- Partitioning by occurred_at or ingested_at.
- Materialized view refresh cadence.
- Event ingestion endpoint vs direct client insert.

## 6. RLS Threat Review

Draft roles/scopes:

| Actor | Read | Insert | Update | Delete | Boundary |
| --- | --- | --- | --- | --- | --- |
| anonymous consumer | approved public restaurant/menu data; possibly analytics insert only through ingestion policy | analytics only if accepted by product/security | none | none | public approved data only |
| authenticated consumer | approved public data; own future meal/rating/favorite records | own analytics, pending submissions | own private records only | own private records only | user ownership |
| restaurant employee | assigned restaurant/branch data | scoped operational records | scoped branch/menu availability if role allows | generally no hard delete | restaurant/branch tenancy |
| branch manager | branch-scoped restaurant console data | branch-scoped operations | branch menu availability and staff operations if permitted | generally no hard delete | branch tenancy |
| restaurant owner/admin | restaurant-scoped data and staff | scoped drafts/updates | restaurant-scoped operational updates | generally no hard delete | restaurant tenancy |
| platform reviewer | review queues and audit-relevant data | admin action drafts | review status through controlled flow | no direct destructive delete | platform governance scope |
| platform admin | platform governance data | drafts/audit/governance actions | controlled high-risk updates | no direct destructive delete except approved maintenance | platform scope |
| service role | all required import/backfill/aggregation data | trusted jobs only | trusted jobs only | maintenance only | server-side only |

Threat notes:

- Draft helper functions must not be considered production-safe until SECURITY DEFINER, search_path, and claim validation are reviewed.
- High-risk restaurant/admin updates should prefer RPC or Edge Function workflows that create audit logs.
- Direct client writes should be limited to low-risk owned records and analytics ingestion.
- audit_logs should be append-only from application perspective.

## 7. UUID Import Mapping Review

legacy_entity_mappings now supports:

- source_system
- source_dataset_version
- source_entity_type
- legacy_id
- canonical_uuid
- target_table
- import_batch_id
- source_row_checksum
- import_status
- rollback_batch_id
- migrated_at

Freeze candidate import principles:

1. Parent entities import before children.
2. Child references resolve through legacy_entity_mappings.
3. Retry uses source_system + source_dataset_version + source_entity_type + legacy_id.
4. source_row_checksum detects changed source rows during retry.
5. import_status and rollback_batch_id preserve rollback traceability.
6. No display name may be used as a relational key.

Open risk: no import script exists yet. This is acceptable for Phase 1.1, but blocks runtime integration.

## 8. SQL Cross-File Consistency Review

Reviewed draft files 001 through 015.

Resolved issues:

- Added nutrition_badge_status enum and changed menu_items.nutrition_badge_status to use it.
- Added analytics fields missing from Phase 1: anonymous_id, menu_id, platform, device_type, schema_version, ingested_at.
- Added analytics actor-context validation draft.
- Added analytics indexes for menu_id and session_id.
- Added validation query coverage for analytics menu_id and actor context.
- Added source_dataset_version/checksum/import_status/rollback metadata to legacy_entity_mappings.

Known SQL draft risks:

- RLS remains draft-only and not security-certified.
- Materialized views need refresh policy before production.
- Validation queries are syntax-reviewed drafts only; they have not been run against a database.
- Some SQL uses placeholder auth claims such as app_role.
- No generated Supabase DB types exist yet.

## 9. Freeze Readiness

Ready for human review:

- Entity-to-table mapping.
- Draft table inventory.
- Status mapping matrix.
- Nutrition publication model.
- Analytics event contract direction.
- Legacy ID to UUID strategy.
- Draft validation queries.

Not ready for runtime integration:

- RLS security review incomplete.
- Auth claims unresolved.
- Import scripts absent.
- Old schema skeleton archival/removal decision pending.
- Analytics retention/partitioning unresolved.
- No SQL lint/test database validation.

Freeze candidate recommendation: mark the Phase 1.1 package as review-ready, not implementation-ready.

## 10. Recommended Next Step

Run a human database/security review over docs/supabase-schema-mapping.md, docs/supabase-schema-drafts/*.sql, and docs/supabase-schema-decision-register.md.

Do not start Restaurant Web read-only Supabase integration until DB-001 through DB-015 blocking decisions in the decision register are accepted or explicitly deferred.
