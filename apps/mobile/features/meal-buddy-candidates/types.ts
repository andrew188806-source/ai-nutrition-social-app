import type {
  MealBuddyCandidateApiResponse,
  MealBuddyCandidateDto,
  MealBuddyCandidateProfileApiResponse,
  MealBuddyCandidateProfileDto
} from "@haocu/shared";

// SR-2G-E1: the Mobile-facing result of one meal-buddy-candidate-list read.
//
// The only client input in the whole feature is one opaque source-purpose card reference. There is
// deliberately no actor, candidate, limit, page, tier, entitlement, clock, date, meal period or
// ranking option type anywhere here, because the frozen Edge contract rejects every one of them and
// a request type would only create a place for one to appear later.
export type MealBuddyCandidateListResult = MealBuddyCandidateApiResponse;
export type MealBuddyCandidate = MealBuddyCandidateDto;
export type MealBuddyCandidateProfile = MealBuddyCandidateProfileDto;
export type MealBuddyCandidateProfileResult = MealBuddyCandidateProfileApiResponse;

// One of the actor's own active Meal Buddy cards, as the frozen SR-2G-B list endpoint returns it.
// `sourceCardRef` is opaque and short-lived: it is the ONLY thing this feature carries forward, and
// it is never persisted, decoded or treated as the card's identity.
export type MealBuddySourceCard = Readonly<{
  sourceCardRef: string;
  cardType: "general" | "restaurant";
  intentionType: "chat_first" | "eat_together";
  restaurantId: string | null;
  diningDate: string;
  mealPeriod: "breakfast" | "lunch" | "dinner" | "late_night";
  // SR-2G-F. The owner's OWN canonical meal context on their own card, so the picker can show which
  // card asks about which food. It is display only: the screen never matches, filters, ranks or
  // reorders by it, and it is never sent — the sealed sourceCardRef remains the whole request.
  foodContextTagKey: string | null;
}>;

// The closed client vocabulary. `authentication_required`, `invalid_request` and
// `server_unavailable` mirror the frozen Edge error codes; `network_error` covers a request that
// never reached the Function; `invalid_server_response` covers an HTTP success whose body failed the
// shared validator; `internal_error` is the catch-all a raw server message collapses into.
//
// `no_source_card` is a distinct, legitimate product state: the actor holds no active Meal Buddy
// card, so there is nothing to search from. It is NOT an empty candidate list and NOT an error the
// user should see as a failure.
export type MealBuddyCandidateClientErrorCode =
  | "authentication_required"
  | "invalid_request"
  | "server_unavailable"
  | "network_error"
  | "invalid_server_response"
  | "internal_error"
  | "no_source_card"
  | "meal_buddy_candidates_disabled";

export class MealBuddyCandidateClientError extends Error {
  readonly code: MealBuddyCandidateClientErrorCode;

  constructor(code: MealBuddyCandidateClientErrorCode, message: string) {
    super(message);
    this.name = "MealBuddyCandidateClientError";
    this.code = code;
  }
}

export type MealBuddyCandidateOutcome =
  | { ok: true; value: MealBuddyCandidateListResult }
  | { ok: false; error: MealBuddyCandidateClientError };

export type MealBuddySourceCardOutcome =
  | { ok: true; value: readonly MealBuddySourceCard[] }
  | { ok: false; error: MealBuddyCandidateClientError };

export type MealBuddyCandidateProfileOutcome =
  | { ok: true; value: MealBuddyCandidateProfileResult }
  | { ok: false; error: MealBuddyCandidateClientError };

export function okCandidates(value: MealBuddyCandidateListResult): MealBuddyCandidateOutcome {
  return { ok: true, value };
}

export function errCandidates(error: MealBuddyCandidateClientError): MealBuddyCandidateOutcome {
  return { ok: false, error };
}

export function okSourceCards(value: readonly MealBuddySourceCard[]): MealBuddySourceCardOutcome {
  return { ok: true, value: Object.freeze([...value]) };
}

export function errSourceCards(error: MealBuddyCandidateClientError): MealBuddySourceCardOutcome {
  return { ok: false, error };
}

export function okCandidateProfile(value: MealBuddyCandidateProfileResult): MealBuddyCandidateProfileOutcome {
  return { ok: true, value };
}

export function errCandidateProfile(error: MealBuddyCandidateClientError): MealBuddyCandidateProfileOutcome {
  return { ok: false, error };
}
