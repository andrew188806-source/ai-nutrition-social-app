import {
  createDefaultMealBuddyRelationshipDependencies,
  processMealBuddyRelationshipRequest
} from "./handler.ts";
import { buildMealBuddyRelationshipError } from "./errors.ts";

const dependencies = createDefaultMealBuddyRelationshipDependencies();
Deno.serve(async (request: Request) => {
  try { return await processMealBuddyRelationshipRequest(request, dependencies); }
  catch { return buildMealBuddyRelationshipError("server_unavailable"); }
});
