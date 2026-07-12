# Nutrition Schema

## Purpose
Define nutrition data for meals, menu items, AI estimates, and corrected records.

## `nutrition_estimates`

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | uuid | Yes | Primary key. |
| entity_type | enum | Yes | meal_record, menu_item, ai_candidate. |
| entity_id | uuid | Yes | Target entity id. |
| calories_kcal | numeric | Yes | Estimated/display calories. |
| protein_g | numeric | Yes |  |
| carbs_g | numeric | Yes |  |
| fat_g | numeric | Yes |  |
| fiber_g | numeric | Yes |  |
| sugar_g | numeric | No | Optional. |
| sodium_mg | numeric | No | Optional. |
| saturated_fat_g | numeric | No | MVP+. |
| cholesterol_mg | numeric | No | MVP+. |
| calcium_mg | numeric | No | MVP+. |
| iron_mg | numeric | No | MVP+. |
| potassium_mg | numeric | No | MVP+. |
| source_type | enum | Yes | verified, restaurant_provided, ai_estimated, user_corrected, manual. |
| confidence_level | enum | Yes | high, medium, low, unknown. |
| version | text | Yes | Nutrition rule/model version. |
| created_at | timestamptz | Yes |  |

## Source Rules

| Source | Display Treatment |
|---|---|
| verified | Can be used with stronger confidence language. |
| restaurant_provided | Requires disclosure status. |
| ai_estimated | Must be labeled as estimate. |
| user_corrected | Used for personal record and recommendation. |
| manual | User-entered; not verified globally. |

## Meal Balance Summary

Suggested fields on meal summary:

- `balance_score`
- `protein_signal`
- `vegetable_signal`
- `calorie_signal`
- `sodium_signal`
- `sugar_signal`
- `recommendation_copy`

These should be treated as product heuristics and reviewed for health claims.

## Nutrition Versioning

Any change to nutrition estimation formula should update:

- `nutrition_rules_version`
- `ai_orchestration_version`
- migration notes if prior records are recalculated

## Acceptance Criteria

1. Every meal record can link to one display nutrition estimate.
2. Original AI estimate and corrected estimate can coexist.
3. Source and confidence are mandatory.
4. Verified restaurant nutrition is distinguishable from AI estimate.
5. Recommendation can read corrected nutrition values.
