import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE,
  detectImageSignature,
  sha256Hex,
  type SupportedMealPhotoExtension,
  type SupportedMealPhotoMimeType
} from "../_shared/meal-photo-analysis/index.ts";
import { MEAL_ANALYSIS_PHOTOS_BUCKET } from "./objectValidation.ts";

// MI-E-C4 §7: never trusts Mobile's own upload-time metadata as final security/content authority.
// Downloads via the USER-scoped client (Storage RLS still enforces ownership — see auth.ts) and
// independently re-verifies everything: existence, size, binary signature, and that the signature
// agrees with both the path's own extension and (when the Storage backend reports one) the
// stored MIME type. Uses the exact same detectImageSignature this repo's Mobile upload path uses
// (packages/shared), not a second hand-maintained copy.
export type DownloadedImage = {
  bytes: Uint8Array;
  byteSize: number;
  mimeType: SupportedMealPhotoMimeType;
  extension: SupportedMealPhotoExtension;
  sha256: string;
};

export type ImageDownloadErrorCode =
  | "image_object_not_found"
  | "image_object_access_denied"
  | "unsupported_image_type"
  | "image_too_large";

export type ImageDownloadOutcome =
  | { ok: true; value: DownloadedImage }
  | { ok: false; errorCode: ImageDownloadErrorCode };

export async function downloadAndValidateImage(
  userScopedClient: SupabaseClient,
  path: string,
  expectedExtension: SupportedMealPhotoExtension
): Promise<ImageDownloadOutcome> {
  const { data, error } = await userScopedClient.storage.from(MEAL_ANALYSIS_PHOTOS_BUCKET).download(path);
  if (error || !data) {
    // This function already required the path's actor segment to equal the caller's own
    // server-verified UID (objectValidation.ts) before ever reaching here, so a download failure
    // for this caller's own path is honestly reported as "not found" rather than guessing
    // "access denied" — the ownership question was already answered, favorably, upstream.
    return { ok: false, errorCode: "image_object_not_found" };
  }

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (bytes.byteLength === 0) return { ok: false, errorCode: "unsupported_image_type" };
  if (bytes.byteLength > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE) return { ok: false, errorCode: "image_too_large" };

  const detected = detectImageSignature(bytes);
  if (!detected) return { ok: false, errorCode: "unsupported_image_type" };
  if (detected.extension !== expectedExtension) return { ok: false, errorCode: "unsupported_image_type" };

  const storageReportedMime = typeof data.type === "string" && data.type.length > 0 ? data.type : null;
  if (storageReportedMime && storageReportedMime !== detected.mimeType) {
    return { ok: false, errorCode: "unsupported_image_type" };
  }

  const sha256 = await sha256Hex(bytes);

  return {
    ok: true,
    value: { bytes, byteSize: bytes.byteLength, mimeType: detected.mimeType, extension: detected.extension, sha256 }
  };
}
