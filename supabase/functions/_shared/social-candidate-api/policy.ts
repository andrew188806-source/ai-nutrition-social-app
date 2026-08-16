export const SOCIAL_CANDIDATE_API_POLICY_VERSION = "social-candidate-api-v1" as const;

// The complete V1 client-facing field allow-list. Anything absent here is forbidden output:
// exposureIndex, candidateUserId, userId, profileId, socialPublicId, rankingState, score,
// matchPercent, compatibilityLabel, matchReasons, needsAttention, restrictionWarning, truncated,
// hasMore, isPremium, isVerified, distance, location, age, nutritionGoal, tags and every
// restaurant or meal preference field.
export const SOCIAL_CANDIDATE_API_PUBLIC_FIELDS = Object.freeze([
  "candidateRef",
  "displayName",
  "mascotAvatarKey",
  "publicBio",
  "willingToChat"
] as const);

export const SOCIAL_CANDIDATE_API_ENVELOPE_FIELDS = Object.freeze([
  "candidates",
  "policyVersion"
] as const);

// The frozen SR-2B Premium exposure cap. Never a caller parameter, never a page size.
export const SOCIAL_CANDIDATE_API_MAXIMUM_CANDIDATES = 10 as const;

// The frozen SR-1D Taste composition window. These values are duplicated from the SR-1D provider
// deliberately rather than imported: `_shared` never imports upward out of a function directory.
// The SR-2D guard asserts byte-equality against the SR-1D source, so the two cannot diverge.
export const SOCIAL_CANDIDATE_API_MEAL_LIMIT = 20 as const;
export const SOCIAL_CANDIDATE_API_COMBINED_FAVORITES_LIMIT = 20 as const;
export const SOCIAL_CANDIDATE_API_WINDOW_DAYS = 30 as const;

export const SOCIAL_CANDIDATE_API_CONTRACT_ERROR = "social_candidate_api_contract_violated" as const;

export function socialCandidateApiContractViolation(): never {
  throw new Error(SOCIAL_CANDIDATE_API_CONTRACT_ERROR);
}
