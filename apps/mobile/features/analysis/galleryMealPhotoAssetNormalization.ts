import { File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { detectImageSignature, MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE } from "@haocu/shared";

export type GalleryMealPhotoAssetErrorCode =
  | "gallery_asset_unavailable"
  | "gallery_asset_unsupported"
  | "gallery_asset_materialization_failed"
  | "gallery_asset_normalization_failed"
  | "gallery_asset_too_large";

export type GalleryMealPhotoAssetInput = Readonly<{
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number;
  width: number;
  height: number;
}>;

export type NormalizedGalleryMealPhotoAsset = Readonly<{
  uri: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  fileName: string;
  byteSize: number;
  width: number;
  height: number;
  wasNormalized: boolean;
}>;

export type GalleryMealPhotoAssetNormalizationOutcome =
  | Readonly<{ ok: true; value: NormalizedGalleryMealPhotoAsset }>
  | Readonly<{ ok: false; errorCode: GalleryMealPhotoAssetErrorCode }>;

export type GalleryMealPhotoAssetNormalizationDependencies = Readonly<{
  readBytes(uri: string): Promise<Uint8Array>;
  transcodeToJpeg(uri: string): Promise<Readonly<{ uri: string; width: number; height: number }>>;
  deleteFile(uri: string): Promise<void>;
  cacheDirectoryUri: string;
}>;

function isWebRuntime(): boolean {
  return typeof document !== "undefined";
}

function isBrowserLocalImageUri(uri: string): boolean {
  return uri.startsWith("blob:") || /^data:image\//i.test(uri);
}

async function readBrowserLocalImageBytes(uri: string): Promise<Uint8Array> {
  if (!isBrowserLocalImageUri(uri)) {
    throw new Error("Unsupported browser-local gallery URI.");
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Browser-local gallery URI could not be read.");
  return new Uint8Array(await response.arrayBuffer());
}

function createDefaultDependencies(): GalleryMealPhotoAssetNormalizationDependencies {
  if (isWebRuntime()) {
    return {
      readBytes: readBrowserLocalImageBytes,
      async transcodeToJpeg(uri) {
        const rendered = await manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
        const bytes = await readBrowserLocalImageBytes(rendered.uri);
        const exactBytes = new Uint8Array(bytes.byteLength);
        exactBytes.set(bytes);
        const objectUri = URL.createObjectURL(new Blob([exactBytes.buffer], { type: "image/jpeg" }));
        return { uri: objectUri, width: rendered.width, height: rendered.height };
      },
      async deleteFile(uri) {
        if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
      },
      cacheDirectoryUri: "blob:"
    };
  }

  return {
    async readBytes(uri) {
      const file = new File(uri);
      if (!file.exists) throw new Error("Gallery asset is not locally readable.");
      return file.bytes();
    },
    async transcodeToJpeg(uri) {
      return manipulateAsync(uri, [], { compress: 0.9, format: SaveFormat.JPEG });
    },
    async deleteFile(uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
    cacheDirectoryUri: Paths.cache.uri
  };
}

let ownedNormalizedAsset: Readonly<{
  uri: string;
  deleteFile(uri: string): Promise<void>;
}> | null = null;

function isUsableDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function canonicalFileName(extension: "jpg" | "png" | "webp"): string {
  return `meal-photo.${extension}`;
}

function isInsideCacheDirectory(uri: string, cacheDirectoryUri: string): boolean {
  if (cacheDirectoryUri.endsWith(":")) return uri.startsWith(cacheDirectoryUri);
  const cachePrefix = cacheDirectoryUri.endsWith("/") ? cacheDirectoryUri : `${cacheDirectoryUri}/`;
  return uri.startsWith(cachePrefix);
}

function failure(errorCode: GalleryMealPhotoAssetErrorCode): GalleryMealPhotoAssetNormalizationOutcome {
  return { ok: false, errorCode };
}

async function bestEffortDelete(uri: string, dependencies: GalleryMealPhotoAssetNormalizationDependencies) {
  try {
    await dependencies.deleteFile(uri);
  } catch {
    // Local cache cleanup must never mask the safe normalization outcome.
  }
}

// Removes only the cache file created by this module. The original ImagePicker URI is never
// registered here and can therefore never be deleted by this cleanup path.
export async function releaseOwnedGalleryMealPhotoAsset(): Promise<void> {
  const owned = ownedNormalizedAsset;
  ownedNormalizedAsset = null;
  if (!owned) return;
  try {
    await owned.deleteFile(owned.uri);
  } catch {
    // App-private cache cleanup is best effort and must not block a replacement capture.
  }
}

// Canonical gallery-only boundary between ImagePicker and the analysis session. Binary bytes are
// the format authority. JPEG/PNG/WEBP keep their picker-provided local URI; HEIC/HEIF is decoded,
// orientation-normalized by Expo ImageManipulator, and re-encoded as JPEG in app-private cache.
export async function normalizeGalleryMealPhotoAsset(
  asset: GalleryMealPhotoAssetInput,
  dependencies: GalleryMealPhotoAssetNormalizationDependencies = createDefaultDependencies()
): Promise<GalleryMealPhotoAssetNormalizationOutcome> {
  if (!asset.uri || !isUsableDimension(asset.width) || !isUsableDimension(asset.height)) {
    return failure("gallery_asset_unavailable");
  }
  if (typeof asset.fileSize === "number" && asset.fileSize > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE) {
    return failure("gallery_asset_too_large");
  }

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = await dependencies.readBytes(asset.uri);
  } catch {
    return failure("gallery_asset_materialization_failed");
  }
  if (sourceBytes.byteLength > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE) {
    return failure("gallery_asset_too_large");
  }

  const sourceFormat = detectImageSignature(sourceBytes);
  if (!sourceFormat) return failure("gallery_asset_unsupported");

  if (sourceFormat.mimeType !== "image/heic") {
    const passthroughExtension =
      sourceFormat.mimeType === "image/jpeg" ? "jpg" : sourceFormat.mimeType === "image/png" ? "png" : "webp";
    return {
      ok: true,
      value: {
        uri: asset.uri,
        mimeType: sourceFormat.mimeType,
        fileName: canonicalFileName(passthroughExtension),
        byteSize: sourceBytes.byteLength,
        width: asset.width,
        height: asset.height,
        wasNormalized: false
      }
    };
  }

  let rendered: Readonly<{ uri: string; width: number; height: number }>;
  try {
    rendered = await dependencies.transcodeToJpeg(asset.uri);
  } catch {
    return failure("gallery_asset_normalization_failed");
  }

  const isPrivateCacheOutput =
    rendered.uri !== asset.uri &&
    isInsideCacheDirectory(rendered.uri, dependencies.cacheDirectoryUri) &&
    isUsableDimension(rendered.width) &&
    isUsableDimension(rendered.height);
  if (!isPrivateCacheOutput) {
    if (rendered.uri !== asset.uri) await bestEffortDelete(rendered.uri, dependencies);
    return failure("gallery_asset_normalization_failed");
  }

  let outputBytes: Uint8Array;
  try {
    outputBytes = await dependencies.readBytes(rendered.uri);
  } catch {
    await bestEffortDelete(rendered.uri, dependencies);
    return failure("gallery_asset_normalization_failed");
  }
  if (outputBytes.byteLength > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE) {
    await bestEffortDelete(rendered.uri, dependencies);
    return failure("gallery_asset_too_large");
  }
  const outputFormat = detectImageSignature(outputBytes);
  if (outputFormat?.mimeType !== "image/jpeg") {
    await bestEffortDelete(rendered.uri, dependencies);
    return failure("gallery_asset_normalization_failed");
  }

  await releaseOwnedGalleryMealPhotoAsset();
  ownedNormalizedAsset = { uri: rendered.uri, deleteFile: dependencies.deleteFile };
  return {
    ok: true,
    value: {
      uri: rendered.uri,
      mimeType: "image/jpeg",
      fileName: canonicalFileName("jpg"),
      byteSize: outputBytes.byteLength,
      width: rendered.width,
      height: rendered.height,
      wasNormalized: true
    }
  };
}
