import {
  createDefaultMealBuddyRelationshipDependencies,
  processMealBuddyRelationshipRequest
} from "./handler.ts";
import { buildMealBuddyRelationshipError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultMealBuddyRelationshipDependencies();
Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try { return await processMealBuddyRelationshipRequest(request, dependencies); }
  catch { return buildMealBuddyRelationshipError("server_unavailable"); }
}));
