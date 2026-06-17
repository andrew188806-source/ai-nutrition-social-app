export type MealBuddyCardSourceType = "ai_recommendation" | "restaurant_page" | "manual";

export type MealBuddyIntentionType = "chat_first" | "eat_together";

export type MealBuddyVisibilityStatus = "active" | "matched" | "expired";

export type MealBuddyCardType = "general" | "restaurant";

// Shared identifier types used across Meal Buddy, Group Table, and Chat
// mock/store models so the same kind of id is referenced consistently.
export type UserId = string;
export type CardId = string;
export type MatchId = string;
export type ChatId = string;
export type TableId = string;

export type MealBuddyCard = {
  userId: UserId;
  cardType: MealBuddyCardType;
  sourceType: MealBuddyCardSourceType;
  intentionType: MealBuddyIntentionType;
  preferredFoodName: string;
  restaurantId: string;
  restaurantName: string;
  foodCategory: string;
  area: string;
  preferredTime: string;
  nutritionGoal: string;
  maxParticipants: number;
  currentParticipants: number;
  isLargeTableEnabled: boolean;
  visibilityStatus: MealBuddyVisibilityStatus;
  // ISO date (YYYY-MM-DD) the user intends to eat. AI-recommendation cards are
  // always created with today's date; restaurant-page cards let the user pick
  // today / tomorrow / a custom date.
  diningDate: string;
  createdAt: string;
  expiresAt: string;
};

export type MealBuddyCandidate = {
  userId: UserId;
  displayName: string;
  restaurantId: string;
  restaurantName: string;
  preferredFoodName: string;
  foodCategory: string;
  area: string;
  preferredTime: string;
  nutritionGoal: string;
  intentionType: MealBuddyIntentionType;
  distanceKm: number;
  activityScore: number;
  isPremium: boolean;
  isVerified: boolean;
  tags: readonly string[];
  socialNote: string;
  mascotId?: string;
};

export type RankedMealBuddyCandidate = MealBuddyCandidate & {
  rankScore: number;
  matchReasons: string[];
};

// Canonical card identifier, derived the same way everywhere a Meal Buddy
// Card needs to be referenced (active card lists, recommendation groups,
// invites, and chats).
export function getMealBuddyCardId(card: MealBuddyCard): CardId {
  return `${card.cardType}-${card.createdAt}`;
}
