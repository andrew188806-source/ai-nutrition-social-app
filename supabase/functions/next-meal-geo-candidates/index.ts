import { createDefaultNextMealGeoDependencies, processNextMealGeoRequest } from "./handler.ts";
import { buildNextMealGeoError } from "./errors.ts";

const dependencies = createDefaultNextMealGeoDependencies();
Deno.serve(async (request: Request) => {
  try { return await processNextMealGeoRequest(request, dependencies); }
  catch { return buildNextMealGeoError("server_unavailable"); }
});
