export type MealBuddyRelationshipErrorCode = "authentication_required" | "invalid_request" | "server_unavailable";

const STATUS: Record<MealBuddyRelationshipErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};
const MESSAGE: Record<MealBuddyRelationshipErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The Meal Buddy relationship action is unavailable.",
  server_unavailable: "The Meal Buddy relationship service is temporarily unavailable."
};
export function buildMealBuddyRelationshipError(code: MealBuddyRelationshipErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code], headers: { "content-type": "application/json" }
  });
}
