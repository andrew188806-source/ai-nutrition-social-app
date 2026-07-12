# Mobile App PRD

## Objective

Deliver the Haocu mobile MVP as the primary user-facing experience for meal analysis, nutrition summaries, restaurant discovery, and meal-buddy interactions.

## Product Role

The mobile app is the core consumer product. Restaurant/admin surfaces support it, but the MVP is validated through consumer usage.

## User Problems

- Users do not know what they ate nutritionally.
- Users dislike manual calorie tracking.
- Users struggle to choose the next meal.
- Public restaurant ratings do not reflect personal taste.
- Eating alone can be boring, but social dining needs boundaries.

## Scope

### In Scope

- Home screen.
- AI analysis entry.
- Photo/upload flow.
- AI result and correction.
- Meal save.
- Today intake summary and detail.
- Food diary basics.
- Restaurant recommendation.
- Meal-buddy entry and card list.
- Chat and group table demo surfaces.
- Profile/premium state.

### Out of Scope

- Production payment.
- Medical-grade health coaching.
- Full restaurant admin.
- Full POS integration.
- Household supply-chain app.

## Core Navigation

Recommended mobile route groups:

```text
/home
/analysis
/analysis/capture
/analysis/result
/today-intake
/food-diary
/restaurants
/restaurants/[id]
/meal-buddies
/chats/[id]
/group-tables/[id]
/profile
/premium
```

Homepage shortcuts should reduce path length:

- AI analysis shortcut enters capture/upload flow directly.
- Meal buddy shortcut enters the user’s meal-buddy card section, not an empty standalone page.
- Restaurant shortcut opens recommendation/list surface.

## Primary Flow

```text
Home
  -> AI Analysis
  -> Capture/Upload
  -> Result
  -> Confirm/Correct
  -> Save Meal
  -> Today Intake Update
  -> Next Meal/Restaurant Recommendation
  -> Optional Meal Buddy Card
```

## Functional Requirements

### Home

- Show compact today nutrition summary only.
- Show primary AI analysis entry.
- Show clean shortcuts to restaurant and meal-buddy flows.
- Avoid dense full nutrition report on home.

### Analysis

- Support camera and upload.
- Preserve analysis state when user switches away and returns.
- Pass result to meal record save flow.

### Today Intake

- Use the same data source as full nutrition report.
- Show consumed meals separately from planned meals.
- Show clear nutrition totals and balance notes.

### Restaurant

- Support location/search/type filtering.
- Show recommendation explanation.
- Allow meal-buddy card creation from restaurant card.

### Meal Buddy

- Show user’s cards.
- Search should appear only under matched/meal-buddy view, not chat or table tabs.
- New card must be visible after creation.

### Chat

- Latest message updates list order.
- Back from chat returns to chat tab/list.
- One-on-one and group-table chats remain separate.

## Non-Functional Requirements

- App must be usable in Traditional Chinese.
- UI must be clean, spacious, and demo-friendly.
- Loading states must not feel broken.
- Local demo data should remain stable across refresh where intended.
- Avoid unreviewed medical claims.

## Data Dependencies

- `users`
- `user_profiles`
- `meal_records`
- `meal_analysis_results`
- `restaurants`
- `restaurant_dishes`
- `meal_buddy_cards`
- `matches`
- `chats`
- `group_tables`
- `premium_entitlements`

## Analytics Events

- `app_opened`
- `home_primary_action_tapped`
- `analysis_started`
- `analysis_result_viewed`
- `meal_saved`
- `today_intake_viewed`
- `restaurant_card_viewed`
- `meal_buddy_card_created`
- `chat_message_sent`
- `premium_feature_viewed`

## Acceptance Criteria

1. User can complete analysis-to-save without dead ends.
2. Saved meal appears consistently on home summary and detail report.
3. Correction does not reset unexpectedly.
4. Restaurant card creation flow navigates to the created card.
5. Meal-buddy and chat tabs preserve correct navigation.
6. UI copy is centralized in Traditional Chinese i18n.
7. Free/premium visual differences are consistent.
8. Demo can be completed in three minutes.

## MVP+ Enhancements

- More advanced diary calendar.
- Push notifications.
- Production payment.
- Restaurant admin integration.
- Real verification vendor.
