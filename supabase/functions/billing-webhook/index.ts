import {
  createDefaultBillingWebhookDependencies,
  processBillingWebhookRequest
} from "./handler.ts";

// Composition only: nothing is read from the environment and no connection is made until a request arrives, and the default dependencies carry no provider adapter (every request is answered 503).
const dependencies = createDefaultBillingWebhookDependencies();
Deno.serve(async (request: Request) => {
  try { return await processBillingWebhookRequest(request, dependencies); }
  catch {
    return new Response(JSON.stringify({ status: "unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
