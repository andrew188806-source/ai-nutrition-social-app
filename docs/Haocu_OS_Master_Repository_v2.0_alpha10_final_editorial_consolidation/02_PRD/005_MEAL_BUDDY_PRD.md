# Meal Buddy PRD

## Objective

Allow users to express meal intent and connect with compatible meal buddies through structured, safety-aware meal-buddy cards.

## Product Role

Meal buddy is not a generic dating feature. It is a food-first social layer that makes eating with others easier while keeping boundaries clear.

## Card Creation Channels

1. After AI analysis.
2. From restaurant card.
3. From meal-buddy page.
4. From recommendation flow.

## Meal Buddy Card Fields

| Field | Description |
|---|---|
| `cardId` | Stable ID. |
| `userId` | Creator. |
| `restaurantId` | Optional restaurant. |
| `foodText` | Food or dish intent. |
| `mealDate` | Date. AI-generated cards default to current day. |
| `mealTime` | Time or meal period. |
| `chatPreference` | chat_first or direct_meal. |
| `paymentPreferences` | AA, AB, I treat, depends, rotate. |
| `notes` | Optional user note. |
| `status` | active, matched, expired, cancelled. |
| `source` | analysis, restaurant, manual, recommendation. |

## Free / Premium Limits

### Free

- Daily 2 card opportunities by defined channels.
- One invite at a time.
- Smaller candidate list.
- Anonymous mascot card.

### Premium

- Daily 5 card opportunities by defined channels.
- More candidates.
- Multi-select invite where defined.
- Real-person card where allowed.

Limit behavior must be visible. If reaching the limit replaces the oldest card, the UI must say so before replacement.

## Primary Flow

```text
Create card
  -> Confirm fields
  -> Save card
  -> Navigate to visible card location
  -> Show candidates
  -> User chats/invites
  -> Candidate accepts or declines
  -> Match/chat state updates
```

## Functional Requirements

1. User can create card from each approved channel.
2. Required fields are validated.
3. Card appears immediately after creation.
4. Candidate list respects free/premium rules.
5. User can invite or chat based on card preference.
6. Card status updates through lifecycle.
7. Expired cards are visually separated or removed.
8. Card identity references social card consistently.

## Candidate Matching Signals

- same/similar meal time;
- nearby or same restaurant intent;
- compatible chat preference;
- compatible payment preference;
- food/taste similarity;
- health goal compatibility where appropriate;
- premium/free visibility rules.


## Candidate Deduplication and Re-ranking Rules

Meal Buddy recommendations must avoid showing the same person as a new candidate after a real connection already exists.

### Hard Exclusion

Do not show a candidate in the Meal Buddy recommendation list if any of the following is true:

1. The current user and candidate already have an accepted Meal Buddy match.
2. The current user and candidate already have an active one-on-one chat.
3. The candidate appears in the user's chat list as an active Meal Buddy contact.
4. The relationship has been blocked, reported, suspended, or safety-restricted.

In plain product language: **a person who already appears in chat must not be recommended again as a new Meal Buddy candidate.** Existing Meal Buddies should be reached from the chat/friend list, not rediscovered through candidate ranking.

### Soft Penalties

Candidates may still reappear when no accepted relationship or active chat exists, but their ranking should be reduced based on prior non-conversion signals:

| Prior state | Candidate can reappear? | Ranking treatment |
|---|---:|---|
| Invitation sent but not accepted | Yes | Strong penalty / lower probability. |
| Invitation declined or expired | Yes, unless blocked/reported | Strong penalty plus cooldown. |
| Candidate was shown but user took no action | Yes | Light penalty / lower repeat frequency. |
| Candidate was shown multiple times with no action | Yes | Accumulating light penalty, capped. |

### Default MVP Weight Guidance

Use configurable weights rather than hard-coded magic numbers. Suggested MVP defaults:

- `accepted_match_or_active_chat`: hard exclude before scoring.
- `sent_invite_no_acceptance_penalty`: multiply score by `0.55` or subtract about `35–45` points from a 100-point ranking score.
- `declined_or_expired_invite_penalty`: multiply score by `0.45` and apply a cooldown window before resurfacing.
- `impression_no_action_penalty`: multiply score by `0.85` or subtract about `10–15` points.
- `repeated_impression_no_action_cap`: cap total no-action penalty around `30` points so new users are not permanently buried.

The exact numbers may be tuned after pilot data, but the ordering principle is fixed: **accepted/chat relationships are excluded; unaccepted invitations are heavily down-ranked; passive impressions are lightly down-ranked.**

### UX Rule

Do not show already-connected users in the candidate discovery list. If the product wants to let users eat again with an existing Meal Buddy, that should be a separate "invite existing Meal Buddy" flow, not the new-candidate recommendation list.

## UI Requirements

- Search input lives inside the relevant meal-buddy section.
- Search is not shown on chat or table tabs.
- Create card action should be obvious but not visually overwhelming.
- Created card navigation must avoid user confusion.

## Data Dependencies

- `meal_buddy_cards`
- `social_cards`
- `matches`
- `users`
- `restaurants`
- `chats`
- `premium_entitlements`

## API Dependencies

- `POST /meal-buddy/cards`
- `GET /meal-buddy/cards?userId=`
- `GET /meal-buddy/candidates?cardId=`
- `POST /meal-buddy/invitations`
- `POST /meal-buddy/cards/{cardId}/cancel`

## Analytics Events

- `meal_buddy_card_started`
- `meal_buddy_card_created`
- `meal_buddy_candidate_viewed`
- `meal_buddy_invite_sent`
- `meal_buddy_chat_started`
- `meal_buddy_limit_reached`
- `meal_buddy_card_expired`

## Acceptance Criteria

1. Card can be created from analysis and restaurant surfaces.
2. New card is visible after creation.
3. Free/premium limits work consistently.
4. Candidate list uses unified user data.
5. Invite/chat creates correct downstream state.
6. UI does not duplicate the same function in confusing ways.
7. Users who already have an accepted match or active one-on-one chat with the current user never appear again in new-candidate discovery.
8. Unaccepted invitations and passive impressions reduce future candidate ranking according to configurable penalties.

## MVP+ Enhancements

- More advanced compatibility scoring.
- Public/private card visibility options.
- Better safety/reporting.
- Group table conversion.
