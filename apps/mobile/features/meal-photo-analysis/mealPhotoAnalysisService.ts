import type { MealPhotoAnalysisClientInput } from "./types";
import type { MealPhotoAnalysisRepository } from "./ports";

export type MealPhotoAnalysisServiceOptions = {
  repository: MealPhotoAnalysisRepository;
};

export class MealPhotoAnalysisService {
  constructor(private readonly options: MealPhotoAnalysisServiceOptions) {}

  get source() {
    return this.options.repository.source;
  }

  analyzeMealPhoto(input: MealPhotoAnalysisClientInput) {
    return this.options.repository.analyzeMealPhoto(input);
  }
}
