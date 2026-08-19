import type { MealBuddyCandidateOutcome, MealBuddySourceCardOutcome } from "./types";

// The whole read surface of SR-2G-E1. Two reads, both server-authoritative.
//
// `listSourceCards` takes NO argument: the server derives the owner from the verified session, so
// there is no parameter for an actor or a foreign owner to hide in.
//
// `listCandidates` takes exactly one opaque source-purpose reference. It is not authorization —
// the frozen pool re-verifies ownership and active state server-side — and there is deliberately no
// second parameter, so no limit, page, tier, clock or eligibility input is expressible.
export interface MealBuddySourceCardRepository {
  readonly source: "disabled" | "supabase-live";
  listSourceCards(): Promise<MealBuddySourceCardOutcome>;
}

export interface MealBuddyCandidateRepository {
  readonly source: "disabled" | "supabase-live";
  listCandidates(sourceCardRef: string): Promise<MealBuddyCandidateOutcome>;
}
