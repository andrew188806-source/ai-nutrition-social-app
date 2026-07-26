import type { SupportedMealPhotoExtension, SupportedMealPhotoMimeType } from "./types";

// MI-E-C3-R1: the real, final authority on what image format a file actually is. Mobile-supplied
// MIME type and filename extension are only ever hints (see MealPhotoUploadInput) — an upload's
// canonical mimeType/extension always comes from here, never from what the caller claimed.
export type BinaryImageSignatureMatch = {
  mimeType: SupportedMealPhotoMimeType;
  extension: SupportedMealPhotoExtension;
};

// ISO Base Media File Format ("ftyp" box) brands this repo accepts as HEIC/HEIF. Deliberately a
// narrow allow-list — only brands actually evaluated and intended to be accepted, not "any brand
// that looks plausible". heic/heix/hevc/hevx are HEIC (single/sequence, with/without range
// extension); mif1/msf1 are the generic HEIF still-image/sequence brands Apple's camera pipeline
// also produces for photos. Canonicalized to a single "heic" extension/MIME regardless of which
// of these six brands matched — the bucket's allowed_mime_types only lists image/heic, and this
// repo does not need to distinguish the brands downstream of upload.
const ACCEPTED_HEIC_HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function bytesToAscii(bytes: Uint8Array, start: number, length: number): string {
  let result = "";
  for (let i = start; i < start + length; i += 1) result += String.fromCharCode(bytes[i]);
  return result;
}

// Reads only the magic-byte header of each format — never trusts a MIME string or filename
// extension. Returns null (fail closed) for anything unrecognized, truncated, or empty.
export function detectImageSignature(bytes: Uint8Array): BinaryImageSignatureMatch | null {
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (bytes.byteLength >= 12 && bytesToAscii(bytes, 0, 4) === "RIFF" && bytesToAscii(bytes, 8, 4) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  if (bytes.byteLength >= 12 && bytesToAscii(bytes, 4, 4) === "ftyp") {
    const brand = bytesToAscii(bytes, 8, 4).toLowerCase().trim();
    if (ACCEPTED_HEIC_HEIF_BRANDS.has(brand)) {
      return { mimeType: "image/heic", extension: "heic" };
    }
    return null;
  }
  return null;
}
