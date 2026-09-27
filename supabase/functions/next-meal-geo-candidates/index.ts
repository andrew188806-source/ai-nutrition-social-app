import { createDefaultNextMealGeoDependencies, processNextMealGeoRequest } from "./handler.ts";
import { buildNextMealGeoError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultNextMealGeoDependencies();
Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try { return await processNextMealGeoRequest(request, dependencies); }
  catch { return buildNextMealGeoError("server_unavailable"); }
}));
