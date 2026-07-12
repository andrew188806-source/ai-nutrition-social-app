# Storage and Photo Schema

## Purpose
Define how Haocu stores meal photos, avatar images, restaurant images, menu images, and future multi-photo assets.

## `photo_assets`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| owner_user_id | uuid | Nullable for restaurant/admin assets. |
| restaurant_id | uuid | Optional. |
| menu_item_id | uuid | Optional. |
| storage_bucket | text | e.g. meal-photos. |
| storage_path | text | Object key. |
| mime_type | text |  |
| file_size_bytes | int |  |
| width | int | Optional. |
| height | int | Optional. |
| photo_role | enum | meal, pre_meal, post_meal, avatar, restaurant, menu, receipt, other. |
| visibility | enum | private, public, restricted. |
| moderation_status | enum | pending, approved, rejected. |
| created_at | timestamptz |  |
| deleted_at | timestamptz |  |

## Storage Buckets

Suggested buckets:

- `meal-photos-private`
- `avatar-images`
- `restaurant-images`
- `menu-images`
- `admin-review-assets`

## Multi-Photo Preparation

Although MVP UI uses single photo per analysis, schema should allow:

- pre-meal photo list
- post-meal photo list
- restaurant/menu reference photos
- receipt photo if future expense/verification features exist

## Lifecycle

1. Upload temporary asset.
2. Validate file type/size.
3. Create photo asset record.
4. Link to AI analysis or entity.
5. Moderate if public.
6. Soft-delete or expire according to retention policy.

## Security Rules

- Meal photos default private.
- Public restaurant/menu photos require moderation/review policy.
- Signed URLs should be time-limited.
- Avoid exposing storage paths directly in public APIs.

## Acceptance Criteria

1. Meal photo can be linked to AI analysis and meal record.
2. Avatar/mascot display is separate from private meal photo storage.
3. Multi-photo fields can be supported later without schema redesign.
4. Public images have moderation status.
5. Deleted assets are not shown in UI.
