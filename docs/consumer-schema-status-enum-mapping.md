# Consumer Schema Status and Enum Mapping

Date: 2026-07-12
Status: Phase 1.1 review draft. Not runtime-approved.

## Scope

This document maps current TypeScript/mock concepts to Consumer SQL draft values and names unresolved runtime behavior. It prevents silent casting from Mobile strings into database enums.

## Mapping Matrix

| Domain concept | Current TypeScript/mock value | SQL draft value | Import/runtime mapping | Unknown value behavior |
| --- | --- | --- | --- | --- |
| Consumer profile lifecycle | active/default profile | `consumer_profile_status.active` | direct | reject import/write |
| Consumer profile lifecycle | disabled account | `disabled` | future Auth/admin state mapping | reject until account policy exists |
| Consumer profile lifecycle | deleted account | `deleted` | deletion workflow sets profile status | reject direct client write |
| Consumer profile lifecycle | anonymized account | `anonymized` | anonymization workflow only | reject direct client write |
| Visibility | private | `profile_visibility.private` | direct | reject |
| Visibility | friends | `friends` | reserved for future social graph | reject until social graph exists |
| Visibility | public | `public` | direct | reject |
| Meal source | restaurant | `meal_source_type.restaurant` | direct | reject |
| Meal source | self_made / selfCooked | `self_made` | normalize `selfCooked` to `self_made` | reject |
| Meal source | manual | `manual` | direct | reject |
| Meal source | ai_estimated | `ai_estimated` | direct | reject |
| Meal period | breakfast | `meal_type.breakfast` | direct | reject |
| Meal period | lunch | `lunch` | direct | reject |
| Meal period | dinner | `dinner` | direct | reject |
| Meal period | lateNight / late_night | `late_night` | normalize camelCase | reject |
| Meal period | snack | `snack` | direct | reject |
| Meal period | other | `other` | direct | reject |
| Nutrition source | restaurant_verified | `nutrition_source_type.restaurant_verified` | direct | reject |
| Nutrition source | admin_verified | `admin_verified` | direct | reject |
| Nutrition source | ai_estimated | `ai_estimated` | direct | reject |
| Nutrition source | user_corrected | `user_corrected` | direct | reject |
| Nutrition source | manual | `manual` | direct | reject |
| Correction status | none | `meal_correction_status.none` | default | reject |
| Correction status | pending | `pending` | direct | reject |
| Correction status | confirmed | `confirmed` | direct | reject |
| Correction status | rejected | `rejected` | direct | reject |
| Consumption completion | finished / 100% | `consumption_completion_status.finished` | completion ratio `1` | reject inconsistent ratio |
| Consumption completion | partial | `partial` | completion ratio `> 0 and < 1` | reject inconsistent ratio |
| Consumption completion | not eaten / 0% | `not_eaten` | completion ratio `0` | reject inconsistent ratio |
| Favorite entity | restaurant | `favorite_entity_type.restaurant` | table-specific in Phase 1 | reject |
| Favorite entity | menu_item | `menu_item` | table-specific in Phase 1 | reject |
| Recommendation feedback | shown | `recommendation_feedback_action.shown` | direct | reject |
| Recommendation feedback | clicked | `clicked` | direct | reject |
| Recommendation feedback | accepted | `accepted` | direct | reject |
| Recommendation feedback | dismissed | `dismissed` | direct | reject |
| Recommendation feedback | saved | `saved` | direct | reject |
| Recommendation feedback | consumed | `consumed` | direct | reject |
| Privacy class | public | `consumer_privacy_classification.public` | direct | reject |
| Privacy class | consumer-private | `consumer_private` | normalize hyphenated copy | reject |
| Privacy class | sensitive preference | `sensitive_preference` | direct | reject |
| Privacy class | health/nutrition | `health_nutrition` | direct | reject |
| Privacy class | internal operational | `internal_operational` | direct | reject |
| Privacy class | aggregate/de-identified | `aggregated_deidentified` | direct | reject |
| Import status | pending | `consumer_import_status.pending` | direct | reject |
| Import status | imported | `imported` | direct | reject |
| Import status | skipped | `skipped` | direct | reject |
| Import status | failed | `failed` | direct | reject |
| Import status | rolled back | `rolled_back` | normalize spaced value | reject |

## Review Notes

- SQL enums intentionally use snake_case.
- Runtime adapters must not pass UI Traditional Chinese labels directly into enum columns.
- Meal display labels remain localization/UI copy, not persistence values.
- The draft currently stores planned-meal and deletion request statuses as text; Phase 1.1 classifies this as a non-blocking finding for human review before final freeze.
- Unknown values should fail closed during import/runtime mapping.
## Phase 1.2 Frozen Status Addendum

Status: Frozen candidate values. Unknown values must fail closed.

| Domain concept | Frozen values | Notes |
| --- | --- | --- |
| Account lifecycle | `active`, `disabled`, `deletion_requested`, `anonymizing`, `anonymized`, `deleted` | Direct client writes to deletion/anonymization states are not allowed. |
| Planned meal status | `planned`, `converted`, `cancelled`, `expired` | `converted` requires `converted_meal_record_id`; conversion idempotency is required for write flow. |
| Entitlement status | `active`, `expired`, `cancelled`, `grace_period` | Snapshot only; payment/order implementation is deferred. |
| Consent lifecycle | accepted row with optional `withdrawn_at` | Version key is `policy_version`, not freeform UI copy. |
| Daily summary current state | `is_current = true/false` | Server-managed cache state; client must not write totals. |

Phase 1.2 replaces the Phase 1.1 note that planned meal and deletion statuses were unresolved. The values above are frozen as a candidate, but not executed or runtime-verified.