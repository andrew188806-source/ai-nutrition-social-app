import {
  createDefaultMealBuddyCandidateListDependencies,
  processMealBuddyCandidateListRequest
} from "./handler.ts";
import { buildMealBuddyCandidateListError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultMealBuddyCandidateListDependencies();

Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try {
    return await processMealBuddyCandidateListRequest(request, dependencies);
  } catch {
    return buildMealBuddyCandidateListError("server_unavailable");
  }
}));
