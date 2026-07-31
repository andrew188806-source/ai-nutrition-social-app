import * as ImagePicker from "expo-image-picker";
import {
  normalizeGalleryMealPhotoAsset,
  releaseOwnedGalleryMealPhotoAsset,
  type GalleryMealPhotoAssetErrorCode
} from "./galleryMealPhotoAssetNormalization";

// Thin wrapper around expo-image-picker: the only place in the app that talks to the
// native camera/photo-library API. Never throws — every failure mode (permission
// denied, user cancellation, unexpected native error) is a typed outcome so callers
// never need a try/catch around a native call.
export type MediaCaptureOutcome =
  // Camera metadata remains exactly what ImagePicker reported. Gallery metadata is canonicalized
  // from verified bytes by the R4 normalization boundary before it can enter the session.
  | Readonly<{ status: "captured"; uri: string; capturedAt: string; mimeType: string | null; fileName: string | null }>
  | Readonly<{ status: "canceled" }>
  | Readonly<{ status: "permission_denied"; canAskAgain: boolean }>
  | Readonly<{ status: "gallery_error"; errorCode: GalleryMealPhotoAssetErrorCode }>
  | Readonly<{ status: "unavailable" }>;

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: false,
  quality: 0.7
};

function fromResult(result: ImagePicker.ImagePickerResult): MediaCaptureOutcome {
  if (result.canceled) return { status: "canceled" };
  const asset = result.assets?.[0];
  if (!asset?.uri) return { status: "unavailable" };
  return {
    status: "captured",
    uri: asset.uri,
    capturedAt: new Date().toISOString(),
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null
  };
}

export async function captureMealPhotoFromCamera(): Promise<MediaCaptureOutcome> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { status: "permission_denied", canAskAgain: permission.canAskAgain };
    }
    const result = await ImagePicker.launchCameraAsync(pickerOptions);
    return fromResult(result);
  } catch {
    return { status: "unavailable" };
  }
}

export async function pickMealPhotoFromLibrary(): Promise<MediaCaptureOutcome> {
  try {
    // A replacement selection bounds R4-owned cache to one file per running app. This never
    // touches ImagePicker's source URI; releaseOwnedGalleryMealPhotoAsset only knows files that
    // the normalization layer itself created.
    await releaseOwnedGalleryMealPhotoAsset();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { status: "permission_denied", canAskAgain: permission.canAskAgain };
    }
    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled) return { status: "canceled" };
    const asset = result.assets?.[0];
    if (!asset?.uri) return { status: "gallery_error", errorCode: "gallery_asset_unavailable" };
    const normalized = await normalizeGalleryMealPhotoAsset(asset);
    if (!normalized.ok) return { status: "gallery_error", errorCode: normalized.errorCode };
    return {
      status: "captured",
      uri: normalized.value.uri,
      capturedAt: new Date().toISOString(),
      mimeType: normalized.value.mimeType,
      fileName: normalized.value.fileName
    };
  } catch {
    return { status: "gallery_error", errorCode: "gallery_asset_materialization_failed" };
  }
}
