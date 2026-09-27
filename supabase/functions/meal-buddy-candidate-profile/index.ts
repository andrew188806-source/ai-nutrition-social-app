import {
  createDefaultMealBuddyCandidateProfileDependencies,
  processMealBuddyCandidateProfileRequest
} from "./handler.ts";
import { buildMealBuddyCandidateProfileError } from "./errors.ts";
import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";

const dependencies = createDefaultMealBuddyCandidateProfileDependencies();

Deno.serve(withConsumerBrowserCors(async (request: Request) => {
  try {
    return await processMealBuddyCandidateProfileRequest(request, dependencies);
  } catch {
    return buildMealBuddyCandidateProfileError("server_unavailable");
  }
}));
