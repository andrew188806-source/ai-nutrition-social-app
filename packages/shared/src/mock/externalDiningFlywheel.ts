import type { ExternalDiningCorrectionFlywheelRecord, MenuNutritionCacheEntry, RestaurantNutritionProfile } from "../types";

export const mockRestaurantNutritionProfiles: RestaurantNutritionProfile[] = [
  {
    id: "nutrition-profile-haochu-chicken-bowl",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "menu-chicken-bowl",
    source: "user_correction",
    calories: 620,
    proteinGrams: 38,
    carbsGrams: 58,
    fatGrams: 22,
    reuseCount: 42,
    confidence: "high",
    updatedAt: "2026-05-26T12:40:00+08:00"
  },
  {
    id: "nutrition-profile-veggie-fiber-bowl",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "menu-veggie-fiber-bowl",
    source: "restaurant_menu",
    calories: 540,
    proteinGrams: 24,
    carbsGrams: 68,
    fatGrams: 16,
    reuseCount: 18,
    confidence: "medium",
    updatedAt: "2026-05-26T11:10:00+08:00"
  }
];

export const mockMenuNutritionCacheEntries: MenuNutritionCacheEntry[] = [
  {
    id: "menu-cache-haochu-chicken-bowl-xinyi",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "menu-chicken-bowl",
    cacheKey: "xinyi:haochu-health-bowl:chicken-protein-bowl",
    nutritionProfileId: "nutrition-profile-haochu-chicken-bowl",
    hitCount: 128,
    lastUsedAt: "2026-05-26T12:50:00+08:00"
  }
];

export const mockExternalDiningCorrectionFlywheelRecords: ExternalDiningCorrectionFlywheelRecord[] = [
  {
    id: "flywheel-record-demo-1",
    userId: "user-demo-1",
    restaurantId: "restaurant-haochu-bowl",
    menuItemId: "menu-chicken-bowl",
    mealId: "meal-demo-chicken-bowl",
    correctionSource: "manual_correct",
    savedToFoodMemory: true,
    savedToUserMealHistory: true,
    savedToSharedAiIngredientTraining: true,
    savedToRestaurantNutritionProfile: true,
    savedToRestaurantNutritionCache: true,
    savedToMenuNutritionCache: true,
    savedToReusableNutritionDataset: true,
    savedToRestaurantLocationContext: true,
    aiBreakdownTriggered: true,
    createdAt: "2026-05-26T12:55:00+08:00"
  }
];
