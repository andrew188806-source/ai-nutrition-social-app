import {
  createDefaultBillingLinkDependencies,
  processBillingLinkRequest
} from "./handler.ts";

// Composition only: nothing is read from the environment, no platform client is created and no connection is made until a request arrives.
const dependencies = createDefaultBillingLinkDependencies();
Deno.serve(async (request: Request) => {
  try { return await processBillingLinkRequest(request, dependencies); }
  catch {
    return new Response(JSON.stringify({ status: "unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
