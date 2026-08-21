export type MealBuddyCandidateProfileErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "server_unavailable";

const STATUS: Record<MealBuddyCandidateProfileErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};

const MESSAGE: Record<MealBuddyCandidateProfileErrorCode, string> = {
  authentication_required: "Authentication is required.",
  // Malformed, forged, wrong-actor, expired and no-longer-public references remain indistinguishable.
  invalid_request: "The candidate profile is unavailable.",
  server_unavailable: "The candidate profile service is temporarily unavailable."
};

export function buildMealBuddyCandidateProfileError(code: MealBuddyCandidateProfileErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code],
    headers: { "content-type": "application/json" }
  });
}
