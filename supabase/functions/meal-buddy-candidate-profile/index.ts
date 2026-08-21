import {
  createDefaultMealBuddyCandidateProfileDependencies,
  processMealBuddyCandidateProfileRequest
} from "./handler.ts";
import { buildMealBuddyCandidateProfileError } from "./errors.ts";

const dependencies = createDefaultMealBuddyCandidateProfileDependencies();

Deno.serve(async (request: Request) => {
  try {
    return await processMealBuddyCandidateProfileRequest(request, dependencies);
  } catch {
    return buildMealBuddyCandidateProfileError("server_unavailable");
  }
});
