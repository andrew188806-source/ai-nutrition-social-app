import {
  createDefaultMealBuddyPushDispatchDependencies,
  processMealBuddyPushDispatchRequest
} from "./handler.ts";

const dependencies = createDefaultMealBuddyPushDispatchDependencies();
Deno.serve(async (request: Request) => {
  try { return await processMealBuddyPushDispatchRequest(request, dependencies); }
  catch {
    return new Response(JSON.stringify({ error: { code: "server_unavailable", message: "The push dispatcher is unavailable." } }), {
      status: 503, headers: { "content-type": "application/json" }
    });
  }
});
