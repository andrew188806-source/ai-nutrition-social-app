import type {
  CookingMethodEstimation,
  ExerciseProfile,
  FutureLearningRecord,
  IngredientEstimation,
  MockActivityData,
  PortionEstimation,
  RecoveryMealRecommendation,
  RelationshipStatusSettings,
  RestaurantSocialMatchCard,
  SelfCookedMeal,
  SocialPrivacySettings
} from "../types";

export const mockSelfCookedMeal: SelfCookedMeal = {
  id: "self-cooked-demo-1",
  userId: "user-demo-1",
  title: "home_chicken_vegetable_plate",
  notes: "mock_self_cooked_estimation_saved_to_food_memory",
  ingredientEstimationIds: ["ingredient-estimate-chicken", "ingredient-estimate-broccoli", "ingredient-estimate-rice"],
  portionEstimationIds: ["portion-estimate-main"],
  cookingMethodEstimationIds: ["cooking-estimate-pan-seared"],
  nutritionEstimateId: "nutrition-self-cooked-1",
  tagIds: ["tag-meal-self-cooked", "tag-meal-self-high-protein", "tag-meal-prep"],
  savedToFoodMemory: true,
  savedToUserMealHistory: true,
  savedToSharedAiIngredientTraining: true,
  savedToReusableIngredientPatterns: true
};

export const mockIngredientEstimations: IngredientEstimation[] = [
  { id: "ingredient-estimate-chicken", selfCookedMealId: mockSelfCookedMeal.id, ingredientName: "chicken breast", estimatedAmount: "140g", confidence: "medium" },
  { id: "ingredient-estimate-broccoli", selfCookedMealId: mockSelfCookedMeal.id, ingredientName: "broccoli", estimatedAmount: "120g", confidence: "high" },
  { id: "ingredient-estimate-rice", selfCookedMealId: mockSelfCookedMeal.id, ingredientName: "brown rice", estimatedAmount: "100g", confidence: "needs_confirmation" }
];

export const mockPortionEstimations: PortionEstimation[] = [
  { id: "portion-estimate-main", selfCookedMealId: mockSelfCookedMeal.id, portionLabel: "regular_plate", estimatedGrams: 360, confidence: "medium" }
];

export const mockCookingMethodEstimations: CookingMethodEstimation[] = [
  { id: "cooking-estimate-pan-seared", selfCookedMealId: mockSelfCookedMeal.id, method: "pan_seared_less_oil", confidence: "medium" }
];

export const mockExerciseProfile: ExerciseProfile = {
  id: "exercise-profile-demo-1",
  userId: "user-demo-1",
  weeklyActivityLevel: "moderate",
  preferredWorkoutTypes: ["strength_training", "walking"]
};

export const mockActivityData: MockActivityData = {
  id: "activity-demo-1",
  userId: "user-demo-1",
  dailySteps: 9200,
  workoutType: "strength_training",
  workoutDurationMinutes: 45,
  caloriesBurned: 360,
  weeklyActivityLevel: "moderate"
};

export const mockRecoveryMealRecommendations: RecoveryMealRecommendation[] = [
  {
    id: "recovery-protein-1",
    userId: "user-demo-1",
    title: "post_workout_protein_bowl",
    reason: "activity_high_add_protein",
    tagIds: ["tag-social-post-workout-protein", "tag-goal-muscle-gain", "tag-restaurant-high-protein"],
    isPremiumOnly: true
  },
  {
    id: "recovery-low-activity-1",
    userId: "user-demo-1",
    title: "lower_calorie_high_fiber_meal",
    reason: "weekly_activity_low_reduce_calorie_density",
    tagIds: ["tag-goal-high-fiber", "tag-restaurant-low-calorie"],
    isPremiumOnly: true
  }
];

export const mockFutureLearningRecords: FutureLearningRecord[] = [
  {
    id: "future-learning-1",
    correctionId: "correction-demo-1",
    candidateId: "candidate-haochu-chicken-bowl",
    signal: "increase_confidence",
    note: "multiple_users_correct_similar_photos_to_same_menu_item"
  }
];

export const mockRelationshipStatusSettings: RelationshipStatusSettings = {
  id: "relationship-settings-demo-1",
  userId: "user-demo-1",
  mode: "friends_only",
  relationshipIntent: "not_considering_romance"
};

export const mockSocialPrivacySettings: SocialPrivacySettings = {
  id: "privacy-settings-demo-1",
  userId: "user-demo-1",
  socialCardEnabled: true,
  anonymousTagsOnly: true,
  hidePhoto: true,
  hideHealthGoals: false,
  optOutRestaurantMatches: false,
  optOutGroupTables: false
};

export const mockRestaurantSocialMatchCards: RestaurantSocialMatchCard[] = [
  {
    id: "restaurant-social-haochu-1",
    restaurantId: "restaurant-haochu-bowl",
    restaurantName: "Haochu Health Bowl",
    similarPeopleCount: 3,
    title: "three_similar_people_interested",
    reason: "shared_high_protein_calorie_management_restaurant_interest",
    tagIds: ["tag-eating-high-protein", "tag-goal-calorie", "tag-social-healthy-together"],
    respectsPrivacy: true
  }
];
