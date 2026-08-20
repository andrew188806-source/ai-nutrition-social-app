// SR-2G-F meal/menu context authority.
//
// A composition layer only: it classifies nothing itself. The classification is decided by the
// database primitive `social_internal.canonical_meal_buddy_context_candidates`, which is where the
// canonical catalog, the candidate cards and the SR-2C-R1 food declarations actually live. This
// module turns those labels into a bucket order and hands the result to the frozen SR-2B exposure.
export {
  composeMealBuddyContextRanking,
  type MealBuddyContextRankingInput
} from "./composeContextRanking.ts";
export {
  MEAL_BUDDY_CONTEXT_POLICY_VERSION,
  MEAL_BUDDY_CONTEXT_NAMESPACE,
  MEAL_BUDDY_CONTEXT_FORBIDDEN_EVIDENCE,
  mealBuddyContextContractViolation
} from "./policy.ts";
export {
  MEAL_BUDDY_CONTEXT_STATES,
  MEAL_BUDDY_CONTEXT_BUCKET_ORDER,
  type MealBuddyContextState,
  type MealBuddyContextCandidateRow
} from "./types.ts";
