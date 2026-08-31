import { File } from "expo-file-system";
import { MealPhotoUploadError } from "./types";
import type { MealPhotoFileBodySource } from "./fileBodySource";

function isWebRuntime(): boolean {
  return typeof document !== "undefined";
}

function isBrowserLocalImageUri(uri: string): boolean {
  return uri.startsWith("blob:") || /^data:image\//i.test(uri);
}

async function readBrowserLocalImageBytes(uri: string): Promise<Uint8Array> {
  if (!isBrowserLocalImageUri(uri)) {
    throw new Error("Unsupported browser-local meal photo URI.");
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Browser-local meal photo URI could not be read.");
  return new Uint8Array(await response.arrayBuffer());
}

// The only place in this feature that touches the native file system. Reads the whole file into
// a Uint8Array in one call and returns it — nothing is ever staged through a base64 string held
// in React state, written to a database, logged, or persisted beyond the single upload call that
// consumes it.
export const expoFileSystemMealPhotoFileBodySource: MealPhotoFileBodySource = {
  async readFileAsBytes(localImageUri: string) {
    if (isWebRuntime()) {
      try {
        const bytes = await readBrowserLocalImageBytes(localImageUri);
        return { bytes, byteSize: bytes.byteLength };
      } catch {
        throw new MealPhotoUploadError("image_file_unreadable", "Local meal photo file could not be read.");
      }
    }

    let file: File;
    try {
      file = new File(localImageUri);
    } catch {
      throw new MealPhotoUploadError("image_file_unreadable", "Local meal photo URI could not be opened.");
    }
    if (!file.exists) {
      throw new MealPhotoUploadError("image_file_unreadable", "Local meal photo file does not exist.");
    }
    try {
      const bytes = await file.bytes();
      return { bytes, byteSize: bytes.byteLength };
    } catch {
      throw new MealPhotoUploadError("image_file_unreadable", "Local meal photo file could not be read.");
    }
  }
};
