# Restaurant and Menu Schema

## Purpose
Define restaurant, branch, menu, dish, and nutrition data used by recommendation, AI database-first lookup, and restaurant/admin workflows.

## `restaurants`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| name | text | Display name. |
| brand_name | text | Chain brand if applicable. |
| description | text | Short intro. |
| cuisine_tags | jsonb | Category tags. |
| price_level | int | 1–4. |
| verification_status | enum | unverified, pending, verified, rejected. |
| nutrition_disclosure_status | enum | none, ai_estimated, restaurant_provided, admin_reviewed. |
| created_at | timestamptz |  |
| updated_at | timestamptz |  |

## `restaurant_branches`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| restaurant_id | uuid | FK. |
| branch_name | text | e.g. Shilin branch. |
| address | text |  |
| area_label | text | Approximate area for UI. |
| latitude | numeric | Optional; privacy/security review. |
| longitude | numeric | Optional. |
| opening_hours | jsonb |  |
| phone | text | Optional. |
| google_place_id | text | Optional integration field. |
| is_active | boolean |  |

## `menu_items`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| restaurant_id | uuid | FK. |
| branch_id | uuid | Optional branch-specific item. |
| name | text | Dish name. |
| description | text |  |
| price | numeric |  |
| currency | text | TWD default. |
| image_asset_id | uuid | Optional. |
| cuisine_tags | jsonb |  |
| nutrition_tags | jsonb | high_protein, low_sugar, etc. |
| availability_status | enum | active, sold_out, seasonal, archived. |
| source_type | enum | restaurant, admin, user_upload, ai_estimated. |
| verification_status | enum | unverified, pending, verified, rejected. |

## `menu_item_ingredients`

| Field | Type | Notes |
|---|---|---|
| menu_item_id | uuid | FK. |
| ingredient_name | text |  |
| amount_g | numeric | Optional. |
| role | enum | protein, carb, vegetable, sauce, topping, other. |
| optional | boolean |  |

## `menu_item_nutrition`

See `008_NUTRITION_SCHEMA.md` for detailed fields.

## User-Uploaded New Dishes

If a user uses AI to upload a new dish for a restaurant, it may create a candidate menu item with:

- `source_type = user_upload`
- `verification_status = unverified`
- `nutrition_disclosure_status = ai_estimated`

Admin or restaurant review is required before treating it as official.

## Restaurant Card to Meal Buddy Flow

Restaurant card can create a Meal Buddy card using:

- restaurant_id
- menu_item_id or free-text dish
- selected date/time
- meal intent
- payment preference

AI-generated Meal Buddy cards should default date to current day unless user selects otherwise.

## Acceptance Criteria

1. Restaurant and branch are separate entities.
2. Menu items can be verified, estimated, or user-uploaded.
3. Restaurant/menu context can power database-first AI.
4. User-uploaded dishes do not become official without review.
5. Restaurant card can generate a Meal Buddy card with date context.
