# Recommendation AI

## Purpose
Define the AI-assisted recommendation logic for meals, restaurants, and Meal Buddy candidates.

Recommendation is one of Haocu’s core differentiators: the product should answer “what should I eat next?” and “who can I eat with?” in a way that is more personal than public ratings.

## Recommendation Types

### 1. Next Meal Recommendation
Triggered after AI analysis or from today’s nutrition summary.

Inputs:

- Today’s intake.
- Meal type and time.
- User health goal if available.
- Taste preference.
- Recent food repetition.
- Nearby restaurants.
- Budget/distance preference.

Outputs:

- Suggested dish/restaurant.
- Short reason.
- Nutrition fit explanation.
- Option to use this meal to create a Meal Buddy card.

### 2. Restaurant Recommendation
Triggered from restaurant page/home search.

Inputs:

- User taste memory.
- Location/selected area.
- Cuisine filters.
- Meal context.
- Restaurant menu metadata.
- Personal ratings.
- Similar taste users post-MVP.

Outputs:

- Restaurant list.
- Recommended dishes.
- “Why this fits you” explanation.
- Create Meal Buddy card CTA.

### 3. Meal Buddy Recommendation
Triggered when user creates a Meal Buddy card.

Inputs:

- Meal Buddy card intent.
- Restaurant/dish/time.
- Social setting preference: chat first or direct meal.
- Payment preference.
- Distance or area.
- Compatibility tags.
- Existing friend/match state.
- Active one-on-one chat state.
- Prior invitation and candidate-impression history.

Outputs:

- Candidate cards.
- Free/Premium count limits.
- Compatibility reason.
- Invite/chat actions.

## Ranking Features

| Feature | Next Meal | Restaurant | Meal Buddy |
|---|---:|---:|---:|
| Nutrition fit | High | Medium | Low |
| Taste fit | High | High | Medium |
| Time fit | High | Medium | High |
| Location fit | Medium | High | High |
| Social intent | Low | Low | High |
| Budget fit | Medium | Medium | Medium |
| Familiarity/novelty | Medium | High | Low |
| Availability | Medium | High | High |


## Meal Buddy Candidate History Policy

Meal Buddy ranking must run in this order:

1. **Eligibility filters first.** Remove unsafe, blocked, suspended, invisible, expired, or already-connected candidates.
2. **Relationship deduplication.** Exclude candidates who already have an accepted match, active Meal Buddy relationship, or active one-on-one chat with the current user.
3. **Base compatibility scoring.** Score remaining candidates using meal time, restaurant/dish intent, location, taste similarity, social intent, payment preference, availability, and product limits.
4. **History-based penalties.** Apply ranking penalties based on prior non-conversion history.
5. **Free/Premium truncation.** Apply product count limits after ranking and penalty logic.

### Required Exclusion Rule

If a user already appears in the current user's active one-on-one chat list, that user is not eligible for new Meal Buddy candidate discovery. Existing chat relationships are not "new candidates."

### History Penalties

Suggested MVP ranking adjustments:

| Interaction history | Treatment |
|---|---|
| Accepted match / active chat | Hard exclude before scoring. |
| Invitation sent but not accepted | Strong down-rank; candidate may reappear only at lower probability. |
| Invitation declined / expired | Strong down-rank plus cooldown unless product explicitly resets it. |
| Candidate shown but no user action | Light down-rank; repeat exposure should be reduced. |
| Multiple passive impressions | Accumulate light penalty up to a capped maximum. |

Illustrative formula:

```text
finalScore = baseCompatibilityScore
  * relationshipEligibilityFilter
  * inviteNoAcceptPenalty
  * impressionNoActionPenalty
  * safetyVisibilityFilter
```

Where `relationshipEligibilityFilter` is `0` for accepted matches or active one-on-one chats, and `1` otherwise.

Do not expose these penalty labels directly to users. User-facing explanations should stay positive and simple, such as time, food, distance, or payment compatibility.

## Free/Premium Recommendation Limits

Recommendation logic must respect product limits:

- Free users: smaller candidate sets, anonymous social card default, lower daily creation quota.
- Premium users: more candidates, multiple selection where specified, real-person card unlock, advanced saved history.

AI should not bypass these limits. Limits are product policy, not model policy.

## Explanation Format

Recommendations should include short user-facing reasons:

- “今天蛋白質偏低，這餐比較補蛋白。”
- “你之前給類似餐盒高分。”
- “這家離你近，而且有人也想吃健康餐。”
- “這位飯友時間和付款方式都接近。”

## Anti-Patterns

Do not recommend:

- Extreme diets.
- Shame-based messaging.
- “You should not eat” language.
- People based on sensitive attributes.
- Restaurants solely because they paid for placement without clear sponsorship labeling.

## Acceptance Criteria

1. Recommendation output includes item, reason, and action.
2. Next meal suggestions use today’s corrected meal records.
3. Restaurant suggestions can be generated without social features.
4. Meal Buddy suggestions respect free/Premium limits.
5. Meal Buddy suggestions exclude already matched or active-chat users from new-candidate discovery.
6. Prior unaccepted invitations and passive impressions reduce ranking through configurable penalties.
7. Sponsored restaurant ranking, when added, must be labeled and governance-reviewed.
