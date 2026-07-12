# Social Card PRD

## Objective

Represent users in meal-buddy contexts with a privacy-aware, consistent social identity.

## Product Role

The social card reduces social friction by giving users a lightweight identity without forcing full real-person exposure.

## Identity Modes

### Free Anonymous Mode

- Mascot avatar.
- Limited profile fields.
- Basic health/meal summary.
- No required real photo.

### Premium / Verified Mode

- Real-person card where allowed.
- Verification states.
- Richer profile fields.
- More expressive social presence.

## Verification States

- `not_verified`
- `pending`
- `verified`
- `rejected`

These states must be visually consistent and must not imply legal identity verification unless an actual vendor/process exists.

## Card Fields

| Field | Free | Premium |
|---|---:|---:|
| Avatar | Mascot | Mascot or real photo |
| Display name | Nickname | Nickname/real display option |
| Introduction | Short | Longer |
| Gender/age | Optional/limited | Optional/richer |
| Health goal summary | Basic | Richer |
| Recent meal style | Yes | Yes |
| Distance/nearby state | Approximate | More detailed if allowed |
| Chat-first preference | Yes | Yes |
| Verification badge | Limited | Full states |

## Functional Requirements

1. Social card can be rendered in candidate list, match list, chat, and table participants.
2. Avatar state must remain consistent across screens.
3. Free anonymous mascot must not randomly change between pages.
4. Premium real-person option must respect verification state.
5. Card should not expose sensitive health data by default.
6. User can edit profile fields within allowed scope.

## UI Requirements

- Mascot and real-photo states must be visually distinguishable.
- Cards should remain clean and not overcrowded.
- Important compatibility signals should be summarized, not listed excessively.
- Use Traditional Chinese copy through i18n.

## Data Dependencies

- `users`
- `user_profiles`
- `social_cards`
- `verification_statuses`
- `premium_entitlements`
- `meal_summary_snapshots`

## API Dependencies

- `GET /social-card/{userId}`
- `PATCH /social-card/{userId}`
- `POST /verification/request`
- `GET /verification/status`

## Analytics Events

- `social_card_viewed`
- `social_card_edited`
- `real_card_unlock_viewed`
- `verification_started`
- `verification_status_changed`

## Acceptance Criteria

1. Same user shows same avatar/social identity across meal-buddy, chat, and group table surfaces.
2. Free and premium differences are clear.
3. No screen accidentally displays real-person information for anonymous users.
4. Verification states are represented accurately.
5. Card supports social matching without becoming visually cluttered.

## Review Risks

- Privacy exposure.
- Misleading verification claim.
- Age/gender display sensitivity.
- Harassment or safety concerns.
