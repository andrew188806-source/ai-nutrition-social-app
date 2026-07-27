export type {
  MealPhotoAnalysisClientInput,
  MealPhotoAnalysisClientResult,
  MealPhotoAnalysisClientErrorCode,
  MealPhotoAnalysisOutcome
} from "./types";
export { MealPhotoAnalysisClientError, okAnalysis, errAnalysis } from "./types";
export type { MealPhotoAnalysisRepository } from "./ports";
export { MealPhotoAnalysisService } from "./mealPhotoAnalysisService";
export {
  getMealPhotoAnalysisRuntimeFlags,
  type MealPhotoAnalysisSource,
  type MealPhotoAnalysisRuntimeFlags
} from "./featureFlags";
export {
  createMealPhotoAnalysisRepository,
  createMealPhotoAnalysisService,
  type MealPhotoAnalysisFactoryDependencies
} from "./factories";
export {
  MEAL_PHOTO_ANALYSIS_FUNCTION_NAME,
  type SupabaseMealPhotoAnalysisClientLike
} from "./supabaseMealPhotoAnalysisContracts";
