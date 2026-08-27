export type NextMealGeoErrorCode = "authentication_required" | "invalid_request" | "server_unavailable";

const STATUS: Record<NextMealGeoErrorCode, number> = {
  authentication_required: 401,
  invalid_request: 400,
  server_unavailable: 503
};

export function buildNextMealGeoError(code: NextMealGeoErrorCode): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status: STATUS[code],
    headers: { "content-type": "application/json" }
  });
}
