export type MealBuddyCardErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "card_quota_exceeded"
  | "server_unavailable";

const STATUS: Record<MealBuddyCardErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  card_quota_exceeded: 409,
  server_unavailable: 503
};

// Deliberately opaque. A dependency failure, a missing card-reference key, a foreign card, a card
// that never existed, a reference minted for the other purpose and an internal invariant violation
// must not be distinguishable: no SQL, executor role, table name, owner, card identifier, billing
// fact or invariant detail may reach the client. In particular there is no `card_not_owned`, which
// would turn any opaque reference into an existence oracle.
const MESSAGE: Record<MealBuddyCardErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The request is invalid.",
  card_quota_exceeded: "The active Meal Buddy card limit has been reached.",
  server_unavailable: "The Meal Buddy card service is temporarily unavailable."
};

export function buildMealBuddyCardError(code: MealBuddyCardErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code],
    headers: { "content-type": "application/json" }
  });
}
