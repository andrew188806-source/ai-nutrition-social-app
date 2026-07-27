import type { MealPhotoAnalysisClientInput, MealPhotoAnalysisOutcome } from "./types";

export interface MealPhotoAnalysisRepository {
  readonly source: "disabled" | "mock" | "supabase-live";
  analyzeMealPhoto(input: MealPhotoAnalysisClientInput): Promise<MealPhotoAnalysisOutcome>;
}
