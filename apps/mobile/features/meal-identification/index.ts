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
export {
  buildMealIdentificationFinalization,
  MEAL_IDENTIFICATION_FINALIZATION_VERSION,
  projectMealIdentificationFinalizationToMealWrite,
  validateMealIdentificationFinalizationCommand
} from "./finalizationContract";
export type {
  MealIdentificationCatalogSelectionInput,
  MealIdentificationConfirmedCatalogSelection,
  MealIdentificationCorrectionEvent,
  MealIdentificationCorrectionEventInput,
  MealIdentificationFinalizationCommand,
  MealIdentificationFinalizationError,
  MealIdentificationFinalizationErrorCode,
  MealIdentificationFinalizationInput,
  MealIdentificationFinalizationResult,
  MealIdentificationFinalSelection,
  MealIdentificationFinalSelectionInput,
  MealIdentificationFinalizationVersion,
  MealIdentificationMealWriteProjectionInput,
  MealIdentificationOriginalAnalysisSnapshot,
  MealIdentificationPersonalUnresolvedSelection,
  MealIdentificationUnresolvedSelectionInput
} from "./finalizationContract";
export type {
  CatalogMealCandidateIdentity,
  CatalogMealIdentificationCandidate,
  MealIdentificationCandidate,
  MealIdentificationCandidateResolution,
  MealIdentificationNutritionProvenance,
  MealIdentificationTrustedIdentity,
  LegacyMealSourceContext,
  MealOccurrenceTimestamp,
  MealRecordTiming,
  MealSourceContext,
  PersonalUnresolvedMealCandidate,
  PersonalUnresolvedMealIdentity,
  PersonalUnresolvedReason
} from "./types";
