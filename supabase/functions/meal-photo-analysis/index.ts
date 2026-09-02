import { createDefaultDependencies, processMealPhotoAnalysisRequest } from "./handler.ts";
import { buildErrorResponse } from "./errors.ts";

// MI-E-C4: Deno Edge Function entrypoint. JWT verification stays ON at the gateway (see
// supabase/config.toml's [functions.meal-photo-analysis] verify_jwt = true) — this function is
// never reached at all for a request without a valid JWT; processMealPhotoAnalysisRequest's own
// authenticateCaller call is a second, independent verification (a real Supabase Auth getUser()
// round-trip, not just trusting the gateway already checked the signature) that also resolves
// *which* user made the call.
const dependencies = createDefaultDependencies();

const demoOrigin = "https://haocu-demo.vercel.app";
const invocationHeaders = ["authorization", "apikey", "content-type", "x-client-info"];

function withBrowserCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const vary = headers.get("Vary");
  if (!vary?.split(",").some((value) => value.trim().toLowerCase() === "origin")) {
    headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
  }
  if (request.headers.get("Origin") === demoOrigin) headers.set("Access-Control-Allow-Origin", demoOrigin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

Deno.serve(async (request: Request) => {
  // Preflight is transport negotiation only. Every POST still enters the existing auth boundary.
  if (request.method === "OPTIONS") {
    const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
      .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const allowed = request.headers.get("Origin") === demoOrigin
      && request.headers.get("Access-Control-Request-Method") === "POST"
      && requestedHeaders.every((value) => invocationHeaders.includes(value));
    return withBrowserCors(request, new Response(null, {
      status: allowed ? 204 : 403,
      headers: allowed ? {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": invocationHeaders.join(", ")
      } : {}
    }));
  }
  try {
    return withBrowserCors(request, await processMealPhotoAnalysisRequest(request, dependencies));
  } catch {
    // Never leak a stack trace, raw error message, or any internal detail to the caller.
    return withBrowserCors(request, buildErrorResponse("internal_error"));
  }
});
