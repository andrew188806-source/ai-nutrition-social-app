# Social Schema

## Purpose
Define data for anonymous/real social cards, Meal Buddy cards, matches, friends, and social recommendation.

The social schema must use a unified identity source so that Meal Buddy lists, chat, and group tables do not drift apart.

## `social_cards`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | FK users.id. |
| identity_mode | enum | anonymous, verified_real. |
| display_name | text | Public name or mascot name. |
| avatar_asset_id | uuid | Optional real avatar. |
| mascot_id | text | Anonymous mascot. |
| bio | text |  |
| age_display | text | Optional, e.g. 20s/30s. |
| gender_display | text | Optional user-controlled. |
| area_label | text | Approximate. |
| health_goal_label | text | Optional. |
| recent_meal_style_summary | text | Generated summary, privacy-reviewed. |
| verification_status | enum | not_verified, pending, verified, rejected. |
| visibility_status | enum | visible, hidden, suspended. |

## `meal_buddy_cards`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | Owner. |
| social_card_id | uuid | Display identity. |
| source_type | enum | ai_analysis, restaurant_card, manual. |
| meal_record_id | uuid | Optional. |
| restaurant_id | uuid | Optional. |
| menu_item_id | uuid | Optional. |
| dish_name | text | Food intent. |
| meal_time | timestamptz | Selected date/time. |
| chat_preference | enum | chat_first, direct_meal, either. |
| payment_preferences | jsonb | AA, AB, treat, flexible, rotate. |
| note | text | User note. |
| status | enum | active, matched, expired, replaced, cancelled. |
| created_at | timestamptz |  |
| expires_at | timestamptz |  |

## `matches`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| requester_user_id | uuid |  |
| target_user_id | uuid |  |
| requester_card_id | uuid | Meal Buddy card. |
| target_card_id | uuid | Meal Buddy card. |
| status | enum | invited, accepted, declined, cancelled, expired. |
| match_reason | jsonb | Compatibility explanation. |
| created_at | timestamptz |  |
| updated_at | timestamptz |  |

## Friend State

Accepted chat or meal invitation should create or update a friend/matched state so the person appears in Meal Buddy list.

Suggested table: `meal_buddy_relationships`

- `user_id`
- `related_user_id`
- `status`: matched, active_chat, blocked, archived
- `first_matched_at`
- `last_interaction_at`
- `source_match_id`


## Candidate Discovery History

Suggested table: `meal_buddy_candidate_interactions`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| viewer_user_id | uuid | User receiving candidate recommendation. |
| candidate_user_id | uuid | User shown as candidate. |
| viewer_card_id | uuid | Source Meal Buddy card. |
| candidate_card_id | uuid | Candidate Meal Buddy card. |
| interaction_type | enum | impression, invite_sent, invite_accepted, invite_declined, invite_expired, chat_started, no_action. |
| source_surface | enum | analysis_flow, meal_buddy_page, restaurant_card, recommendation_flow. |
| created_at | timestamptz |  |
| metadata | jsonb | Optional score/debug fields for internal QA only. |

Purpose:

- Support candidate deduplication and re-ranking.
- Prevent already-connected users from being rediscovered as new candidates.
- Down-rank candidates who repeatedly appear without action.
- Down-rank candidates who received invitations but did not accept.

Hard relationship state should be derived from accepted matches, active relationships, and active one-on-one chats. Impression/no-action data should never override a hard exclusion.

## Limits

Daily Meal Buddy card limits are defined in premium schema, but social schema must support replacement of oldest active card when product policy requires it.

## Acceptance Criteria

1. Social card identity is reused across Meal Buddy, chat, and group table.
2. Anonymous and real-person modes are distinct.
3. Accepted invitations create visible relationship state.
4. Meal Buddy card stores time, restaurant/food, chat preference, payment preference, and note.
5. Free/Premium limits can be enforced through linked quota tables.
6. Active one-on-one chats and accepted relationships can be used to hard-exclude duplicate Meal Buddy candidates.
7. Candidate interaction history can support invitation/no-action ranking penalties.
