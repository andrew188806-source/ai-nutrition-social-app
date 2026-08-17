import {
  createDefaultMealBuddyCardCancelDependencies,
  processMealBuddyCardCancelRequest
} from "./handler.ts";
import { buildMealBuddyCardError } from "../_shared/meal-buddy-card-api/index.ts";

const dependencies = createDefaultMealBuddyCardCancelDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processMealBuddyCardCancelRequest(request, dependencies);
  } catch {
    return buildMealBuddyCardError("server_unavailable");
  }
});
