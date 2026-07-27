import { createDefaultDependencies, processMealPhotoAnalysisRequest } from "./handler.ts";
import { buildErrorResponse } from "./errors.ts";

// MI-E-C4: Deno Edge Function entrypoint. JWT verification stays ON at the gateway (see
// supabase/config.toml's [functions.meal-photo-analysis] verify_jwt = true) — this function is
// never reached at all for a request without a valid JWT; processMealPhotoAnalysisRequest's own
// authenticateCaller call is a second, independent verification (a real Supabase Auth getUser()
// round-trip, not just trusting the gateway already checked the signature) that also resolves
// *which* user made the call.
const dependencies = createDefaultDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processMealPhotoAnalysisRequest(request, dependencies);
  } catch {
    // Never leak a stack trace, raw error message, or any internal detail to the caller.
    return buildErrorResponse("internal_error");
  }
});
