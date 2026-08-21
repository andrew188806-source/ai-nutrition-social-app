import { validateMealBuddyCandidateProfileApiResponseV1 } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { MealBuddyCandidateProfileRepository } from "../ports";
import {
  errCandidateProfile,
  MealBuddyCandidateClientError,
  okCandidateProfile
} from "../types";
import {
  MEAL_BUDDY_CANDIDATE_PROFILE_FUNCTION_NAME,
  type SupabaseMealBuddyClientLike
} from "../supabaseMealBuddyCandidateContracts";
import { mapInvokeErrorToClientError } from "./supabaseMealBuddyErrors";

export type SupabaseMealBuddyCandidateProfileRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealBuddyClient: SupabaseMealBuddyClientLike;
};

export class SupabaseMealBuddyCandidateProfileRepository implements MealBuddyCandidateProfileRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseMealBuddyCandidateProfileRepositoryOptions) {}

  async getCandidateProfile(candidateRef: string) {
    if (typeof candidateRef !== "string" || !candidateRef.startsWith("scr1.")) {
      return errCandidateProfile(new MealBuddyCandidateClientError(
        "invalid_request", "An opaque candidate reference is required."));
    }
    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errCandidateProfile(new MealBuddyCandidateClientError(
        "authentication_required", "Candidate profiles require an authenticated session."));
    }

    let invokeResult;
    try {
      invokeResult = await this.options.mealBuddyClient.functions.invoke(
        MEAL_BUDDY_CANDIDATE_PROFILE_FUNCTION_NAME, { body: { candidateRef } }
      );
    } catch {
      return errCandidateProfile(new MealBuddyCandidateClientError(
        "network_error", "Could not reach the Meal Buddy service."));
    }
    if (invokeResult.error) return errCandidateProfile(await mapInvokeErrorToClientError(invokeResult.error));

    const validation = validateMealBuddyCandidateProfileApiResponseV1(invokeResult.data);
    if (!validation.ok) {
      return errCandidateProfile(new MealBuddyCandidateClientError(
        "invalid_server_response", "The candidate profile response failed local validation."));
    }
    return okCandidateProfile(validation.value);
  }
}
