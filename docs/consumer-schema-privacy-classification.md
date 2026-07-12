# Consumer Schema Privacy Classification

Date: 2026-07-12
Status: Phase 1.2 frozen candidate privacy classification. Requires legal/security review.

| Data area | Classification | Notes |
| --- | --- | --- |
| public display name, anonymous display name, mascot avatar | Public / community-visible | only fields intentionally exposed by public profile view |
| real avatar/photo URL | Consumer-private unless product explicitly exposes | Free/Premium display rules are product logic; DB should store source safely |
| age/gender | Sensitive preference | expose only according to visibility rules |
| health goal, diet summary, allergies, avoided foods | Sensitive health/nutrition-related | owner-scoped; public summary requires explicit product rule |
| meal records/items | Consumer-private health/nutrition-related | restaurant references do not grant restaurant access |
| meal photos | Sensitive health/nutrition-related | retention and deletion policy required |
| AI analysis/corrections | Sensitive health/nutrition-related | includes model version and confidence; do not expose raw by default |
| consumption/completion/unfinished reason | Consumer-private | can be sensitive behavioral data |
| calorie/guilt sharing allocations | Consumer-private or group-context private | social/group schema must define participant visibility later |
| planned meals | Consumer-private | future reminder/notification data may be sensitive |
| daily nutrition summaries | Consumer-private or aggregate/de-identified | restaurant dashboard can only receive aggregate thresholded metrics |
| ratings/favorites | Consumer-private; aggregate/de-identified possible | restaurant should not see raw user identity |
| recommendation feedback | Consumer-private behavioral data | aggregate/de-identified before restaurant analytics |
| consent/deletion requests | Internal operational and privacy-critical | server/admin-only handling; consent version key is `policy_version` |
| subscription entitlements | Consumer-private operational | snapshot only; billing/order/payment implementation deferred |
| legacy ID mappings | Internal operational | not public; supports import/rollback traceability |

## Retention Questions

- How long to keep meal photos after AI analysis?
- How long to keep raw AI model output?
- Whether deleted users are anonymized or hard-deleted.
- Whether ratings/favorites are erased or anonymized after deletion.
- Backup retention expectations.
- Data export format and deadline.

## Public Exposure Rule

Only views designed for public/aggregate output may be exposed outside the owner. Tables containing `user_id` and private health/nutrition data must stay owner-scoped or server-scoped.
## Phase 1.1 Retention Review

The current product may show short UI windows such as recent 14-day history, but UI visibility is not a database retention policy. Phase 1.1 does not freeze purge, anonymization, backup, or legal-hold behavior.

| Topic | Phase 1.1 position | Runtime blocker |
| --- | --- | --- |
| 14-day UI history | UI display window only; not a DB purge decision | product/legal decision needed |
| Meal records | consumer-private health/nutrition-related data | retention and deletion/anonymization policy needed |
| Meal photos | sensitive health/nutrition-related media | retention and storage access policy needed before runtime |
| AI outputs | health/nutrition-related model output | retention, export, correction, and deletion policy needed |
| Ratings/favorites | consumer-private preference data | delete vs anonymize behavior needed |
| Recommendation feedback | consumer-private behavioral data | aggregate/de-identification rules needed |
| Aggregated restaurant metrics | aggregate/de-identified | minimum threshold and tenancy filter needed |
| Audit/change logs | internal operational | legal hold and access policy needed |

## Aggregate Privacy Threshold

The SQL draft uses `count(distinct user_id) >= 5` in `restaurant_consumer_aggregate_metrics` as a placeholder minimum threshold. This is not a final privacy policy. The final threshold and dimensions must be reviewed before any restaurant-facing runtime read.

## Account Deletion Review

Account deletion must decide, table by table, whether rows are deleted, anonymized, retained for legal hold, or retained only as aggregate/de-identified statistics. Phase 1.1 marks this as blocking for runtime integration.
