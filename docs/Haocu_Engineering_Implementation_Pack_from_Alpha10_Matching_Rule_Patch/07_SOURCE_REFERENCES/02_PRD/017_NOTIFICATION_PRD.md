# Notification PRD

## Objective

Define notification and reminder behavior for meal tracking, rating, social coordination, and future premium engagement.

## MVP Scope

Notifications can be implemented as in-app reminders or local notifications first. Push notifications are MVP+ unless infrastructure is ready.

## Notification Types

| Type | Purpose | Stage |
|---|---|---|
| Meal rating reminder | Ask user to rate meal about one hour later. | MVP/MVP+ |
| Planned dinner reminder | Remind planned meal. | MVP+ |
| Meal-buddy invite | Notify invite received. | MVP |
| Chat message | Notify new message. | MVP+ push / demo in-app |
| Group table update | Notify join/leave/completion. | MVP+ |
| Premium feature reminder | Contextual, low frequency. | MVP+ |

## Functional Requirements

1. User can receive meal rating reminder after saved meal.
2. User can disable reminders where required.
3. Social notifications link to correct chat/invite/table.
4. Notification copy is concise and Traditional Chinese.
5. Notifications avoid shame language.
6. Push notification requires permission flow.

## Data Dependencies

- `notification_preferences`
- `notification_events`
- `meal_records`
- `meal_ratings`
- `chats`
- `meal_buddy_invitations`

## Analytics Events

- `notification_scheduled`
- `notification_shown`
- `notification_opened`
- `notification_dismissed`
- `notification_permission_requested`
- `notification_permission_granted`

## Acceptance Criteria

1. Reminder opens the correct target screen.
2. User can avoid repeated annoying reminders.
3. Notification text is friendly and non-shaming.
4. Social notifications do not expose sensitive details on lock screen beyond safe summary.
