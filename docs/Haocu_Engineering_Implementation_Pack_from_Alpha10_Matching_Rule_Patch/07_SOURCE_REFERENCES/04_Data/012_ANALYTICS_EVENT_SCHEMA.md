# Analytics Event Schema

## Purpose
Define product analytics events needed for MVP learning, engineering debugging, investor metrics, and funnel analysis.

## `analytics_events`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | Nullable for anonymous/session events. |
| session_id | text | Client session. |
| event_name | text | Standardized event key. |
| event_properties | jsonb |  |
| screen_name | text |  |
| client_platform | text | ios, android, web. |
| app_version | text |  |
| created_at | timestamptz |  |

## Event Naming Convention

Use lowercase snake_case:

- `ai_analysis_started`
- `ai_analysis_completed`
- `ai_candidate_selected`
- `meal_record_saved`
- `recommendation_clicked`
- `meal_buddy_card_created`
- `meal_buddy_invite_sent`
- `chat_message_sent`
- `group_table_created`
- `premium_paywall_viewed`

## MVP Funnels

### AI Analysis Funnel

1. `ai_entry_clicked`
2. `photo_capture_started`
3. `photo_submitted`
4. `ai_analysis_started`
5. `ai_analysis_completed`
6. `ai_candidate_selected`
7. `meal_record_saved`
8. `meal_buddy_cta_clicked`

### Meal Buddy Funnel

1. `meal_buddy_entry_clicked`
2. `meal_buddy_card_created`
3. `meal_buddy_candidates_viewed`
4. `meal_buddy_invite_sent`
5. `invitation_accepted`
6. `chat_message_sent`
7. `meal_completed`

### Restaurant Funnel

1. `restaurant_search_started`
2. `restaurant_card_viewed`
3. `recommended_dish_clicked`
4. `restaurant_meal_buddy_card_created`
5. `map_or_navigation_clicked`

### Premium Funnel

1. `premium_paywall_viewed`
2. `premium_feature_clicked`
3. `premium_plan_selected`
4. `premium_purchase_started`
5. `premium_purchase_completed`

## Privacy Rules

- Avoid storing full chat content in analytics.
- Avoid storing exact location unless reviewed.
- Use IDs and categorical fields instead of sensitive raw values.
- Health goal analytics should be aggregated and access-controlled.

## Acceptance Criteria

1. Key MVP funnels are measurable.
2. Events use consistent naming.
3. Sensitive raw data is not placed in analytics payloads.
4. Investor metrics can be derived from event tables.
5. Debugging metadata includes platform and app version.
