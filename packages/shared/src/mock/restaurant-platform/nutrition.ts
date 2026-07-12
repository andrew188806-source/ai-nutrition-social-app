import type { Ingredient, IngredientNutrition, MenuItemIngredient, MenuItemNutrition, NutritionChangeLog, NutritionEstimate, NutritionReview } from "../../domain/restaurantDomain";

export const canonicalIngredients: Ingredient[] = [
  { id: "ingredient-chicken-breast", name: "雞胸肉", defaultUnit: "g" },
  { id: "ingredient-brown-rice", name: "糙米", defaultUnit: "g" },
  { id: "ingredient-seasonal-vegetable", name: "季節蔬菜", defaultUnit: "g" },
  { id: "ingredient-salmon", name: "鮭魚", defaultUnit: "g" },
  { id: "ingredient-tofu", name: "豆腐", defaultUnit: "g" },
  { id: "ingredient-beef", name: "牛肉", defaultUnit: "g" }
];

export const canonicalIngredientNutrition: IngredientNutrition[] = [
  { id: "ing-nutrition-chicken", ingredientId: "ingredient-chicken-breast", calories: 165, protein: 31, carbohydrates: 0, fat: 3.6, perUnit: "100g" },
  { id: "ing-nutrition-rice", ingredientId: "ingredient-brown-rice", calories: 111, protein: 2.6, carbohydrates: 23, fat: 0.9, fiber: 1.8, perUnit: "100g" },
  { id: "ing-nutrition-vegetable", ingredientId: "ingredient-seasonal-vegetable", calories: 45, protein: 2, carbohydrates: 8, fat: 0.5, fiber: 3, perUnit: "100g" },
  { id: "ing-nutrition-salmon", ingredientId: "ingredient-salmon", calories: 208, protein: 20, carbohydrates: 0, fat: 13, perUnit: "100g" },
  { id: "ing-nutrition-tofu", ingredientId: "ingredient-tofu", calories: 76, protein: 8, carbohydrates: 1.9, fat: 4.8, perUnit: "100g" },
  { id: "ing-nutrition-beef", ingredientId: "ingredient-beef", calories: 250, protein: 26, carbohydrates: 0, fat: 15, perUnit: "100g" }
];

export const canonicalMenuItemIngredients: MenuItemIngredient[] = [
  { id: "mii-chicken-1", menuItemId: "dish-haochu-1", ingredientId: "ingredient-chicken-breast", amount: 150, unit: "g", preparationMethod: "舒肥", source: "restaurant", status: "complete" },
  { id: "mii-chicken-2", menuItemId: "dish-haochu-1", ingredientId: "ingredient-brown-rice", amount: 120, unit: "g", preparationMethod: "蒸煮", source: "restaurant", status: "complete" },
  { id: "mii-salmon-1", menuItemId: "dish-haochu-2", ingredientId: "ingredient-salmon", amount: 130, unit: "g", preparationMethod: "香煎", source: "ai_estimate", status: "complete" },
  { id: "mii-tofu-1", menuItemId: "dish-haochu-3", ingredientId: "ingredient-tofu", amount: 0, unit: "g", preparationMethod: "冷拌", source: "restaurant", status: "missing_portion" },
  { id: "mii-tea-1", menuItemId: "dish-haochu-4", ingredientId: "ingredient-seasonal-vegetable", amount: 0, unit: "g", preparationMethod: "沖泡", source: "restaurant", status: "missing_ingredients" },
  { id: "mii-beef-1", menuItemId: "dish-haochu-5", ingredientId: "ingredient-beef", amount: 180, unit: "g", preparationMethod: "蒜炒", source: "ai_estimate", status: "ai_outlier" }
];

