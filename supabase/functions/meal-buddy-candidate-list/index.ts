import {
  createDefaultMealBuddyCandidateListDependencies,
  processMealBuddyCandidateListRequest
} from "./handler.ts";
import { buildMealBuddyCandidateListError } from "./errors.ts";

const dependencies = createDefaultMealBuddyCandidateListDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processMealBuddyCandidateListRequest(request, dependencies);
  } catch {
    return buildMealBuddyCandidateListError("server_unavailable");
  }
});
