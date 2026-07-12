# Data Model Overview

## Domain Map

Haocu’s MVP data model is organized into these domains:

1. Identity and profile.
2. Meal and nutrition.
3. AI analysis.
4. Restaurant and menu.
5. Recommendation.
6. Meal Buddy social graph.
7. Group table.
8. Chat and invitation.
9. Premium and quota.
10. Analytics and audit.
11. Storage and media.

## Core Entity Relationships

```text
users
  ├─ user_profiles
  ├─ user_preferences
  ├─ meal_records
  │    ├─ nutrition_estimates
  │    ├─ meal_photos
  │    └─ meal_corrections
  ├─ ai_analysis_runs
  │    └─ ai_candidates
  ├─ social_cards
  │    └─ meal_buddy_cards
  ├─ chats
  │    └─ messages
  ├─ group_tables
  │    └─ group_table_participants
  └─ subscriptions / feature_limits

restaurants
  ├─ restaurant_branches
  ├─ menu_items
  │    └─ menu_item_nutrition
  └─ restaurant_admin_users
```

## MVP Data Decisions

| Decision | Rationale |
|---|---|
| Use real meal record collection instead of single latest record | Daily intake, diary, recommendation, and future analytics require history. |
| Store AI original and user-corrected results separately | Needed for trust, evaluation, and future learning. |
| Use unified user/card references across social flows | Prevent mismatch between Meal Buddy, chat, and group table. |
| Prepare multi-photo fields but defer UI | Data model supports future feature without delaying MVP. |
| Keep restaurant nutrition verification separate from AI estimation | Avoid false claims and support professional review. |

## ID Conventions

Recommended ID patterns:

- `user_id`
- `profile_id`
- `meal_record_id`
- `ai_analysis_run_id`
- `restaurant_id`
- `menu_item_id`
- `social_card_id`
- `meal_buddy_card_id`
- `match_id`
- `chat_id`
- `table_id`
- `message_id`

## Lifecycle States

### Meal Record

- draft
- ai_pending
- ai_completed
- corrected
- saved
- deleted

### Social Card

- anonymous
- pending_verification
- verified
- rejected
- hidden

### Meal Buddy Card

- active
- expired
- replaced
- matched
- cancelled

### Group Table

- open
- full
- upgraded
- completed
- cancelled

## Access Control Summary

| Data | User | Other Users | Admin | Restaurant |
|---|---:|---:|---:|---:|
| Own meal records | Read/write | No | Limited support access | No |
| Own social card | Read/write | Public fields only | Review | No |
| Meal Buddy card | Read/write | Visible if matching/listed | Review | Related restaurant view optional |
| Restaurant menu | Read | Read | Review/write | Own restaurant write |
| Chat messages | Participants | No | Support policy only | No |
| AI raw logs | Own derived result | No | Internal debug | No |

## MVP Implementation Note

During demo/MVP, local mock data may exist, but architecture should migrate toward Supabase-backed collections with a cross-platform storage adapter for web and native Expo.
