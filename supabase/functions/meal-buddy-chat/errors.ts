export type MealBuddyChatErrorCode = "authentication_required" | "invalid_request" | "server_unavailable";
const STATUS: Record<MealBuddyChatErrorCode, number> = { authentication_required: 401, invalid_request: 400, server_unavailable: 503 };
const MESSAGE: Record<MealBuddyChatErrorCode, string> = { authentication_required: "Authentication is required.", invalid_request: "The Meal Buddy chat action is unavailable.", server_unavailable: "The Meal Buddy chat service is temporarily unavailable." };
export function buildMealBuddyChatError(code: MealBuddyChatErrorCode): Response { return new Response(JSON.stringify({ error: { code, message: MESSAGE[code] } }), { status: STATUS[code], headers: { "content-type": "application/json" } }); }
