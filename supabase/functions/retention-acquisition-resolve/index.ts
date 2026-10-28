import {
  createDefaultRetentionResolveDependencies,
  processRetentionResolveRequest
} from "./handler.ts";

// Composition only: nothing is read from the environment and no connection is made until a request arrives.
const dependencies = createDefaultRetentionResolveDependencies();
Deno.serve(async (request: Request) => {
  try { return await processRetentionResolveRequest(request, dependencies); }
  catch {
    return new Response(JSON.stringify({ status: "unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
