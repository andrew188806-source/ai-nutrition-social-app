# User Profile Schema

## Purpose
Define user identity, profile, preference, Premium, and social display fields.

## Core Tables

### `users`
Authentication-owned identity.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | uuid | Yes | Primary user id. |
| email | text | Optional | Depending on auth provider. |
| phone | text | Optional | Required for real-person verification if enabled. |
| created_at | timestamptz | Yes | Account creation time. |
| updated_at | timestamptz | Yes | Last update. |
| deleted_at | timestamptz | No | Soft delete. |

### `user_profiles`
Product profile.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | uuid | Yes | Profile id. |
| user_id | uuid | Yes | FK users.id. |
| display_name | text | Yes | Public or internal display. |
| avatar_asset_id | uuid | No | Real avatar or mascot. |
| mascot_id | text | No | Anonymous/default identity. |
| bio | text | No | Social card intro. |
| birth_year | int | No | Avoid exact birthdate in public surfaces. |
| gender_display | text | No | Optional user-controlled field. |
| area_label | text | No | Approximate area, not precise location. |
| profile_visibility | enum | Yes | private, anonymous, verified_public. |
| created_at | timestamptz | Yes |  |
| updated_at | timestamptz | Yes |  |

### `user_preferences`
Food and product preferences.

| Field | Type | Notes |
|---|---|---|
| user_id | uuid | FK users.id. |
| cuisine_preferences | jsonb | Ranked cuisines. |
| disliked_ingredients | jsonb | User-entered exclusions. |
| diet_style_tags | jsonb | e.g. high_protein, light, low_sugar. |
| budget_preference | jsonb | Range or tags. |
| distance_preference_km | numeric | Recommendation radius. |
| social_preference | jsonb | chat_first, direct_meal, group_ok. |
| payment_preferences | jsonb | AA, AB, treat, flexible, rotate. |
| health_goal_mode_enabled | boolean | Premium boundary. |
| health_goal_metadata | jsonb | Professional review required. |

## Real-Person Verification Fields

Suggested table: `identity_verifications`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | FK. |
| status | enum | not_verified, pending, verified, rejected. |
| email_verified | boolean |  |
| phone_verified | boolean |  |
| review_note | text | Internal. |
| submitted_at | timestamptz |  |
| reviewed_at | timestamptz |  |

## Premium Relationship

User profile should not directly hard-code all Premium logic. Use plan/subscription tables from `010_PREMIUM_AND_LIMITS_SCHEMA.md`.

## Public Exposure Rules

Public social card may show:

- display name or mascot name
- avatar/mascot
- short bio
- age range or approximate age if enabled
- health goal label if user chooses
- approximate area
- recent meal style summary

Do not expose:

- email
- phone
- exact birthdate
- precise location
- private meal diary
- internal AI logs

## Acceptance Criteria

1. User can use anonymous/mascot identity without real photo.
2. Premium real-person identity can be separately verified.
3. Social card display fields are distinct from private profile fields.
4. Health goal metadata is not exposed by default.
5. User preference data can power recommendation without exposing private details.
