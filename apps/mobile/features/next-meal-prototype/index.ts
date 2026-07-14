export { NextMealPrototypeContent } from "./NextMealPrototypeContent";
export { createU1MockNextMealPrototypeProvider } from "./mockNextMealPrototypeProvider";
export { createCanonicalNextMealPrototypeProvider } from "./canonicalNextMealPrototypeProvider";
export { mapCanonicalToU1NextMeal } from "./mapCanonicalToU1NextMeal";
export { getNextMealCandidateCount, normalizeNextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
export type { NextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
export { presentU1NextMealResult } from "./nextMealPrototypePresenter";
export {
  buildU1NextMealBuddyPrefill,
  clearU1NextMealBuddyPrefill,
  consumeU1NextMealBuddyPrefill,
  hasPendingU1NextMealBuddyPrefill,
  stageU1NextMealBuddyPrefill
} from "./nextMealBuddyPrefill";
export type {
  U1NextMealBuddyPrefillViewModel,
  U1NextMealCandidateViewModel,
  U1NextMealPresentationSource,
  U1NextMealPrototypeProvider,
  U1NextMealPrototypeScenario,
  U1NextMealRecommendationViewModel,
  U1NextMealScreenViewModel
} from "./types";
