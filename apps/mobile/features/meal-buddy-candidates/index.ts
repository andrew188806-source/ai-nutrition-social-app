// SR-2G-E1 real Meal Buddy candidate data layer.
//
// Deliberately isolated from the Meal Buddy demo: this barrel exports no candidate mock, no
// client-side ranking, no client-side exposure cap, no invite/match/chat action state and no
// profile-detail navigation, and the feature imports none of mealBuddyCardMock, mealBuddyRanking,
// mealBuddySocialStore, mealBuddyFlowMock or the DEMO_ONLY community profile resolver.
//
// It is a data layer only. SR-2G-E2 owns the screen integration; nothing here renders.
export type {
  MealBuddyCandidate,
  MealBuddyCandidateListResult,
  MealBuddyCandidateOutcome,
  MealBuddyCandidateClientErrorCode,
  MealBuddySourceCard,
  MealBuddySourceCardOutcome
} from "./types";
export {
  MealBuddyCandidateClientError,
  okCandidates,
  errCandidates,
  okSourceCards,
  errSourceCards
} from "./types";
export type { MealBuddyCandidateRepository, MealBuddySourceCardRepository } from "./ports";
export { MealBuddyCandidateService } from "./mealBuddyCandidateService";
export {
  getMealBuddyCandidateRuntimeFlags,
  type MealBuddyCandidateSource,
  type MealBuddyCandidateRuntimeFlags
} from "./featureFlags";
export {
  createMealBuddyCandidateRepository,
  createMealBuddySourceCardRepository,
  createMealBuddyCandidateService,
  type MealBuddyCandidateFactoryDependencies
} from "./factories";
export {
  MEAL_BUDDY_CARD_LIST_FUNCTION_NAME,
  MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME,
  type SupabaseMealBuddyClientLike
} from "./supabaseMealBuddyCandidateContracts";
export {
  bindMealBuddyCandidateRuntimeDependencies,
  clearMealBuddyCandidateRuntimeDependencies,
  getMealBuddyCandidateRuntimeDependencies
} from "./runtimeBinding";
export {
  buildCompactInterestLine,
  loadInterestCategoryLabels,
  resolveInterestCategoryLabel,
  INTEREST_CATALOG_DEFAULT_LOCALE,
  INTEREST_CATALOG_LABEL_TABLE,
  type CompactInterestLine,
  type InterestCategoryLabels,
  type InterestCatalogOutcome,
  type SupabaseInterestCatalogClientLike
} from "./interestCatalog";
export {
  mealBuddyTaipeiDateKey,
  MEAL_BUDDY_DINING_DATE_TIME_ZONE
} from "./taipeiDiningDate";
