# Analytics Event PRD

## Objective

Define product event tracking needed to measure activation, retention, AI quality, recommendation usefulness, social conversion, premium intent, and safety.

## Event Design Principles

- Track behavior needed for product decisions.
- Avoid collecting unnecessary sensitive data.
- Use stable event names.
- Include context IDs, not raw private content.
- Respect consent and privacy policy.

## Core Event Groups

### App and Navigation

- `app_opened`
- `screen_viewed`
- `primary_action_tapped`

### AI Analysis

- `analysis_started`
- `photo_captured`
- `photo_uploaded`
- `analysis_completed`
- `analysis_corrected`
- `analysis_saved_to_meal`
- `analysis_failed`

### Meal Records

- `meal_saved`
- `meal_updated`
- `meal_deleted`
- `today_intake_viewed`
- `food_diary_viewed`
- `meal_rated`

### Recommendation

- `recommendation_viewed`
- `recommendation_clicked`
- `recommendation_saved`
- `recommendation_dismissed`

### Social

- `meal_buddy_card_created`
- `meal_buddy_candidate_viewed`
- `invite_sent`
- `invite_accepted`
- `chat_message_sent`
- `group_table_joined`

### Premium

- `premium_gate_shown`
- `premium_feature_viewed`
- `premium_intent_clicked`

### Safety / Review

- `report_submitted`
- `block_user`
- `review_item_created`

## Required Properties

Common properties:

- `userId` or anonymous ID;
- `sessionId`;
- `timestamp`;
- `screen`;
- `source`;
- `entityId` where applicable;
- `tier` free/premium;
- `appVersion`.

Avoid storing raw chat content, raw health notes, or private images in analytics.

## Acceptance Criteria

1. Core funnel can be measured from app open to meal save.
2. Recommendation conversion can be measured.
3. Social invite and chat conversion can be measured.
4. Premium gate performance can be measured.
5. AI correction quality can be measured.
6. Analytics does not store unnecessary sensitive content.
