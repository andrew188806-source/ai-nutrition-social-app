import { buildMealPhotoAnalysisObjectPath, type SupportedMealPhotoExtension } from "../_shared/meal-photo-analysis/index.ts";

// MI-E-C4 §6.3: the request's imageObjectRef is a claim, not a trusted fact. This function
// re-derives the ONE path the caller is allowed to reference — {actorUid}/{analysisRequestId}/
// original.{extension} — from the server-verified actor UID and the request's own
// analysisRequestId, then requires an EXACT string match against what the caller supplied. A
// request naming a different actor's prefix, a different request-id folder, path traversal, a
// signed/public URL, or any other bucket is rejected here before Storage is ever touched.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_EXTENSIONS: readonly SupportedMealPhotoExtension[] = ["jpg", "png", "heic", "webp"];

export const MEAL_ANALYSIS_PHOTOS_BUCKET = "meal-analysis-photos" as const;

export type ObjectValidationOutcome =
  | { ok: true; value: { path: string; extension: SupportedMealPhotoExtension } }
  | { ok: false; errorCode: "invalid_image_object_ref" };

export function validateCanonicalImageObjectRef(
  actorUid: string,
  analysisRequestId: string,
  imageObjectRef: string
): ObjectValidationOutcome {
  const fail: ObjectValidationOutcome = { ok: false, errorCode: "invalid_image_object_ref" };

  if (!UUID_PATTERN.test(analysisRequestId)) return fail;

  // Reject anything that isn't a plain, relative, traversal-free bucket-object path outright —
  // never a signed URL, a public URL, or an absolute/host-qualified reference.
  if (
    imageObjectRef.includes("://") ||
    imageObjectRef.startsWith("/") ||
    imageObjectRef.includes("..") ||
    imageObjectRef.includes("?") ||
    imageObjectRef.includes("#")
  ) {
    return fail;
  }

  const segments = imageObjectRef.split("/");
  if (segments.length !== 3) return fail;
  const [actorSegment, requestIdSegment, filename] = segments;
  if (actorSegment !== actorUid) return fail;
  if (requestIdSegment !== analysisRequestId) return fail;

  const match = filename.match(/^original\.(jpg|png|heic|webp)$/);
  if (!match) return fail;
  const extension = match[1] as SupportedMealPhotoExtension;
  if (!SUPPORTED_EXTENSIONS.includes(extension)) return fail;

  const expectedPath = buildMealPhotoAnalysisObjectPath(actorUid, analysisRequestId, extension);
  if (expectedPath !== imageObjectRef) return fail;

  return { ok: true, value: { path: expectedPath, extension } };
}
