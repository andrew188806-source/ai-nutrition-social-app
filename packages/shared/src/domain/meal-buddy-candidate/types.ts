// SR-2G-E1: the client-facing Meal Buddy candidate contract, shared by Mobile and reusable by tests.
//
// This mirrors the frozen SR-2G-D public response exactly. It is deliberately the ONLY client-visible
// Meal Buddy candidate shape: there is no user identifier, no card identifier, no profile identifier,
// no exposure ordinal, no ranking state, no Taste figure, no entitlement or billing fact, and no
// verification, age, location or health field, because none of those exist on this type.
//
// Ordering is server authority. The array arrives already reduced to one card per owner by SR-2G-C,
// already ranked by SR-2A, already truncated to the SR-2B entitlement prefix and already projected by
// SR-2C/SR-2C-R1. A client may render it but may never sort, rerank, filter, cap, refill or paginate.
//
// Interests are PRESENTATION ONLY. They arrive after exposure has already been decided, they carry
// top-level category keys rather than the candidate's fine-grained selections, and a client must
// never use them to order, score, group or highlight a candidate.

export const MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION = "meal-buddy-candidate-api-v1" as const;

export const MEAL_BUDDY_CANDIDATE_FIELDS = Object.freeze([
  "candidateRef",
  "candidateCardRef",
  "displayName",
  "mascotAvatarKey",
  "publicBio",
  "willingToChat",
  "interests",
  "card"
] as const);

export const MEAL_BUDDY_CANDIDATE_INTEREST_FIELDS = Object.freeze([
  "foodCategoryKeys",
  "foodOverflowCount",
  "generalCategoryKeys",
  "generalOverflowCount"
] as const);

export const MEAL_BUDDY_CANDIDATE_CARD_FIELDS = Object.freeze([
  "diningDate",
  "intentionType",
  "mealPeriod",
  "restaurant"
] as const);

export const MEAL_BUDDY_CANDIDATE_RESTAURANT_FIELDS = Object.freeze([
  "name",
  "restaurantId"
] as const);

export const MEAL_BUDDY_CANDIDATE_RESPONSE_FIELDS = Object.freeze([
  "candidates",
  "policyVersion"
] as const);

// The frozen SR-2G-A/SR-2D reference markers. They exist so a client can assert a reference is the
// family it expects; they are NOT a decoding scheme, and nothing beyond the prefix may be parsed.
export const MEAL_BUDDY_CANDIDATE_PERSON_REF_PREFIX = "scr1." as const;
export const MEAL_BUDDY_CANDIDATE_CARD_REF_PREFIX = "mbc1." as const;

// The frozen SR-2C-R1 compact presentation limit. Restated so a client can assert it, never raise it.
export const MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE = 3;

// The frozen SR-2B Premium exposure cap. A response longer than this is a contract breach, not a
// list to truncate on the device.
export const MEAL_BUDDY_CANDIDATE_MAXIMUM = 10;

export const MEAL_BUDDY_CANDIDATE_MEAL_PERIODS = Object.freeze([
  "breakfast", "lunch", "dinner", "late_night"
] as const);
export type MealBuddyCandidateMealPeriod = (typeof MEAL_BUDDY_CANDIDATE_MEAL_PERIODS)[number];

export const MEAL_BUDDY_CANDIDATE_INTENTION_TYPES = Object.freeze([
  "chat_first", "eat_together"
] as const);
export type MealBuddyCandidateIntentionType = (typeof MEAL_BUDDY_CANDIDATE_INTENTION_TYPES)[number];

// Presentation-only restaurant identity. Deliberately absent: every private merchant field, every
// ranking value and every unrelated catalog column.
export type MealBuddyCandidateRestaurantDto = Readonly<{
  restaurantId: string;
  name: string | null;
}>;

// The public card context. Deliberately absent: the card id, the owner, area, preferredTime,
// createdAt, expiresAt, cancelledAt and every database timestamp.
export type MealBuddyCandidateCardDto = Readonly<{
  diningDate: string;
  mealPeriod: MealBuddyCandidateMealPeriod;
  intentionType: MealBuddyCandidateIntentionType;
  restaurant: MealBuddyCandidateRestaurantDto | null;
}>;

// Compact interest presentation. `*CategoryKeys` carries at most three TOP-LEVEL catalog keys in
// canonical order and `*OverflowCount` is the derived remainder. There is no "+N" string here: the
// count is a number and the label is a rendering concern, never persisted or transmitted as text.
export type MealBuddyCandidateInterestsDto = Readonly<{
  generalCategoryKeys: readonly string[];
  generalOverflowCount: number;
  foodCategoryKeys: readonly string[];
  foodOverflowCount: number;
}>;

// `candidateRef` is an opaque, actor-scoped, expiring PERSON reference and `candidateCardRef` an
// opaque, actor-scoped, purpose-scoped CARD reference. Neither is an identity, neither is a profile
// or card identifier, and neither is authorization to act. A client may hold one for the lifetime of
// the screen that received it and must never decode, split, persist or compare it across requests.
export type MealBuddyCandidateDto = Readonly<{
  candidateRef: string;
  candidateCardRef: string;
  displayName: string;
  mascotAvatarKey: string;
  publicBio: string | null;
  willingToChat: boolean;
  interests: MealBuddyCandidateInterestsDto;
  card: MealBuddyCandidateCardDto;
}>;

export type MealBuddyCandidateApiResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CANDIDATE_API_POLICY_VERSION;
  candidates: readonly MealBuddyCandidateDto[];
}>;

// The exact V1 request. One opaque source-purpose card reference and nothing else: no actor, no
// candidate, no limit, no page, no tier, no clock and no eligibility field is expressible.
export type MealBuddyCandidateListRequest = Readonly<{
  sourceCardRef: string;
}>;
