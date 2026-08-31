import { validateMealBuddyCandidateApiResponseV1 } from "@haocu/shared";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import type { MealBuddyCandidateGeoContext, MealBuddyCandidateRepository } from "../ports";
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

  async listCandidates(
    sourceCardRef: string,
    geoContext: MealBuddyCandidateGeoContext | null = null
  ) {
    // The reference is checked only for presence and family. It is never decoded, split or inspected
    // past its marker: the server owns what it means and re-verifies ownership on every request.
    if (typeof sourceCardRef !== "string" || !sourceCardRef.startsWith("mbc1.")) {
      return errCandidates(new MealBuddyCandidateClientError(
        "invalid_request", "A source Meal Buddy card reference is required."));
    }

    if (geoContext !== null && (
      !Number.isFinite(geoContext.latitude) || geoContext.latitude < -90 || geoContext.latitude > 90
      || !Number.isFinite(geoContext.longitude) || geoContext.longitude < -180 || geoContext.longitude > 180
    )) {
      return errCandidates(new MealBuddyCandidateClientError(
        "invalid_request", "The current location is not usable for Meal Buddy discovery."));
    }

    const session = await this.options.authPort.getCurrentSession();
    if (!session.ok || !session.value) {
      return errCandidates(new MealBuddyCandidateClientError(
        "authentication_required", "Meal Buddy candidates require an authenticated session."));
    }

    let invokeResult;
    try {
      // No location preserves the byte-for-byte frozen request. An available GEO-1B position adds
      // only its two required axes; actor, branch, radius and candidate authority remain server-side.
      const body = geoContext === null
        ? { sourceCardRef }
        : { sourceCardRef, geo: { latitude: geoContext.latitude, longitude: geoContext.longitude } };
      invokeResult = await this.options.mealBuddyClient.functions.invoke(
        MEAL_BUDDY_CANDIDATE_LIST_FUNCTION_NAME, { body }
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
