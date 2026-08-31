import type {
  MealBuddyCandidateOutcome,
  MealBuddyCandidateProfileOutcome,
  MealBuddySourceCardOutcome
} from "./types";

export type MealBuddyCandidateGeoContext = Readonly<{
  latitude: number;
  longitude: number;
}>;

// The whole read surface of SR-2G-E1. Two reads, both server-authoritative.
//
// `listSourceCards` takes NO argument: the server derives the owner from the verified session, so
// there is no parameter for an actor or a foreign owner to hide in.
//
// `listCandidates` takes one opaque source-purpose reference and optional current coordinates. The
// reference is not authorization and the coordinate is not identity: server authority re-verifies
// the actor/card, fixes the radius, resolves exact candidate branches and owns all eligibility.
export interface MealBuddySourceCardRepository {
  readonly source: "disabled" | "supabase-live";
  listSourceCards(): Promise<MealBuddySourceCardOutcome>;
}

export interface MealBuddyCandidateRepository {
  readonly source: "disabled" | "supabase-live";
  listCandidates(
    sourceCardRef: string,
    geoContext?: MealBuddyCandidateGeoContext | null
  ): Promise<MealBuddyCandidateOutcome>;
}

export interface MealBuddyCandidateProfileRepository {
  readonly source: "disabled" | "supabase-live";
  getCandidateProfile(candidateRef: string): Promise<MealBuddyCandidateProfileOutcome>;
}
