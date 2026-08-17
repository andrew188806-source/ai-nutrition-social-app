// SR-2C-R1 public Social interest module. Data + settings + projection authority only: no Meal Buddy
// card coupling, no ranking, no exposure change, no Mobile, no SR-2G-D orchestration.
export {
  aggregateInterestCategories,
  collectProfileInterests,
  deriveCompactInterests
} from "./aggregate.ts";
export {
  SOCIAL_INTEREST_COMPACT_VISIBLE,
  SOCIAL_INTEREST_MAX_FOOD,
  SOCIAL_INTEREST_MAX_GENERAL,
  SOCIAL_INTEREST_NAMESPACES,
  type SocialCompactInterestLine,
  type SocialCompactInterests,
  type SocialInterestNamespace,
  type SocialInterestRow,
  type SocialInterestTag,
  type SocialProfileInterestCategories,
  type SocialProfileInterests
} from "./types.ts";
