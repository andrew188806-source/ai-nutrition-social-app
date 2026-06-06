export type MealBuddyCardSourceType = "ai_recommendation" | "restaurant_page" | "manual";

export type MealBuddyIntentionType = "chat_first" | "eat_together";

export type MealBuddyVisibilityStatus = "active" | "matched" | "expired";

export type MealBuddyCardType = "general" | "restaurant";

export type MealBuddyCard = {
  userId: string;
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
  createdAt: string;
  expiresAt: string;
};

export type MealBuddyCandidate = {
  userId: string;
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
};

export type RankedMealBuddyCandidate = MealBuddyCandidate & {
  rankScore: number;
  matchReasons: string[];
};
