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

export type MockMealPhotoUploadRepositoryOptions = {
  authPort: ConsumerAuthPort;
  fileBodySource: MealPhotoFileBodySource;
};

// In-memory stand-in for the private Storage bucket: immutable create-only writes keyed by the
// canonical object path, exactly like the real bucket's upsert:false + no-UPDATE-policy behavior.
// Reads the current actor from the same ConsumerAuthPort every other mock write repository in
// this repo uses (e.g. MockConsumerMealRecordWriteRepository), rather than a separately injected
// fixed actor id, so mock-mode actor-switch behavior matches live-mode behavior. Uses the same
// buildValidatedMealPhotoPayload single authority as the real Supabase adapter — this mock is not
// allowed its own separate MIME-trust or byte-conversion logic.
export class MockMealPhotoUploadRepository implements MealPhotoUploadRepository {
  readonly source = "mock" as const;
  private readonly objects = new Map<string, { byteSize: number; mimeType: string; uploadedAt: string }>();

  constructor(private readonly options: MockMealPhotoUploadRepositoryOptions) {}

  async uploadMealPhoto(input: MealPhotoUploadInput) {
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errUpload(new MealPhotoUploadError("authentication_required", "Meal photo upload requires an authenticated session."));
    }

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

    let payload;
    try {
      payload = buildValidatedMealPhotoPayload(rawBytes.bytes, input.candidateMimeType, input.candidateFileName);
    } catch (error) {
      if (error instanceof MealPhotoUploadError) return errUpload(error);
      return errUpload(new MealPhotoUploadError("unsupported_image_type", "Meal photo could not be validated."));
    }

    const path = buildMealPhotoAnalysisObjectPath(session.value.user.userId, input.analysisRequestId, payload.extension);
    const existing = this.objects.get(path);
    if (existing) {
      return okUpload({
        analysisRequestId: input.analysisRequestId,
        imageObjectRef: path,
        uploadedAt: existing.uploadedAt,
        byteSize: existing.byteSize,
        recovered: true
      });
    }
    const uploadedAt = new Date().toISOString();
    this.objects.set(path, { byteSize: payload.byteSize, mimeType: payload.mimeType, uploadedAt });
    return okUpload({
      analysisRequestId: input.analysisRequestId,
      imageObjectRef: path,
      uploadedAt,
      byteSize: payload.byteSize,
      recovered: false
    });
  }

  async deleteMealPhotoObject(imageObjectRef: string) {
    this.objects.delete(imageObjectRef);
    return true;
  }

  listUploadedObjectPathsForTest() {
    return [...this.objects.keys()];
  }
}
