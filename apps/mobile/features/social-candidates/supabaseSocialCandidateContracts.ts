// Minimal typed surface over supabase-js's Functions client, following the same "declare only what
// this feature actually calls" convention as supabaseMealPhotoAnalysisContracts.ts. Verified against
// the installed @supabase/supabase-js: FunctionsClient.invoke() automatically attaches the current
// session's Authorization header, so this feature never handles a JWT itself, and returns
// { data, error } where a non-2xx `error` is a FunctionsHttpError whose `.context` is the raw,
// not-yet-parsed Response.
export const SOCIAL_CANDIDATE_LIST_FUNCTION_NAME = "social-candidate-list" as const;

export type SupabaseFunctionsInvokeErrorLike = {
  name?: string;
  message?: string;
  context?: { json(): Promise<unknown> } | undefined;
};

export type SupabaseFunctionsInvokeResponseLike<T> = {
  data: T | null;
  error: SupabaseFunctionsInvokeErrorLike | null;
};

// invoke() is declared with NO options parameter. The frozen SR-2D contract rejects any meaningful
// request payload, and omitting the parameter here means Mobile cannot express an actor, candidate,
// limit, tier or clock even by mistake.
export type SupabaseSocialCandidateClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof SOCIAL_CANDIDATE_LIST_FUNCTION_NAME
    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;
  };
};
