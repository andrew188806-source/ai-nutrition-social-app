import {
  createDefaultRestaurantGeocodeDispatchDependencies,
  processRestaurantGeocodeDispatchRequest
} from "./handler.ts";

const dependencies = createDefaultRestaurantGeocodeDispatchDependencies();
Deno.serve(async (request: Request) => {
  try { return await processRestaurantGeocodeDispatchRequest(request, dependencies); }
  catch {
    return new Response(JSON.stringify({ error: { code: "server_unavailable", message: "The geocode dispatcher is unavailable." } }), {
      status: 503, headers: { "content-type": "application/json" }
    });
  }
});
