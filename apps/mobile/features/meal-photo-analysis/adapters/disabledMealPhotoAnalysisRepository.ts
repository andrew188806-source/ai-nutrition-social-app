import { errAnalysis, MealPhotoAnalysisClientError, type MealPhotoAnalysisClientInput } from "../types";
import type { MealPhotoAnalysisRepository } from "../ports";

// Production-safe default: fails closed with a stable, typed error rather than silently no-opping
// or throwing an unchecked exception. Never calls the Function, never touches OpenAI.
export class DisabledMealPhotoAnalysisRepository implements MealPhotoAnalysisRepository {
  readonly source = "disabled" as const;

  async analyzeMealPhoto(_input: MealPhotoAnalysisClientInput) {
    return errAnalysis(new MealPhotoAnalysisClientError("analysis_disabled", "Meal photo analysis is disabled in this runtime."));
  }
}
