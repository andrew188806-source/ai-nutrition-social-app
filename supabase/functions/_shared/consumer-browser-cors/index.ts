// GQA-6R C-3: browser CORS for Consumer-facing Edge Functions, reusing the canonical allow-list policy
// proven on meal-photo-analysis (TD-20).
//
// - The permitted browser origins are the SAME configured value meal-photo-analysis already uses: the
//   canonical Consumer browser-origin allow-list (the env name records its first user). Exact origins
//   only; "*", "null", bare hosts and paths can never authorize anything; missing or empty configuration
//   authorizes NO browser origin (fail closed). See ../../meal-photo-analysis/cors.ts.
// - OPTIONS is transport negotiation only: it never reaches the function handler, never reads a body and
//   never authenticates. Every real request still passes the gateway JWT check (verify_jwt = true) and the
//   handler's own authentication; CORS only tells a browser whether it may READ the response.
// - Success, authentication failures and application errors produced by the handler all carry the same
//   headers, so a browser can read the typed error instead of seeing an opaque network failure.
// - No header value, token or body is logged.
import {
  MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV,
  isAllowedOrigin,
  parseAllowedOrigins
} from "../../meal-photo-analysis/cors.ts";

export const CONSUMER_BROWSER_ALLOWED_ORIGINS_ENV = MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV;
export const CONSUMER_BROWSER_INVOCATION_HEADERS = Object.freeze(["authorization", "apikey", "content-type", "x-client-info"]);

type EnvReader = (name: string) => string | undefined;
type Handler = (request: Request) => Promise<Response>;

function readDenoEnv(name: string): string | undefined {
  return Deno.env.get(name);
}

export function withConsumerBrowserCors(handler: Handler, readEnv: EnvReader = readDenoEnv): Handler {
  // Read on every request so a changed allow-list applies without a redeploy (same as meal-photo-analysis).
  const originAllowed = (request: Request) =>
    isAllowedOrigin(request.headers.get("Origin"), parseAllowedOrigins(readEnv(CONSUMER_BROWSER_ALLOWED_ORIGINS_ENV)));

  const decorate = (request: Request, response: Response): Response => {
    const headers = new Headers(response.headers);
    const vary = headers.get("Vary");
    if (!vary?.split(",").some((value) => value.trim().toLowerCase() === "origin")) {
      headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
    }
    if (originAllowed(request)) headers.set("Access-Control-Allow-Origin", request.headers.get("Origin") as string);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
        .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      const allowed = originAllowed(request)
        && request.headers.get("Access-Control-Request-Method") === "POST"
        && requestedHeaders.every((value) => CONSUMER_BROWSER_INVOCATION_HEADERS.includes(value));
      return decorate(request, new Response(null, {
        status: allowed ? 204 : 403,
        headers: allowed ? {
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": CONSUMER_BROWSER_INVOCATION_HEADERS.join(", ")
        } : {}
      }));
    }
    return decorate(request, await handler(request));
  };
}
