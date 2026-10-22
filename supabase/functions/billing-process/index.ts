import {
  createDefaultBillingProcessDependencies,
  processBillingProcessRequest
} from "./handler.ts";

// Composition only: nothing is read from the environment and no connection is made until a request arrives.
const dependencies = createDefaultBillingProcessDependencies();
Deno.serve(async (request: Request) => {
  try { return await processBillingProcessRequest(request, dependencies); }
  catch {
    return new Response(JSON.stringify({ status: "unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
