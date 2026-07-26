import { buildMealPhotoAnalysisObjectPath } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { buildValidatedMealPhotoPayload } from "../payloadValidation";
import {
  errUpload,
  okUpload,
  MealPhotoUploadError,
  MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE,
  type MealPhotoUploadInput
} from "../types";
import type { MealPhotoUploadRepository } from "../ports";
import type { MealPhotoFileBodySource } from "../fileBodySource";
import {
  MEAL_ANALYSIS_PHOTOS_BUCKET,
  type SupabaseMealPhotoStorageClientLike,
  type SupabaseStorageErrorLike
} from "../supabaseMealPhotoStorageContracts";

export type SupabaseMealPhotoUploadRepositoryOptions = {
  authPort: ConsumerAuthPort;
  storageClient: SupabaseMealPhotoStorageClientLike;
  fileBodySource: MealPhotoFileBodySource;
  uploadEnabled: boolean;
};

export class SupabaseMealPhotoUploadRepository implements MealPhotoUploadRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseMealPhotoUploadRepositoryOptions) {}

  async uploadMealPhoto(input: MealPhotoUploadInput) {
    if (!this.options.uploadEnabled) {
      return errUpload(new MealPhotoUploadError("meal_photo_upload_disabled", "Meal photo upload is disabled in this runtime."));
    }

    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok) {
      return errUpload(new MealPhotoUploadError("authentication_required", "Meal photo upload requires a current authenticated session."));
    }
    if (!session.value) {
      return errUpload(new MealPhotoUploadError("authentication_required", "Meal photo upload requires an authenticated session."));
    }
    // Only the server-verified session UID is ever used to build the object path. Nothing in
    // MealPhotoUploadInput can substitute for it — there is no user-id field on that type.
    const userId = session.value.user.userId;

    let rawBytes: { bytes: Uint8Array; byteSize: number };
    try {
      rawBytes = await this.options.fileBodySource.readFileAsBytes(input.localImageUri);
    } catch (error) {
      if (error instanceof MealPhotoUploadError) return errUpload(error);
      return errUpload(new MealPhotoUploadError("image_file_unreadable", "Local meal photo file could not be read."));
    }
    if (rawBytes.byteSize > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE) {
      return errUpload(new MealPhotoUploadError("image_too_large", "Meal photo exceeds the 10MB upload limit."));
    }

    // Single conversion/validation authority: detects the real format from binary signature,
    // reconciles it against the caller's MIME/filename hints (fail closed on any mismatch), and
    // produces the exact ArrayBuffer this call uploads — never a raw Uint8Array/its .buffer.
    let payload;
    try {
      payload = buildValidatedMealPhotoPayload(rawBytes.bytes, input.candidateMimeType, input.candidateFileName);
    } catch (error) {
      if (error instanceof MealPhotoUploadError) return errUpload(error);
      return errUpload(new MealPhotoUploadError("unsupported_image_type", "Meal photo could not be validated."));
    }

    const path = buildMealPhotoAnalysisObjectPath(userId, input.analysisRequestId, payload.extension);
    const bucket = this.options.storageClient.storage.from(MEAL_ANALYSIS_PHOTOS_BUCKET);

    const uploadResponse = await bucket.upload(path, payload.arrayBuffer, { contentType: payload.mimeType, upsert: false });
    if (!uploadResponse.error) {
      return okUpload({
        analysisRequestId: input.analysisRequestId,
        imageObjectRef: path,
        uploadedAt: new Date().toISOString(),
        byteSize: payload.byteSize,
        recovered: false
      });
    }

    if (isDuplicateObjectError(uploadResponse.error)) {
      // The bucket has no UPDATE policy and this call always used upsert:false, so a duplicate
      // conflict here means an earlier attempt already wrote this exact object — most likely a
      // retry after this client lost the original response (timeout/dropped connection). Confirm
      // precisely rather than assuming success from "something exists in the folder": the path's
      // own bucket/actor-prefix/analysisRequestId-folder/canonical-filename all already come from
      // this call's own inputs (not guessed), so what remains to verify is that the folder
      // listing contains EXACTLY this one object, under this exact filename, and — when the SDK
      // actually returns object metadata — that its reported size/MIME agree with this call's own
      // validated payload. A future Edge Function remains responsible for real content-hash
      // (SHA-256) verification; no client-side hash is fabricated here.
      const folder = path.slice(0, path.lastIndexOf("/"));
      const filename = path.slice(path.lastIndexOf("/") + 1);
      const listResponse = await bucket.list(folder);
      const matches = listResponse.error ? [] : (listResponse.data ?? []).filter((entry) => entry.name === filename);
      const exactlyOneMatch = matches.length === 1 && (listResponse.data?.length ?? 0) === 1;
      if (exactlyOneMatch) {
        const metadata = matches[0].metadata;
        if (metadata && typeof metadata.size === "number" && metadata.size !== payload.byteSize) {
          return errUpload(new MealPhotoUploadError("storage_upload_failed", "Existing object's reported size does not match this upload's validated payload."));
        }
        if (metadata?.mimetype && metadata.mimetype !== payload.mimeType) {
          return errUpload(new MealPhotoUploadError("storage_upload_failed", "Existing object's reported MIME type does not match this upload's validated payload."));
        }
        return okUpload({
          analysisRequestId: input.analysisRequestId,
          imageObjectRef: path,
          uploadedAt: new Date().toISOString(),
          byteSize: payload.byteSize,
          recovered: true
        });
      }
      return errUpload(new MealPhotoUploadError("storage_upload_failed", "Meal photo upload could not be verified after a duplicate-object response."));
    }

    return errUpload(new MealPhotoUploadError("storage_upload_failed", "Meal photo upload failed."));
  }

  async deleteMealPhotoObject(imageObjectRef: string): Promise<boolean> {
    if (!this.options.uploadEnabled) return false;
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) return false;
    // Sanity check only — the real security boundary is Storage RLS (DELETE goes through this
    // actor's own authenticated request, never a service-role bypass), which will fail closed on
    // any path this actor doesn't own regardless of this check.
    if (!imageObjectRef.startsWith(`${session.value.user.userId}/`)) return false;
    try {
      const response = await this.options.storageClient.storage.from(MEAL_ANALYSIS_PHOTOS_BUCKET).remove([imageObjectRef]);
      return !response.error;
    } catch {
      return false;
    }
  }
}

function isDuplicateObjectError(error: SupabaseStorageErrorLike): boolean {
  const message = error.message?.toLowerCase() ?? "";
  return error.statusCode === "409" || error.status === 409 || message.includes("already exists") || message.includes("duplicate");
}
