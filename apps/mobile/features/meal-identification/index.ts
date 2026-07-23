export { adaptRestaurantCatalogCandidates } from "./catalogCandidateAdapter";
export {
  resolveCatalogMealCandidates,
  type MealIdentificationCandidateQuery
} from "./candidateResolver";
export {
  createPersonalUnresolvedCandidate,
  isSameCatalogCandidate,
  toTrustedCanonicalIdentity
} from "./sourceResolutionPolicy";
export type {
  CatalogMealCandidateIdentity,
  CatalogMealIdentificationCandidate,
  MealIdentificationCandidate,
  MealIdentificationCandidateResolution,
  MealIdentificationNutritionProvenance,
  MealIdentificationTrustedIdentity,
  MealSourceContext,
  PersonalUnresolvedMealCandidate,
  PersonalUnresolvedMealIdentity,
  PersonalUnresolvedReason
} from "./types";
