export type MealBuddyCandidateListErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "server_unavailable";

const STATUS: Record<MealBuddyCandidateListErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};

// Deliberately opaque. A malformed reference, a reference minted for the other purpose, another
// actor's reference, an expired reference, a card that never existed and a card owned by somebody
// else must all be one indistinguishable answer: any finer code would turn an opaque reference into
// an existence or ownership oracle. No SQL, executor role, table name, owner, card identifier,
// candidate identifier, entitlement fact or invariant detail may reach the client.
const MESSAGE: Record<MealBuddyCandidateListErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The request is invalid.",
  server_unavailable: "The Meal Buddy candidate service is temporarily unavailable."
};

export function buildMealBuddyCandidateListError(code: MealBuddyCandidateListErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code],
    headers: { "content-type": "application/json" }
  });
}
