import type {
  FoodMemoryEntry,
  FoodMemoryFavorite,
  FoodMemoryFilter,
  HealthGoalPlan,
  HealthGoalProgress,
  RecommendedMealTarget,
  SocialPromptSuggestion
} from "../types";

export const mockFoodMemoryEntries: FoodMemoryEntry[] = [
  {
    id: "memory-korean-chicken",
    userId: "user-demo-1",
    date: "2026-05-24",
    mealTime: "dinner",
    district: "Da'an",
    restaurantName: "Crispy Seoul Kitchen",
    mealName: "Korean Chicken Plate",
    nutritionEstimateId: "nutrition-memory-1",
    rating: {
      userRating: 5,
      tasteRating: 5,
      fullnessRating: 4,
      healthinessRating: 3,
      valueForMoneyRating: 4,
      revisitIntention: "yes"
    },
    eatingHabitTagIds: ["tag-eating-out", "tag-eating-high-protein"],
    healthGoalTagIds: ["tag-goal-calorie"],
    restaurantTagIds: ["tag-restaurant-nutrition"],
    mealTagIds: ["tag-meal-crispy", "tag-meal-favorite"],
    socialIntentTagIds: ["tag-social-new-restaurant"],
    note: "crispy_favorite_chat_topic",
    visibility: "anonymous_social",
    isFavorite: true
  },
  {
    id: "memory-health-bento",
    userId: "user-demo-1",
    date: "2026-05-25",
    mealTime: "lunch",
    district: "Xinyi",
    restaurantName: "Haochu Health Bowl",
    mealName: "Chicken Protein Bowl",
    nutritionEstimateId: "nutrition-memory-2",
    rating: {
      userRating: 4,
      tasteRating: 4,
      fullnessRating: 5,
      healthinessRating: 5,
      valueForMoneyRating: 4,
      revisitIntention: "yes"
    },
    eatingHabitTagIds: ["tag-eating-high-protein", "tag-eating-balanced"],
    healthGoalTagIds: ["tag-goal-muscle-gain", "tag-goal-calorie"],
    restaurantTagIds: ["tag-restaurant-verified", "tag-restaurant-high-protein"],
    mealTagIds: ["tag-meal-light", "tag-meal-favorite"],
    socialIntentTagIds: ["tag-social-healthy-meal", "tag-social-lunch"],
    note: "protein_bowl_match_context",
    visibility: "visible_to_matches",
    isFavorite: true
  }
];

export const mockFoodMemoryFilters: FoodMemoryFilter[] = [
  { id: "filter-favorites", userId: "user-demo-1", favoritesOnly: true },
  { id: "filter-high-rating", userId: "user-demo-1", minRating: 4, revisitIntention: "yes" }
];

export const mockFoodMemoryFavorites: FoodMemoryFavorite[] = [
  { id: "favorite-memory-1", userId: "user-demo-1", foodMemoryEntryId: "memory-korean-chicken", createdAt: "2026-05-24T20:30:00+08:00" },
  { id: "favorite-memory-2", userId: "user-demo-1", foodMemoryEntryId: "memory-health-bento", createdAt: "2026-05-25T12:55:00+08:00" }
];

export const mockSocialPromptSuggestions: SocialPromptSuggestion[] = [
  {
    id: "prompt-chat-chicken",
    userId: "user-demo-1",
    foodMemoryEntryId: "memory-korean-chicken",
    matchedProfileId: "profile-demo-2",
    promptType: "chat_topic",
    visibility: "free_preview",
    tagIds: ["tag-meal-crispy", "tag-social-new-restaurant"]
  },
  {
    id: "prompt-table-bento",
    userId: "user-demo-1",
    foodMemoryEntryId: "memory-health-bento",
    promptType: "start_group_table",
    visibility: "premium_detail",
    tagIds: ["tag-restaurant-verified", "tag-social-healthy-meal"]
  }
];

export const mockHealthGoalPlan: HealthGoalPlan = {
  id: "health-goal-plan-demo-1",
  userId: "user-demo-1",
  tier: "premium",
  settings: {
    currentWeightKg: 68,
    targetWeightKg: 64,
    targetDate: "2026-08-31",
    activityLevel: "moderate",
    dietaryPreference: "balanced",
    avoidFoods: ["fried_food_late_night", "sugary_drinks"],
    preferredMealTypes: ["lunch", "dinner"],
    healthGoalTagIds: ["tag-goal-fat-loss", "tag-goal-calorie", "tag-goal-high-fiber"]
  },
  nutritionTarget: {
    dailyCalorieMin: 1650,
    dailyCalorieMax: 1850,
    proteinGrams: 105,
    carbsGrams: 180,
    fatGrams: 55
  },
  weeklyProgressTarget: "0.3_kg_per_week",
  todayEat: ["high_fiber_bowl", "lean_protein", "vegetable_side"],
  todayAvoid: ["late_night_fried_food", "sweet_drinks"],
  isPremiumLocked: false
};

export const mockRecommendedMealTargets: RecommendedMealTarget[] = [
  { id: "meal-target-lunch", healthGoalPlanId: mockHealthGoalPlan.id, mealTime: "lunch", title: "lean_protein_lunch", tagIds: ["tag-goal-calorie", "tag-restaurant-high-protein"] },
  { id: "meal-target-dinner", healthGoalPlanId: mockHealthGoalPlan.id, mealTime: "dinner", title: "high_fiber_dinner", tagIds: ["tag-goal-high-fiber", "tag-restaurant-vegetarian"] }
];

export const mockHealthGoalProgress: HealthGoalProgress[] = [
  { id: "goal-progress-week-1", healthGoalPlanId: mockHealthGoalPlan.id, weekStartDate: "2026-05-25", weightKg: 68, note: "mock_starting_week" }
];
