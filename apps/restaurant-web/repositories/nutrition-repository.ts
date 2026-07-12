import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listMenuItemNutrition() {
  return restaurantConsoleMockAdapter.menuItemNutrition;
}

export function listMenuItemIngredients() {
  return restaurantConsoleMockAdapter.menuItemIngredients;
}

export function listNutritionEstimates() {
  return restaurantConsoleMockAdapter.nutritionEstimates;
}

export function listNutritionReviews() {
  return restaurantConsoleMockAdapter.nutritionReviews;
}

export function listNutritionChangeLogs() {
  return restaurantConsoleMockAdapter.nutritionChangeLogs;
}
