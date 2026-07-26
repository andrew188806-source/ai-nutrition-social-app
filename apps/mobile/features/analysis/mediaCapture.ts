import * as ImagePicker from "expo-image-picker";

// Thin wrapper around expo-image-picker: the only place in the app that talks to the
// native camera/photo-library API. Never throws — every failure mode (permission
// denied, user cancellation, unexpected native error) is a typed outcome so callers
// never need a try/catch around a native call.
export type MediaCaptureOutcome =
  // mimeType/fileName are whatever expo-image-picker's ImagePickerAsset actually reported for
  // this capture (MI-E-C3) — used downstream to resolve a trusted upload MIME type/extension.
  // Either can be null/undefined; nothing here guesses or defaults a type.
  | Readonly<{ status: "captured"; uri: string; capturedAt: string; mimeType: string | null; fileName: string | null }>
  | Readonly<{ status: "canceled" }>
  | Readonly<{ status: "permission_denied"; canAskAgain: boolean }>
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { status: "permission_denied", canAskAgain: permission.canAskAgain };
    }
    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
    return fromResult(result);
  } catch {
    return { status: "unavailable" };
  }
}
