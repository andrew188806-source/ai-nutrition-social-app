import type {
  MEAL_BUDDY_CARD_TYPES,
  MEAL_BUDDY_CARD_WRITE_POLICY_VERSION,
  MEAL_BUDDY_INTENTION_TYPES,
  MEAL_BUDDY_MEAL_PERIODS
} from "./policy.ts";

export type MealBuddyCardType = (typeof MEAL_BUDDY_CARD_TYPES)[number];
export type MealBuddyIntentionType = (typeof MEAL_BUDDY_INTENTION_TYPES)[number];
export type MealBuddyMealPeriod = (typeof MEAL_BUDDY_MEAL_PERIODS)[number];

// The exact accepted create body. Every field is product intent; not one names an owner, a tier, a
// quota, a lifetime or an identifier.
export type MealBuddyCardCreateRequest = Readonly<{
  cardType: MealBuddyCardType;
  intentionType: MealBuddyIntentionType;
  restaurantId: string | null;
  area: string | null;
  diningDate: string;
  mealPeriod: MealBuddyMealPeriod;
  preferredTime: string | null;
}>;

// The client-visible owned card. `sourceCardRef` replaces the internal uuid entirely; there is no
// field here through which a raw card id, an owner id or a billing fact could travel.
export type OwnedMealBuddyCardDto = Readonly<{
  sourceCardRef: string;
  cardType: MealBuddyCardType;
  intentionType: MealBuddyIntentionType;
  restaurantId: string | null;
  area: string | null;
  diningDate: string;
  mealPeriod: MealBuddyMealPeriod;
  preferredTime: string | null;
  createdAt: string;
  expiresAt: string;
}>;

// Used and limit per card type. The limit is server-derived from the frozen entitlement resolver;
// the class that produced it is deliberately not disclosed.
export type MealBuddyCardQuotaDto = Readonly<{
  general: Readonly<{ used: number; limit: number }>;
  restaurant: Readonly<{ used: number; limit: number }>;
}>;

export type MealBuddyCardCreateResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CARD_WRITE_POLICY_VERSION;
  card: OwnedMealBuddyCardDto;
  quota: MealBuddyCardQuotaDto;
}>;

export type MealBuddyCardListResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CARD_WRITE_POLICY_VERSION;
  cards: readonly OwnedMealBuddyCardDto[];
  quota: MealBuddyCardQuotaDto;
}>;

export type MealBuddyCardCancelResponse = Readonly<{
  policyVersion: typeof MEAL_BUDDY_CARD_WRITE_POLICY_VERSION;
  cancelled: true;
}>;

// The internal row shape the executor returns. Server-only: it carries the raw id and never leaves
// this module boundary unsealed.
export type InternalMealBuddyCardRow = Readonly<{
  id: string;
  card_type: string;
  intention_type: string;
  restaurant_id: string | null;
  area: string | null;
  dining_date: string;
  meal_period: string;
  preferred_time: string | null;
  created_at: string;
  expires_at: string;
}>;

export type MealBuddyCardCounts = Readonly<{ general: number; restaurant: number }>;

// The entitlement row source is the AUTHENTICATED user-scoped client, exactly as SR-2D uses it.
export type MealBuddyCardEntitlementRowSource = Readonly<{
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<unknown>;
    };
  };
}>;
