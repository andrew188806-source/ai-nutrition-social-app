import { toExactArrayBuffer } from "./arrayBufferConversion";
import { detectImageSignature } from "./binarySignature";
import { resolveMealPhotoMimeAndExtension } from "./mimeMapping";
import { MealPhotoUploadError, type SupportedMealPhotoExtension, type SupportedMealPhotoMimeType } from "./types";

export type ValidatedMealPhotoPayload = {
  arrayBuffer: ArrayBuffer;
  byteSize: number;
  mimeType: SupportedMealPhotoMimeType;
  extension: SupportedMealPhotoExtension;
};

// MI-E-C3-R1: the single conversion/validation authority for this feature. Both the mock and
// Supabase adapters call this — neither adapter is allowed to do its own Uint8Array->ArrayBuffer
// conversion or its own MIME trust decision, so there is exactly one place this logic can drift.
//
// Reconciliation rules (in order):
//   1. The binary signature (detectImageSignature) is the final authority on what format this
//      file actually is. An unrecognizable/truncated/empty signature always fails closed with
//      unsupported_image_type, regardless of what the caller claimed.
//   2. If the caller supplied a MIME type and/or filename hint, it must resolve to the SAME
//      format the binary signature detected. A caller-supplied hint that is missing, unresolvable,
//      or names a different format than the actual bytes fails closed with
//      image_content_type_mismatch — the bytes are never uploaded "because the caller said so".
//   3. If the caller supplied no hint at all (both null), the binary signature alone is sufficient
//      — there is nothing to reconcile against.
export function buildValidatedMealPhotoPayload(
  bytes: Uint8Array,
  candidateMimeType: string | null,
  candidateFileName: string | null
): ValidatedMealPhotoPayload {
  if (bytes.byteLength === 0) {
    throw new MealPhotoUploadError("unsupported_image_type", "Local meal photo file is empty.");
  }
  const detected = detectImageSignature(bytes);
  if (!detected) {
    throw new MealPhotoUploadError(
      "unsupported_image_type",
      "Local meal photo binary signature is not a supported image format."
    );
  }
  const suppliedHintPresent = Boolean(candidateMimeType) || Boolean(candidateFileName);
  if (suppliedHintPresent) {
    const hint = resolveMealPhotoMimeAndExtension(candidateMimeType, candidateFileName);
    if (!hint || hint.mimeType !== detected.mimeType) {
      throw new MealPhotoUploadError(
        "image_content_type_mismatch",
        "Supplied MIME type/filename does not match the photo's actual binary content."
      );
    }
  }
  return {
    arrayBuffer: toExactArrayBuffer(bytes),
    byteSize: bytes.byteLength,
    mimeType: detected.mimeType,
    extension: detected.extension
  };
}
