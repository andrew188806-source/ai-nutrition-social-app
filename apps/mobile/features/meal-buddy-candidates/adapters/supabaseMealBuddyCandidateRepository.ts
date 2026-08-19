import { validateMealBuddyCandidateApiResponseV1 } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { MealBuddyCandidateRepository } from "../ports";
import { errCandidates, MealBuddyCandidateClientError, okCandidates } from "../types";
import {
  MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME,
  type SupabaseMealBuddyClientLike
} from "../supabaseMealBuddyCandidateContracts";
import { mapInvokeErrorToClientError } from "./supabaseMealBuddyErrors";

export type SupabaseMealBuddyCandidateRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealBuddyClient: SupabaseMealBuddyClientLike;
};

// Reuses the caller's already-authenticated Supabase client. This adapter never builds a second
// (admin/service-role) client, never accepts a caller-supplied actor, and never attaches an
// Authorization header itself — JWT propagation is handled entirely by the Supabase SDK.
//
// It is a pure transport: it adds no ordering, capping, filtering, caching, merging or retry. Every
// one of those is server authority, and a client-side "convenience" here is exactly how a ranking or
// exposure rule would silently move onto the device.
export class SupabaseMealBuddyCandidateRepository implements MealBuddyCandidateRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseMealBuddyCandidateRepositoryOptions) {}

  async listCandidates(sourceCardRef: string) {
    // The reference is checked only for presence and family. It is never decoded, split or inspected
    // past its marker: the server owns what it means and re-verifies ownership on every request.
    if (typeof sourceCardRef !== "string" || !sourceCardRef.startsWith("mbc1.")) {
      return errCandidates(new MealBuddyCandidateClientError(
        "invalid_request", "A source Meal Buddy card reference is required."));
    }

    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errCandidates(new MealBuddyCandidateClientError(
        "authentication_required", "Meal Buddy candidates require an authenticated session."));
    }

    let invokeResult;
    try {
      // Exactly one business key. The frozen contract rejects a second one rather than ignoring it.
      invokeResult = await this.options.mealBuddyClient.functions.invoke(
        MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME, { body: { sourceCardRef } }
      );
    } catch {
      return errCandidates(new MealBuddyCandidateClientError(
        "network_error", "Could not reach the Meal Buddy service."));
    }

    if (invokeResult.error) {
      return errCandidates(await mapInvokeErrorToClientError(invokeResult.error));
    }

    // Never cast the raw response. Only the shared validator's own output is trusted, so an HTTP
    // success carrying an unexpected field — a leaked identifier, ranking state, score, entitlement
    // flag or fine-grained interest tag — is reported as invalid_server_response rather than
    // silently rendered.
    const validation = validateMealBuddyCandidateApiResponseV1(invokeResult.data);
    if (!validation.ok) {
      return errCandidates(new MealBuddyCandidateClientError(
        "invalid_server_response", "The Meal Buddy candidate response failed local validation."));
    }
    return okCandidates(validation.value);
  }
}
