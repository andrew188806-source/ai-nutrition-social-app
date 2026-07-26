import type { SupportedMealPhotoExtension, SupportedMealPhotoMimeType } from "./types";

const MIME_TO_EXTENSION: Record<SupportedMealPhotoMimeType, SupportedMealPhotoExtension> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp"
};

// Filename-extension fallback is only trusted when the capture result gave us no MIME at all.
// ".jpg" and ".jpeg" both canonicalize to the same image/jpeg + "jpg" pair.
const EXTENSION_TO_MIME: Record<string, SupportedMealPhotoMimeType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp"
};

export type ResolvedMealPhotoImageType = {
  mimeType: SupportedMealPhotoMimeType;
  extension: SupportedMealPhotoExtension;
};

// Trusts the capture result's own MIME type first (the real format), and only falls back to a
// filename extension when no MIME was provided at all. Never trusts a filename extension over a
// present-but-different MIME type. Returns null (fail closed) for anything unrecognized —
// callers must map that to the unsupported_image_type error, never guess or default to JPEG.
export function resolveMealPhotoMimeAndExtension(
  candidateMimeType: string | null,
  candidateFileName: string | null
): ResolvedMealPhotoImageType | null {
  const normalizedMime = candidateMimeType?.trim().toLowerCase() ?? null;
  if (normalizedMime) {
    const extension = MIME_TO_EXTENSION[normalizedMime as SupportedMealPhotoMimeType];
    if (!extension) return null;
    return { mimeType: normalizedMime as SupportedMealPhotoMimeType, extension };
  }
  const fileExtension = candidateFileName?.trim().toLowerCase().split(".").pop() ?? null;
  if (!fileExtension) return null;
  const mimeType = EXTENSION_TO_MIME[fileExtension];
  if (!mimeType) return null;
  return { mimeType, extension: MIME_TO_EXTENSION[mimeType] };
}
