# Meal Record Schema

## Purpose
Replace any single-record shortcut such as `latestCorrectedMealRecord` with a real meal record collection that supports diary, daily intake, recommendations, and future analytics.

## `meal_records`

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | uuid | Yes | Primary key. |
| user_id | uuid | Yes | FK users.id. |
| ai_analysis_run_id | uuid | No | Source AI run if applicable. |
| restaurant_id | uuid | No | FK restaurants.id. |
| menu_item_id | uuid | No | FK menu_items.id. |
| meal_type | enum | Yes | breakfast, lunch, dinner, snack, other. |
| meal_time | timestamptz | Yes | Actual or planned meal time. |
| record_status | enum | Yes | draft, ai_completed, corrected, saved, deleted. |
| dish_name | text | Yes | User-approved display name. |
| source_type | enum | Yes | ai_photo, manual, restaurant_menu, recommendation. |
| is_planned | boolean | Yes | Planned dinner support. |
| completion_status | enum | No | eaten, not_finished, not_eaten. |
| rating | int | No | Post-meal feedback. |
| notes | text | No | User notes. |
| created_at | timestamptz | Yes |  |
| updated_at | timestamptz | Yes |  |
| deleted_at | timestamptz | No | Soft delete. |

## `meal_components`

Component-level structure supports ingredient editing and better nutrition.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| meal_record_id | uuid | FK. |
| component_name | text | Rice, chicken, egg, vegetables. |
| component_type | enum | protein, carb, vegetable, sauce, drink, dessert, other. |
| estimated_weight_g | numeric | Optional. |
| portion_label | text | small, medium, large, custom. |
| cooking_method | text | grilled, fried, boiled, raw. |
| user_corrected | boolean | Whether edited by user. |

## `meal_corrections`

Stores correction events.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| meal_record_id | uuid | FK. |
| ai_analysis_run_id | uuid | FK if applicable. |
| field_name | text | Corrected field. |
| original_value | jsonb | AI/system value. |
| corrected_value | jsonb | User value. |
| correction_source | enum | user, admin, system. |
| created_at | timestamptz |  |

## Planned Dinner Support

Planned meals should update today’s intake UI but be clearly labeled as planned.

Fields:

- `is_planned = true`
- `completion_status = null` until user confirms
- UI label: planned / tonight planned

## Post-Meal Feedback

Supported statuses:

- ate
- not_finished
- not_eaten

These feed food diary and potential calorie sharing logic. A “not finished” record may store `consumed_ratio` later.

## Multi-Photo Prepared Fields

Although UI is deferred, schema can support:

- `meal_id`
- `pre_meal_photo_ids`
- `post_meal_photo_ids`
- `photo_role`: pre_meal, post_meal, receipt, menu, other

## Acceptance Criteria

1. Multiple meal records per user per day are supported.
2. Today summary reads from meal collection, not a single latest record.
3. Corrected values are displayed and used by recommendation.
4. Original AI values remain linked through correction records.
5. Planned meals are visually distinct from completed meals.
6. Rating and completion status support food diary use cases.
