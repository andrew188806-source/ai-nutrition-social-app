import type { MealBuddyContextState } from "../meal-buddy-context/types.ts";

// SR-2G-D Meal Buddy candidate API types.
//
// The client DTO is deliberately narrow. It carries no user id, no card id, no profile id, no Taste
// score, no ranking state, no exposure index, no entitlement and no fine-grained interest tag: a
// candidate is reachable only through its opaque refs.

// One row of the SR-2G-F context primitive, which composes the SR-2G-D card projection and through
// it the frozen SR-2G-C pool. `context_state` is a closed server-side vocabulary and never a score;
// it is consumed by the bucket composer and never reaches the client DTO.
export type MealBuddyCandidateCardRow = Readonly<{
  candidate_owner_user_id: string;
  candidate_card_id: string;
  card_type: string;
  intention_type: string;
  restaurant_id: string | null;
  restaurant_name: string | null;
  dining_date: string;
  meal_period: string;
  context_state: string;
}>;

// The owner -> exact selected card binding, established by SR-2G-C before any ranking happens and
// never renegotiated afterwards.
export type MealBuddySelectedCard = Readonly<{
  ownerUserId: string;
  cardId: string;
  cardType: string;
  intentionType: string;
  restaurantId: string | null;
  restaurantName: string | null;
  diningDate: string;
  mealPeriod: string;
  // SR-2G-F. Server-internal ordering input only: it decides which bucket this candidate ranks in.
  // Deliberately absent from MealBuddyCandidateCardDto, so no context internal is ever exposed.
  contextState: MealBuddyContextState;
}>;

export type MealBuddyCandidateRestaurant = Readonly<{
  restaurantId: string;
  name: string | null;
}>;

// The public card context. Deliberately absent: card id, owner id, area, preferredTime, createdAt,
// expiresAt, cancelledAt, quota state and every database timestamp.
export type MealBuddyCandidateCardDto = Readonly<{
  diningDate: string;
  mealPeriod: string;
  intentionType: string;
  restaurant: MealBuddyCandidateRestaurant | null;
}>;

// Compact interest presentation only. The complete fine-grained selections stay canonical in the
// SR-2C-R1 profile authority for the future full personal profile, and never appear here.
export type MealBuddyCandidateInterestsDto = Readonly<{
  generalCategoryKeys: readonly string[];
  generalOverflowCount: number;
  foodCategoryKeys: readonly string[];
  foodOverflowCount: number;
}>;

export type MealBuddyCandidateDto = Readonly<{
  candidateRef: string;
  candidateCardRef: string;
  displayName: string;
  mascotAvatarKey: string | null;
  publicBio: string | null;
  willingToChat: boolean;
  interests: MealBuddyCandidateInterestsDto;
  card: MealBuddyCandidateCardDto;
}>;

export type MealBuddyCandidateApiResponse = Readonly<{
  policyVersion: "meal-buddy-candidate-api-v1";
  candidates: readonly MealBuddyCandidateDto[];
}>;

// The entitlement row source is read on the caller's user-scoped client, exactly as SR-2D does, so
// the executor connection never widens into subscription state.
export type MealBuddyCandidateEntitlementRowSource = Readonly<{
  readEntitlementRow: (actorUserId: string) => Promise<unknown>;
}>;