export const canonicalMenuItemNutrition: MenuItemNutrition[] = [
  { id: "nutrition-haochu-chicken", menuItemId: "dish-haochu-1", calories: 520, protein: 42, carbohydrates: 48, fat: 18, fiber: 5, servingSize: "1 碗", source: "restaurant_verified", confidenceScore: 0.96, verifiedStatus: "verified", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-haochu-salmon", menuItemId: "dish-haochu-2", calories: 610, protein: 34, carbohydrates: 52, fat: 28, fiber: 7, servingSize: "1 碗", source: "ai_estimated", confidenceScore: 0.78, verifiedStatus: "ai_estimated", updatedAt: "2026-06-06T10:00:00+08:00" },
  { id: "nutrition-haochu-tofu", menuItemId: "dish-haochu-3", calories: 430, protein: 22, carbohydrates: 46, fat: 16, servingSize: "1 份", source: "pending", confidenceScore: 0.62, verifiedStatus: "pending_review", updatedAt: "2026-07-01T10:00:00+08:00" },
  { id: "nutrition-haochu-tea", menuItemId: "dish-haochu-4", source: "pending", confidenceScore: 0, verifiedStatus: "pending_review", updatedAt: "2026-07-01T10:00:00+08:00" },
  { id: "nutrition-haochu-beef", menuItemId: "dish-haochu-5", calories: 680, protein: 38, carbohydrates: 58, fat: 30, servingSize: "1 碗", source: "ai_estimated", confidenceScore: 0.54, verifiedStatus: "pending_review", updatedAt: "2026-06-20T10:00:00+08:00" },
  { id: "nutrition-mori-curry", menuItemId: "dish-mori-1", calories: 540, protein: 14, carbohydrates: 78, fat: 16, fiber: 9, servingSize: "1 份", source: "ai_estimated", confidenceScore: 0.76, verifiedStatus: "ai_estimated", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-mori-tofu-quinoa", menuItemId: "dish-mori-2", calories: 460, protein: 17, carbohydrates: 58, fat: 12, fiber: 8, servingSize: "1 份", source: "ai_estimated", confidenceScore: 0.74, verifiedStatus: "ai_estimated", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-mori-omelet", menuItemId: "dish-mori-3", calories: 420, protein: 22, carbohydrates: 34, fat: 18, fiber: 5, servingSize: "1 份", source: "pending", confidenceScore: 0.62, verifiedStatus: "pending_review", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-mountain-lean-box", menuItemId: "dish-mountain-1", calories: 610, protein: 42, carbohydrates: 58, fat: 13, fiber: 6, servingSize: "1 份", source: "restaurant_verified", confidenceScore: 0.93, verifiedStatus: "verified", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-mountain-double-chicken", menuItemId: "dish-mountain-2", calories: 680, protein: 52, carbohydrates: 48, fat: 18, fiber: 5, servingSize: "1 份", source: "restaurant_verified", confidenceScore: 0.91, verifiedStatus: "verified", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-noodle-oyster", menuItemId: "dish-noodle-1", calories: 420, protein: 18, carbohydrates: 64, fat: 9, fiber: 3, servingSize: "1 碗", source: "restaurant_verified", confidenceScore: 0.9, verifiedStatus: "verified", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-noodle-chicken", menuItemId: "dish-noodle-2", calories: 480, protein: 26, carbohydrates: 66, fat: 11, fiber: 4, servingSize: "1 份", source: "ai_estimated", confidenceScore: 0.77, verifiedStatus: "ai_estimated", updatedAt: "2026-06-01T10:00:00+08:00" },
  { id: "nutrition-cafe-avocado-shrimp", menuItemId: "dish-cafe-1", calories: 440, protein: 22, carbohydrates: 42, fat: 18, fiber: 5, servingSize: "1 份", source: "restaurant_verified", confidenceScore: 0.92, verifiedStatus: "verified", updatedAt: "2026-06-01T10:00:00+08:00" }
];

export const canonicalNutritionEstimates: NutritionEstimate[] = [
  { id: "estimate-salmon-20260606", menuItemId: "dish-haochu-2", calories: 610, protein: 34, carbohydrates: 52, fat: 28, confidenceScore: 0.78, modelVersion: "mock-nutrition-v1", createdAt: "2026-06-06T09:30:00+08:00" },
  { id: "estimate-beef-20260620", menuItemId: "dish-haochu-5", calories: 680, protein: 38, carbohydrates: 58, fat: 30, confidenceScore: 0.54, modelVersion: "mock-nutrition-v1", createdAt: "2026-06-20T09:30:00+08:00" }
];

export const canonicalNutritionReviews: NutritionReview[] = [
  { id: "review-chicken-1", menuItemId: "dish-haochu-1", nutritionId: "nutrition-haochu-chicken", status: "approved", note: "店家與平台抽查通過", reviewerId: "user-grace", reviewedAt: "2026-06-01T11:00:00+08:00" },
  { id: "review-tofu-1", menuItemId: "dish-haochu-3", nutritionId: "nutrition-haochu-tofu", status: "pending", note: "等待份量確認" }
];

export const canonicalNutritionChangeLogs: NutritionChangeLog[] = [
  { id: "nutrition-change-chicken-1", menuItemId: "dish-haochu-1", changedBy: "user-grace", before: { protein: null }, after: { protein: 42 }, createdAt: "2026-06-01T10:30:00+08:00" }
];
