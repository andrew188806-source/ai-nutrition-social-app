import type { MealPhotoUploadInput } from "./types";
import type { MealPhotoUploadRepository } from "./ports";

export type MealPhotoUploadServiceOptions = {
  repository: MealPhotoUploadRepository;
};

export class MealPhotoUploadService {
  constructor(private readonly options: MealPhotoUploadServiceOptions) {}

  get source() {
    return this.options.repository.source;
  }

  uploadMealPhoto(input: MealPhotoUploadInput) {
    return this.options.repository.uploadMealPhoto(input);
  }

  deleteMealPhotoObject(imageObjectRef: string) {
    return this.options.repository.deleteMealPhotoObject(imageObjectRef);
  }
}
