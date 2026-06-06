import type { MealOrigin, NutritionDataSaveTarget } from "../types";

export const externalDiningSaveTargets = [
  "food_memory",
  "user_meal_history",
  "shared_ai_ingredient_training",
  "restaurant_nutrition_profile",
  "restaurant_nutrition_cache",
  "menu_nutrition_cache",
  "restaurant_location_context",
  "reusable_nutrition_estimation_database"
] as const satisfies readonly NutritionDataSaveTarget[];

export const selfCookedSaveTargets = [
  "food_memory",
  "user_meal_history",
  "shared_ai_ingredient_training",
  "reusable_ingredient_patterns"
] as const satisfies readonly NutritionDataSaveTarget[];

const restaurantOnlyTargets = new Set<NutritionDataSaveTarget>([
  "restaurant_nutrition_profile",
  "restaurant_nutrition_cache",
  "menu_nutrition_cache",
  "restaurant_location_context"
]);

export function getNutritionCorrectionSaveTargets(origin: MealOrigin): readonly NutritionDataSaveTarget[] {
  return origin === "external_dining" ? externalDiningSaveTargets : selfCookedSaveTargets;
}

export function isRestaurantDataTarget(target: NutritionDataSaveTarget) {
  return restaurantOnlyTargets.has(target);
}

export function assertSelfCookedTargetsDoNotUseRestaurantData(targets: readonly NutritionDataSaveTarget[]) {
  return targets.every((target) => !isRestaurantDataTarget(target));
}
