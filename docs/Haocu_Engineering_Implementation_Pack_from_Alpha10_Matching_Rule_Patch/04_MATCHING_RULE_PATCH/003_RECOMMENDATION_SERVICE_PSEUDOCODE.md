# 003 Recommendation Service Pseudocode

## Intent

This pseudocode helps engineering implement the Alpha 10 candidate deduplication patch without changing product scope.

```ts
type Candidate = {
  userId: string;
  cardId: string;
  baseScore: number;
  reasonTags: string[];
};

type PairHistory = {
  hasAcceptedMatch: boolean;
  hasActiveMealBuddyRelationship: boolean;
  hasActiveOneToOneChat: boolean;
  isBlockedOrSafetyRestricted: boolean;
  hasSentInviteNoAcceptance: boolean;
  hasDeclinedOrExpiredInvite: boolean;
  impressionNoActionCount: number;
  cooldownActive: boolean;
};

function isHardExcluded(history: PairHistory): boolean {
  return (
    history.hasAcceptedMatch ||
    history.hasActiveMealBuddyRelationship ||
    history.hasActiveOneToOneChat ||
    history.isBlockedOrSafetyRestricted
  );
}

function applySoftPenalties(score: number, history: PairHistory): number {
  let nextScore = score;

  if (history.cooldownActive && history.hasDeclinedOrExpiredInvite) {
    nextScore *= 0.45;
  } else if (history.hasSentInviteNoAcceptance) {
    nextScore *= 0.55;
  }

  if (history.impressionNoActionCount > 0) {
    const cappedCount = Math.min(history.impressionNoActionCount, 3);
    for (let i = 0; i < cappedCount; i++) {
      nextScore *= 0.85;
    }
  }

  return nextScore;
}

function rankMealBuddyCandidates(currentUserId: string, candidates: Candidate[], histories: Map<string, PairHistory>, limit: number) {
  return candidates
    .map(candidate => {
      const key = pairKey(currentUserId, candidate.userId);
      const history = histories.get(key);
      return { candidate, history };
    })
    .filter(({ history }) => !history || !isHardExcluded(history))
    .map(({ candidate, history }) => ({
      ...candidate,
      finalScore: history ? applySoftPenalties(candidate.baseScore, history) : candidate.baseScore,
      reasonTags: candidate.reasonTags.filter(tag => !tag.includes('penalty')),
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}
```

## Implementation Notes

- The UI should not own deduplication logic.
- Backend/service layer should enforce hard exclusion.
- Demo/mock mode should use the same algorithm as production whenever possible.
- Penalty weights should be easy to tune.
