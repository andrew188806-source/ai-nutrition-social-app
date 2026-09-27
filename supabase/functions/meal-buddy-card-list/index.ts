import {
  createDefaultMealBuddyCardListDependencies,
  processMealBuddyCardListRequest
} from "./handler.ts";
import { buildMealBuddyCardError } from "../_shared/meal-buddy-card-api/index.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultMealBuddyCardListDependencies();

Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try {
    return await processMealBuddyCardListRequest(request, dependencies);
  } catch {
    return buildMealBuddyCardError("server_unavailable");
  }
}));
