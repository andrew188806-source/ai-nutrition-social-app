export type {
  MealPhotoUploadInput,
  MealPhotoUploadResult,
  MealPhotoUploadOutcome,
  MealPhotoUploadErrorCode,
  SupportedMealPhotoMimeType,
  SupportedMealPhotoExtension
} from "./types";
export { MealPhotoUploadError, MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE } from "./types";
export { resolveMealPhotoMimeAndExtension, type ResolvedMealPhotoImageType } from "./mimeMapping";
export { detectImageSignature, type BinaryImageSignatureMatch } from "./binarySignature";
export { toExactArrayBuffer } from "./arrayBufferConversion";
export { buildValidatedMealPhotoPayload, type ValidatedMealPhotoPayload } from "./payloadValidation";
export { generateMealPhotoAnalysisRequestId } from "./requestId";
export type { MealPhotoUploadRepository } from "./ports";
export type { MealPhotoFileBodySource, MealPhotoFileBytes } from "./fileBodySource";
export { MealPhotoUploadService } from "./mealPhotoUploadService";
export {
  getMealPhotoUploadRuntimeFlags,
  type MealPhotoUploadSource,
  type MealPhotoUploadRuntimeFlags,
  type ConsumerAuthSourceLike
} from "./featureFlags";
export {
  createMealPhotoUploadRepository,
  createMealPhotoUploadService,
  type MealPhotoUploadFactoryDependencies
} from "./factories";
export {
  MEAL_ANALYSIS_PHOTOS_BUCKET,
  type SupabaseMealPhotoStorageClientLike,
  type SupabaseMealPhotoStorageBucketLike
} from "./supabaseMealPhotoStorageContracts";
