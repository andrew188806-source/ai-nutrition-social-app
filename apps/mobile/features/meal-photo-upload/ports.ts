import type { MealPhotoUploadInput, MealPhotoUploadOutcome } from "./types";

export interface MealPhotoUploadRepository {
  readonly source: "disabled" | "mock" | "supabase-live";
  uploadMealPhoto(input: MealPhotoUploadInput): Promise<MealPhotoUploadOutcome>;
  // Best-effort staging cleanup only — used for an explicit retake/replace-photo gesture, never
  // for route-unmount or any implicit "user probably abandoned this" guess. Always resolves
  // (true = deleted or already absent, false = the attempt failed) — never throws, since a
  // cleanup failure must never block the user from continuing.
  deleteMealPhotoObject(imageObjectRef: string): Promise<boolean>;
}
