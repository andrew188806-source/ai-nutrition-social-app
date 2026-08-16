export const SOCIAL_PROFILE_PROJECTION_POLICY_VERSION = "social-profile-projection-v1" as const;

// The bound is the frozen SR-2B Premium exposure cap. It is never a caller parameter, never a page
// size and never widened by this phase.
export const SOCIAL_PROFILE_MAXIMUM_CANDIDATES = 10 as const;

// The complete V1 public field allow-list. Anything absent here is forbidden output, including
// user_id, profile_id, anonymous_display_name, real_avatar_url, verification_status, diet_summary,
// nutrition_goal_summary, recent_meal_style, locale, timezone, age, location, Taste, ranking state,
// confidence, restriction verdicts and every entitlement or billing fact.
export const SOCIAL_PROFILE_PUBLIC_FIELDS = Object.freeze([
  "displayName",
  "exposureIndex",
  "mascotAvatarKey",
  "publicBio",
  "willingToChat"
] as const);

export const SOCIAL_PROFILE_CONTRACT_ERROR = "social_profile_projection_contract_violated" as const;

export function socialProfileContractViolation(): never {
  throw new Error(SOCIAL_PROFILE_CONTRACT_ERROR);
}
