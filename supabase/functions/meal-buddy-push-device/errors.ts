export type MealBuddyPushDeviceErrorCode = "authentication_required" | "invalid_request" | "server_unavailable";

const STATUS: Record<MealBuddyPushDeviceErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};
// Deliberately uniform and uninformative. No provider verdict, no device state and no hint about
// whether a given installation or token exists reaches the caller.
const MESSAGE: Record<MealBuddyPushDeviceErrorCode, string> = {
  authentication_required: "Authentication is required.",
  invalid_request: "The Meal Buddy push registration is unavailable.",
  server_unavailable: "The Meal Buddy push registration service is temporarily unavailable."
};
export function buildMealBuddyPushDeviceError(code: MealBuddyPushDeviceErrorCode): Response {
  return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), {
    status: STATUS[code], headers: { "content-type": "application/json" }
  });
}
