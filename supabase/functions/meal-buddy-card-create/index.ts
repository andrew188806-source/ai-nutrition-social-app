import {
  createDefaultMealBuddyCardCreateDependencies,
  processMealBuddyCardCreateRequest
} from "./handler.ts";
import { buildMealBuddyCardError } from "../_shared/meal-buddy-card-api/index.ts";

const dependencies = createDefaultMealBuddyCardCreateDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processMealBuddyCardCreateRequest(request, dependencies);
  } catch {
    return buildMealBuddyCardError("server_unavailable");
  }
});
