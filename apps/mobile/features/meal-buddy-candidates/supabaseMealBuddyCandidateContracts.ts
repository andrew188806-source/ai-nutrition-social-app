// Minimal typed surface over supabase-js's Functions client, following the same "declare only what
// this feature actually calls" convention as supabaseSocialCandidateContracts.ts. Verified against
// the installed @supabase/supabase-js: FunctionsClient.invoke() automatically attaches the current
// session's Authorization header, so this feature never handles a JWT itself, and returns
// { data, error } where a non-2xx `error` is a FunctionsHttpError whose `.context` is the raw,
// not-yet-parsed Response.
import type { MealBuddyCandidateListRequest } from "@haocu/shared";

export const MEAL_BUDDY_CARD_LIST_FUNCTION_NAME = "meal-buddy-card-list" as const;
export const MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME = "meal-buddy-candidate-list" as const;

export type SupabaseFunctionsInvokeErrorLike = {
  name?: string;
  message?: string;
  context?: { json(): Promise<unknown> } | undefined;
};

export type SupabaseFunctionsInvokeResponseLike<T> = {
  data: T | null;
  error: SupabaseFunctionsInvokeErrorLike | null;
};

// The card list takes an empty body and the candidate list takes EXACTLY one opaque source
// reference. Both signatures are declared literally, so Mobile cannot express an actor, candidate,
// limit, page, tier, clock or eligibility field even by mistake: there is no parameter to put one in.
export type SupabaseMealBuddyClientLike = {
  functions: {
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_CARD_LIST_FUNCTION_NAME,
      options: { body: Record<string, never> }
    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;
    invoke<T = unknown>(
      functionName: typeof MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME,
      options: { body: MealBuddyCandidateListRequest }
    ): Promise<SupabaseFunctionsInvokeResponseLike<T>>;
  };
};

// The frozen SR-2G-B / SR-2G-D error vocabulary. Anything outside it collapses to internal_error
// rather than reaching a user, so a raw body, SQL fragment, role name or stack can never surface.
export const KNOWN_SERVER_ERROR_CODES = Object.freeze([
  "authentication_required",
  "invalid_request",
  "server_unavailable"
] as const);
