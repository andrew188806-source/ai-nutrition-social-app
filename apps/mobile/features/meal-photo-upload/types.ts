import type { MealPhotoCaptureMethod } from "@haocu/shared";

// MI-E-C3: local photo -> private Supabase Storage upload contract. This is a Mobile-only
// feature boundary (unlike packages/shared/src/domain/meal-photo-analysis, which is the
// future server-facing AI analysis contract) since only Mobile ever performs this upload.
export type { MealPhotoCaptureMethod };

export type SupportedMealPhotoMimeType = "image/jpeg" | "image/png" | "image/heic" | "image/webp";
export type SupportedMealPhotoExtension = "jpg" | "png" | "heic" | "webp";

// Matches the meal-analysis-photos Storage bucket's file_size_limit exactly
// (supabase/migrations/20260725030000_meal_photo_analysis_private_storage_bucket.sql).
export const MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE = 10_485_760;

export type MealPhotoUploadInput = {
  analysisRequestId: string;
  localImageUri: string;
  captureMethod: MealPhotoCaptureMethod;
  // MI-E-C3-R1: metadata HINTS only — never trusted as-is. buildValidatedMealPhotoPayload
  // (payloadValidation.ts) is the single conversion/validation authority: it reads the actual
  // file bytes, detects the real image format from binary signature (binarySignature.ts), and
  // rejects the upload if these hints disagree with what the bytes actually are.
  candidateMimeType: string | null;
  candidateFileName: string | null;
};

export type MealPhotoUploadResult = {
  analysisRequestId: string;
  // Private Storage object path only — never a public URL. See @haocu/shared's
  // buildMealPhotoAnalysisObjectPath for the canonical path shape this always matches.
  imageObjectRef: string;
  uploadedAt: string;
  byteSize: number | null;
  // true when this result came from existence-check retry recovery (object already present
  // from an earlier attempt whose response was lost) rather than a fresh upload response.
  recovered: boolean;
};

export type MealPhotoUploadErrorCode =
  | "authentication_required"
  | "unsupported_image_type"
  | "image_file_unreadable"
  | "image_too_large"
  | "image_content_type_mismatch"
  | "storage_upload_failed"
  | "meal_photo_upload_disabled";

export class MealPhotoUploadError extends Error {
  readonly code: MealPhotoUploadErrorCode;

  constructor(code: MealPhotoUploadErrorCode, message: string) {
    super(message);
    this.name = "MealPhotoUploadError";
    this.code = code;
  }
}

export type MealPhotoUploadOutcome =
  | { ok: true; value: MealPhotoUploadResult }
  | { ok: false; error: MealPhotoUploadError };

export function okUpload(value: MealPhotoUploadResult): MealPhotoUploadOutcome {
  return { ok: true, value };
}

export function errUpload(error: MealPhotoUploadError): MealPhotoUploadOutcome {
  return { ok: false, error };
}
