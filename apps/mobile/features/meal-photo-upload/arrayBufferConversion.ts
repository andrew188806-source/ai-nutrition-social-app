import { MealPhotoUploadError } from "./types";

// expo-file-system's File.bytes() (nativeFileBodySource.ts) returns a Uint8Array. Supabase
// Storage's upload() must receive the *exact* bytes of the photo as an ArrayBuffer — passing
// bytes.buffer directly would be wrong whenever byteOffset > 0 or byteLength < buffer.byteLength
// (e.g. a Uint8Array produced via .subarray()), silently including extra bytes before/after the
// intended view. This is the single place in the feature allowed to convert Uint8Array -> ArrayBuffer.
export function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer;
  if (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) {
    // Slicing a SharedArrayBuffer returns another SharedArrayBuffer, which is not a valid Storage
    // upload body. This never happens with expo-file-system's File.bytes() in practice (always
    // backed by a plain ArrayBuffer), but this fails loudly rather than mis-typing the value.
    throw new MealPhotoUploadError(
      "image_file_unreadable",
      "Local meal photo bytes are backed by a SharedArrayBuffer, which cannot be uploaded."
    );
  }
  // buffer is provably a plain ArrayBuffer here (the only other member of ArrayBufferLike was
  // just excluded above), so slice()'s return value genuinely is an ArrayBuffer — this cast
  // reflects that proof, it does not paper over an unchecked assumption. slice(start, end) always
  // returns a *new* buffer scoped to exactly [start, end), so this is correct regardless of
  // byteOffset/byteLength, unlike passing bytes.buffer directly.
  return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
