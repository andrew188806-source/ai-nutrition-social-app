# Calorie and Guilt Sharing PRD

## Objective

Allow users to playfully split perceived calorie/guilt load with others without automatically altering official nutrition records.

## Product Role

This feature adds social fun and group meal context. It must remain non-shaming and should not imply medical accuracy.

## MVP Behavior

- Trigger after analysis or from a dedicated action.
- User inputs number of people and/or split ratio.
- Result shows playful split summary.
- Group table leader can upload same-table context.
- Manual import is used; automatic nutrition-record update is not part of MVP.

## Tone Rules

Use playful language such as:

- “這餐一起分擔一下。”
- “今天快樂熱量有人一起扛。”

Avoid:

- shame language;
- punishment language;
- medical claims.

## Functional Requirements

1. User can open calorie/guilt sharing from analysis result.
2. User can open sharing from meal record or group table context.
3. User can enter participant count.
4. User can adjust proportions.
5. System shows split summary.
6. System does not automatically change personal nutrition totals.
7. User may manually import if product later supports it.

## Data Preparedness

Prepare fields without forcing MVP UI:

- `mealId`
- `sharingSessionId`
- `participantCount`
- `participantUserIds`
- `splitRatios`
- `preMealPhotoIds`
- `postMealPhotoIds`
- `createdByUserId`

Multi-photo capture UI is deferred, but data model should not block it.

## Data Dependencies

- `meal_records`
- `calorie_sharing_sessions`
- `group_tables`
- `users`
- `analysis_photos`

## API Dependencies

- `POST /calorie-sharing`
- `GET /calorie-sharing/{id}`
- `PATCH /calorie-sharing/{id}`

## Analytics Events

- `calorie_sharing_started`
- `calorie_sharing_completed`
- `calorie_sharing_from_group_table`
- `calorie_sharing_manual_import_viewed`

## Acceptance Criteria

1. User can create a sharing summary.
2. Sharing does not modify nutrition totals automatically.
3. Language is playful and non-shaming.
4. Data model supports future multi-photo fields.
5. Group table context can reference sharing session.

## MVP+ Enhancements

- Multi-photo capture UI.
- Participant confirmation.
- Share card generation.
- Optional manual import to nutrition record.
