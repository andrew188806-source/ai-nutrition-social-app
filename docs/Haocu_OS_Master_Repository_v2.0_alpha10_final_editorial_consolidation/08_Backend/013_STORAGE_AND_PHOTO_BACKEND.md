# 013 Storage and Photo Backend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines backend handling for images and storage.

## Storage Buckets

### `meal-photos`

- Private by default.
- Owned by user.
- Used for AI analysis and food diary.

### `restaurant-photos`

- Public or signed access depending on review state.
- Owned by restaurant/admin.

### `menu-photos`

- Public after restaurant/menu approval.
- Can support AI database-first recognition.

### `profile-images`

- Access depends on anonymous/premium/verification rules.

### `admin-evidence`

- Private admin-only.

## Photo Metadata

Store metadata separately:

- `photo_id`
- `owner_user_id`
- `restaurant_id`
- `storage_path`
- `mime_type`
- `size_bytes`
- `width`
- `height`
- `created_at`
- `visibility`

## Upload Flow

1. Client requests allowed upload path or uploads with scoped policy.
2. Storage object created.
3. Metadata record created.
4. AI job or profile/menu record references metadata record.

## Retention

Free tier may have shorter storage retention for certain diary/photo features. Retention must be communicated clearly before deletion.

## Privacy

Meal photos are personal data and should not become publicly accessible without explicit user action.
