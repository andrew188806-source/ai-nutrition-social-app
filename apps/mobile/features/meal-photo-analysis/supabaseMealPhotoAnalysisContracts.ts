// Minimal typed surface over supabase-js's Functions client — the same "declare only what this
// feature actually calls" convention as meal-photo-upload/supabaseMealPhotoStorageContracts.ts's
// SupabaseMealPhotoStorageClientLike, so this feature never depends on the full SDK's type
// surface. Verified directly against the installed @supabase/supabase-js (2.110.2) /
// @supabase/functions-js source: FunctionsClient.invoke() automatically attaches the current
// session's Authorization header (no manual header handling needed here), and returns
// { data, error } — on a non-2xx response `error` is a FunctionsHttpError whose `.context` is the
// raw, not-yet-parsed Response.
export const MEAL_PHOTO_ANALYSIS_FUNCTION_NAME = "meal-photo-analysis" as const;

export type SupabaseFunctionsInvokeErrorLike = {
  name?: string;
  message?: string;
  context?: { json(): Promise<unknown> } | undefined;
};

export type SupabaseFunctionsInvokeResponseLike<T> = {
  data: T | null;
  error: SupabaseFunctionsInvokeErrorLike | null;
};

export type SupabaseMealPhotoAnalysisClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_PHOTO_ANALYSIS_FUNCTION_NAME,
      options: { body: Record<string, unknown> }
    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;
  };
};
