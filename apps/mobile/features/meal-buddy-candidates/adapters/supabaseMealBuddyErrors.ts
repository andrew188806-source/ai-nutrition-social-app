import { MealBuddyCandidateClientError } from "../types";
import {
  KNOWN_SERVER_ERROR_CODES,
  type SupabaseFunctionsInvokeErrorLike
} from "../supabaseMealBuddyCandidateContracts";

function extractSafeErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const errorField = (body as Record<string, unknown>).error;
  if (typeof errorField !== "object" || errorField === null) return null;
  const code = (errorField as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

// One mapping shared by both Meal Buddy reads, so the card list and the candidate list cannot drift
// into different error vocabularies. An infrastructure failure is ALWAYS a typed error and is never
// converted into an empty list: collapsing it would make a transport outage indistinguishable from
// "nobody is available", which is exactly the state the product must be able to tell apart.
export async function mapInvokeErrorToClientError(
  error: SupabaseFunctionsInvokeErrorLike
): Promise<MealBuddyCandidateClientError> {
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") {
    return new MealBuddyCandidateClientError("network_error", "Could not reach the Meal Buddy service.");
  }
  if (error.name === "FunctionsHttpError" && error.context) {
    try {
      const code = extractSafeErrorCode(await error.context.json());
      if (code && (KNOWN_SERVER_ERROR_CODES as readonly string[]).includes(code)) {
        return new MealBuddyCandidateClientError(
          code as "authentication_required" | "invalid_request" | "server_unavailable",
          "The Meal Buddy service returned an error."
        );
      }
    } catch {
      // Fall through to internal_error — never surface a raw parse failure.
    }
  }
  return new MealBuddyCandidateClientError("internal_error", "The Meal Buddy service returned an unexpected error.");
}
