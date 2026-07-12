# 001 Meal Buddy Candidate Deduplication Engineering Spec

## Status

This is a direct engineering extraction of the Alpha 10 Matching Rule Patch. It does not add new product scope.

## Product Rule

A person who already appears in chat must not be recommended again as a new Meal Buddy candidate. Existing Meal Buddies should be reached from the chat/friend list, not rediscovered through candidate ranking.

## Candidate Discovery Order

Candidate recommendation must execute in this order:

```text
1. Load candidate pool
2. Load relationship / chat / invitation / impression history
3. Apply hard exclusions
4. Score remaining candidates by normal compatibility signals
5. Apply soft penalties
6. Sort
7. Trim to free/premium limit
8. Return user-facing reason tags without exposing hidden penalty states
```

## Hard Exclusion

Do not show candidate if any is true:

1. Current user and candidate already have accepted Meal Buddy match.
2. Current user and candidate already have active one-on-one chat.
3. Candidate appears in current user's active chat list as active Meal Buddy contact.
4. Relationship is blocked, reported, suspended, or safety-restricted.

## Soft Penalties

Candidates may reappear only when no accepted relationship or active chat exists.

| Prior state | Reappear? | Ranking treatment |
|---|---:|---|
| Invitation sent but not accepted | Yes | Strong penalty / lower probability |
| Invitation declined or expired | Yes unless blocked/reported | Strong penalty + cooldown |
| Candidate shown but no action | Yes | Light penalty / lower repeat frequency |
| Candidate shown repeatedly without action | Yes | Accumulating light penalty, capped |

## Suggested MVP Weights

Use configurable constants or a lightweight config table, not hard-coded magic numbers spread across UI code.

```ts
export const MEAL_BUDDY_RANKING_WEIGHTS = {
  sentInviteNoAcceptanceMultiplier: 0.55,
  declinedOrExpiredInviteMultiplier: 0.45,
  impressionNoActionMultiplier: 0.85,
  repeatedImpressionNoActionPenaltyCapPoints: 30,
};
```

The exact values can be tuned after pilot data. The ordering principle is fixed:

- accepted/chat relationships are excluded
- unaccepted invitations are heavily down-ranked
- passive impressions are lightly down-ranked

## Data Lookups

Before ranking, query or compute relationship state from:

- `matches`
- `meal_buddy_relationships`
- `chats`
- `chat_participants`
- `invitations`
- `meal_buddy_candidate_interactions`
- candidate impression analytics events if implemented separately

## Pair Key

Use an unordered pair key to avoid direction bugs:

```ts
function pairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}
```

This prevents `A -> B` and `B -> A` being treated as different relationship histories.

## UI Rule

Do not show penalty labels such as “你之前邀請他但他沒同意” or “你之前滑過他沒動作”. Candidate explanation should stay positive and privacy-safe, such as:

- “用餐時間接近”
- “餐點偏好相近”
- “附近也想吃這類餐點”

## Source References

- `07_SOURCE_REFERENCES/SOURCE_OF_TRUTH.md`
- `07_SOURCE_REFERENCES/02_PRD/005_MEAL_BUDDY_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/013_CHAT_INVITATION_PRD.md`
- `07_SOURCE_REFERENCES/03_AI/005_RECOMMENDATION_AI.md`
- `07_SOURCE_REFERENCES/04_Data/005_SOCIAL_SCHEMA.md`
- `07_SOURCE_REFERENCES/04_Data/011_CHAT_AND_INVITATION_SCHEMA.md`
- `07_SOURCE_REFERENCES/23_Engineering_Backlog_Pack/010_AI_RECOMMENDATION_TASK_BREAKDOWN.md`
