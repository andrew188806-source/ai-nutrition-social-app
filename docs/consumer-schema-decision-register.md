# Consumer Schema Decision Register

Date: 2026-07-12
Status: Draft for human DB/security review. Not runtime-approved.

## Decision Status Legend

- Accepted Draft: stable enough for review, not approved for execution.
- Deferred: intentionally postponed.
- Requires Security Review: must be reviewed before migration/runtime.
- Blocks Runtime Integration: must be resolved before Mobile Supabase activation.

| ID | Topic | Draft decision | Status | Blocks runtime integration? |
| --- | --- | --- | --- | --- |
| C-001 | Schema authority | Consumer Phase 1 authority is `docs/consumer-canonical-data-mapping.md` plus `docs/supabase-consumer-schema-drafts/*.sql`. | Accepted Draft | No |
| C-002 | Active migration source | No active migration exists. SQL files are draft-only. | Accepted Draft | Yes |
| C-003 | Auth ownership | `auth.users.id` owns consumer private rows through `user_id`; product profile identity remains separate as `profile_id`. | Requires Security Review | Yes |
| C-004 | Public/private profile split | Public-safe profile fields live in `consumer_profiles`; sensitive fields live in `consumer_private_profiles`. | Accepted Draft | No |
| C-005 | Restaurant references | Consumer tables may reference Restaurant canonical IDs but must not recreate Restaurant tables. | Accepted Draft | No |
| C-006 | Meal snapshot model | Meal items store snapshots so meal history does not change when restaurant nutrition changes. | Accepted Draft | No |
| C-007 | AI analysis persistence | AI outputs and user corrections are separate from meal records. | Accepted Draft | No |
| C-008 | Consumption adjustment | Actual consumption ratio and unfinished reasons are separate rows. | Accepted Draft | No |
| C-009 | Group/guilt sharing | Phase 1 supports meal sharing allocation; social group-table schema remains deferred. | Accepted Draft | No |
| C-010 | Daily summary | Draft includes `daily_nutrition_summaries`, but persistence vs query-derived is a human decision. | Deferred | Yes |
| C-011 | Ratings | One active restaurant/menu-item rating per user/entity through partial unique indexes. | Accepted Draft | No |
| C-012 | Favorites | Favorites use soft delete and active partial uniqueness. | Accepted Draft | No |
| C-013 | Recommendation feedback | Consumer recommendation feedback stores action timestamps and may reference Restaurant recommendation results. | Accepted Draft | No |
| C-014 | Raw analytics | Consumer schema does not make raw analytics events the source of truth. | Accepted Draft | No |
| C-015 | Food diary collections | Named collections/top entries are deferred unless MVP requires persistence. | Deferred | No |
| C-016 | Privacy retention | Detailed retention windows require legal/product decision. | Requires Security Review | Yes |
| C-017 | Account deletion | Deletion/anonymization workflow requires security/legal review. | Requires Security Review | Yes |
| C-018 | Restaurant visibility | Restaurants may receive aggregate/de-identified views only, with threshold to be decided. | Requires Security Review | Yes |
| C-019 | Service role | Service role is server/job only, never Mobile/Restaurant/Admin browser runtime. | Accepted Draft | Yes |
| C-020 | Legacy IDs | Production primary keys are UUIDs; Mobile mock IDs map through `legacy_consumer_entity_mappings`. | Accepted Draft | No |
| C-021 | Development seed | Seed design is artificial, development-only, and not included as executable seed. | Accepted Draft | No |
| C-022 | Social scope | Meal Buddy, matches, chats, invitations, and group tables are deferred to separate social schema mapping. | Accepted Draft | No |
## Phase 1.1 Review Addendum

Date: 2026-07-12
Status: Review-ready addendum. Not final frozen.

| ID | Topic | Phase 1.1 resolution | Status | Blocks runtime integration? |
| --- | --- | --- | --- | --- |
| C-023 | Public profile safe view | `consumer_public_profiles` is the only public-safe profile exposure in the draft. Raw private profile tables remain owner/server scoped. | Accepted Draft | No |
| C-024 | Real avatar exposure | Draft allows `real_avatar_url` only through profile visibility; Free/Premium display behavior remains runtime product logic. Signed media delivery may replace raw URL later. | Requires Product Decision | No for schema review, Yes for runtime media policy |
| C-025 | Daily summary source of truth | `meal_record_items.nutrition_snapshot` is meal truth. `daily_nutrition_summaries` is server-managed/materialized candidate, not user-owned truth. Persisted vs computed remains unresolved. | Requires Product Decision | Yes |
| C-026 | Sharing allocation invariant | Row-level ratio constraints are accepted. Sum/across-participant enforcement requires transaction, RPC, trigger, or application invariant later. | Requires DB/Security Review | Yes for write runtime |
| C-027 | Aggregate privacy threshold | Draft view uses `count(distinct user_id) >= 5` as placeholder minimum. Final threshold requires privacy/legal/product review. | Requires Legal/Privacy Review | Yes |
| C-028 | Meal photo retention | No purge policy is frozen. Runtime must not persist real meal photos until retention is approved. | Requires Legal/Privacy Review | Yes |
| C-029 | AI output retention | AI estimates/corrections are health/nutrition-related. Retention and deletion behavior require review. | Requires Legal/Privacy Review | Yes |
| C-030 | Account deletion/anonymization | Tables support deletion/anonymization metadata, but exact cascade/anonymize behavior is not frozen. | Requires Legal/Privacy Review | Yes |
| C-031 | Rating history | Partial unique indexes enforce one current rating. History shape remains open: multiple rows vs current row plus change log. | Requires Product Decision | No for schema review, Yes before rating runtime |
| C-032 | Favorite restore | `removed_at` supports soft delete. Whether restore reuses row or creates a new row is runtime/product decision. | Requires Product Decision | No |
| C-033 | Recommendation idempotency | `event_idempotency_key` is required and unique per user to prevent duplicate feedback. | Accepted Draft | No |
| C-034 | Restaurant aggregate visibility | Restaurants may consume aggregate/de-identified views only; no raw `user_id`, meal records, ratings, or favorites. | Accepted Draft / Requires Security Review | Yes |
| C-035 | Status enum mapping | Runtime adapters must map TypeScript/UI values to SQL enums; unknown values fail closed. | Accepted Draft | No |
| C-036 | Text statuses in drafts | `planned_meals.status`, `meal_analyses.analysis_status`, and deletion request status are text in Phase 1.1. Revisit before final freeze. | Non-blocking Finding | No |
| C-037 | Social schema dependency | Meal Buddy, invitations, matches, chats, and group tables remain outside Consumer schema and must not be pulled into this freeze. | Accepted Draft | No |
| C-038 | Order/payment dependency | Orders, payments, and subscription billing remain deferred. | Accepted Draft | No |

