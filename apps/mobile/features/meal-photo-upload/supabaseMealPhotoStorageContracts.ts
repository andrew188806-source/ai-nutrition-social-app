// Minimal typed surface over supabase-js's Storage client — the same "declare only what this
// feature actually calls" convention as consumer-meals/supabaseMealContracts.ts's
// SupabaseConsumerMealClientLike, so this feature never depends on the full SDK's type surface.
export const MEAL_ANALYSIS_PHOTOS_BUCKET = "meal-analysis-photos" as const;

export type SupabaseStorageErrorLike = {
  message?: string | null;
  statusCode?: string | null;
  status?: number | null;
};

export type SupabaseStorageUploadResponseLike = {
  data: { path: string } | null;
  error: SupabaseStorageErrorLike | null;
};

export type SupabaseStorageListEntryLike = {
  name: string;
  // Present when the storage backend actually reports it (not guaranteed by every SDK/backend
  // combination) — used only as an additional duplicate-recovery sanity check, never as a
  // substitute for real server-side content verification (see the Supabase adapter's comments).
  metadata?: { size?: number; mimetype?: string } | null;
};

export type SupabaseStorageListResponseLike = {
  data: SupabaseStorageListEntryLike[] | null;
  error: SupabaseStorageErrorLike | null;
};

export type SupabaseStorageRemoveResponseLike = {
  data: unknown;
  error: SupabaseStorageErrorLike | null;
};

export type SupabaseMealPhotoStorageBucketLike = {
  // MI-E-C3-R1: body is ArrayBuffer only — a Uint8Array view must never be passed directly (see
  // arrayBufferConversion.ts's toExactArrayBuffer). This type is what enforces that at compile
  // time: passing a Uint8Array here is a type error, not just a convention.
  upload(
    path: string,
    body: ArrayBuffer,
    options: { contentType: string; upsert: boolean }
  ): Promise<SupabaseStorageUploadResponseLike>;
  list(path: string, options?: { search?: string }): Promise<SupabaseStorageListResponseLike>;
  remove(paths: string[]): Promise<SupabaseStorageRemoveResponseLike>;
};

export type SupabaseMealPhotoStorageClientLike = {
  storage: {
    from(bucket: typeof MEAL_ANALYSIS_PHOTOS_BUCKET): SupabaseMealPhotoStorageBucketLike;
  };
};
