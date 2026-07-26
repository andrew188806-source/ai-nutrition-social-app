import { errUpload, MealPhotoUploadError, type MealPhotoUploadInput } from "../types";
import type { MealPhotoUploadRepository } from "../ports";

// Production-safe default: fails closed with a stable, typed error rather than silently
// no-opping or throwing an unchecked exception.
export class DisabledMealPhotoUploadRepository implements MealPhotoUploadRepository {
  readonly source = "disabled" as const;

  async uploadMealPhoto(_input: MealPhotoUploadInput) {
    return errUpload(
      new MealPhotoUploadError("meal_photo_upload_disabled", "Meal photo upload is disabled in this runtime.")
    );
  }

  async deleteMealPhotoObject(_imageObjectRef: string) {
    return false;
  }
}
