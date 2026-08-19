import type { MealBuddyCandidateRepository, MealBuddySourceCardRepository } from "../ports";
import { errCandidates, errSourceCards, MealBuddyCandidateClientError } from "../types";

// The safe default. Both disabled repositories fail closed with a typed error rather than
// impersonating a successful empty result: an unconfigured runtime must never be indistinguishable
// from "nobody is available today", and it must never fall back to demo candidates.
export class DisabledMealBuddySourceCardRepository implements MealBuddySourceCardRepository {
  readonly source = "disabled" as const;

  async listSourceCards() {
    return errSourceCards(new MealBuddyCandidateClientError(
      "meal_buddy_candidates_disabled", "Live Meal Buddy cards are not enabled in this runtime."));
  }
}

export class DisabledMealBuddyCandidateRepository implements MealBuddyCandidateRepository {
  readonly source = "disabled" as const;

  async listCandidates() {
    return errCandidates(new MealBuddyCandidateClientError(
      "meal_buddy_candidates_disabled", "Live Meal Buddy candidates are not enabled in this runtime."));
  }
}