## Phase 1.1 Runtime Gate

Consumer runtime integration remains blocked until these are resolved or explicitly deferred by human approval:

- C-003 Auth ownership execution review
- C-010 / C-025 daily summary source of truth
- C-016 / C-028 / C-029 privacy retention
- C-017 / C-030 account deletion/anonymization
- C-018 / C-027 / C-034 restaurant aggregate visibility threshold and RLS
- C-026 sharing allocation write invariant
- RLS/Auth execution harness

Phase 1.1 does not authorize SQL execution, active migrations, seed import, Auth runtime, Mobile runtime integration, social schema work, or production readiness.

## Phase 1.2 Final Freeze Addendum

Date: 2026-07-12
Status: Frozen candidate. Not executable. Not runtime-approved.

| ID | Topic | Phase 1.2 final frozen decision | Status | Blocks runtime integration? |
| --- | --- | --- | --- | --- |
| C-039 | Freeze authority | `docs/consumer-schema-freeze-manifest.md` is the authority index for `consumer-schema-phase-1.2-frozen-candidate`. | Accepted Frozen Candidate | No |
| C-040 | Auth identity | `auth.users.id` is login identity; `consumer_profiles.user_id` is the UUID ownership key; auth email/password/hash are not Consumer relational keys. | Accepted Frozen Candidate / Requires Security Review | Yes before live writes |
| C-041 | Profile bootstrap | Profile creation is application/idempotent bootstrap flow. Optional trigger remains future-only and not required for Auth scaffolding. | Accepted Frozen Candidate | No for scaffolding, Yes before production |
| C-042 | Account lifecycle | Frozen lifecycle values: `active`, `disabled`, `deletion_requested`, `anonymizing`, `anonymized`, `deleted`. | Accepted Frozen Candidate | Yes for deletion runtime |
| C-043 | Deletion/anonymization | Private profile, preferences, taste, and goals anonymize/delete; meals/ratings/favorites/feedback may retain anonymous aggregate while removing user linkage; consent/deletion/audit retention requires legal review. | Requires Legal/Privacy Review | Yes |
| C-044 | Meal item snapshot | `meal_record_items` stores historical item/nutrition snapshot including schema/source version, occurred time, and timezone. | Accepted Frozen Candidate | No |
| C-045 | AI analysis/correction | `meal_analyses` stores AI output and `analyzed_at`; `meal_corrections` stores correction reason and `corrected_at`. | Accepted Frozen Candidate | No |
| C-046 | Consumption and allocation | `consumed_ratio` is `0..1`; allocated actual nutrition is snapshot multiplied by consumed and allocation ratios. Cross-row allocation sum is deferred to transaction/RPC/application logic. | Accepted Frozen Candidate / Requires DB Review | Yes for sharing writes |
| C-047 | Planned meal conversion | Planned meals remain separate from meal records and use `converted_meal_record_id` plus conversion idempotency key. | Accepted Frozen Candidate | No |
| C-048 | Daily summary | `meal_record_items.nutrition_snapshot` is truth; `daily_nutrition_summaries` is server-managed cache with one current row per user/local_date/timezone/calculation_version. | Accepted Frozen Candidate / Requires DB Review | Yes for summary writes |
| C-049 | Timezone | Meal events store UTC `occurred_at` and timezone snapshot; summaries derive `local_date` from timezone. | Accepted Frozen Candidate | No |
| C-050 | Aggregate threshold | Restaurant-facing Consumer aggregate requires minimum 10 distinct consumers. | Accepted Frozen Candidate / Requires Privacy Review | Yes for Restaurant analytics |
| C-051 | Consent versioning | Consent rows use `consent_type`, `policy_version`, `accepted_at`, optional `withdrawn_at`, `source_surface`, and `locale`. | Accepted Frozen Candidate / Requires Legal Review | Yes before consent runtime |
| C-052 | Subscription entitlement | Entitlement snapshot model is included; billing/orders/payments remain deferred. | Accepted Frozen Candidate | No for schema review, Yes before billing |
| C-053 | Social scope | Meal Buddy, matches, invitations, chats, group tables, and social public profile remain out of Consumer Phase 1.2. | Accepted Frozen Candidate | No |

### Phase 1.2 Runtime Gate

Consumer Runtime Integration remains blocked until RLS/Auth execution, server-owned daily summary writes, sharing allocation atomicity, deletion/anonymization, legal consent wording, and aggregate privacy tests are approved.

Phase 1.2 does not authorize SQL execution, active migrations, seed import, Consumer Auth runtime, Mobile runtime integration, social schema work, orders/payments, or production readiness.