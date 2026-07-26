// Injectable port for turning a local file:// (or ph://, content://, etc.) URI into raw bytes.
// Kept separate from the Supabase upload adapter so: (a) production code always reads the real
// native file via expo-file-system (nativeFileBodySource.ts), and (b) a Node-based Development
// live-validation harness — which has no native file:// reader — can inject a synthetic byte
// source while still exercising the real upload adapter, real object-path construction, and real
// auth/error mapping. See MI-E-C3 report §27 for why this split exists.
export type MealPhotoFileBytes = {
  bytes: Uint8Array;
  byteSize: number;
};

export type MealPhotoFileBodySource = {
  readFileAsBytes(localImageUri: string): Promise<MealPhotoFileBytes>;
};
