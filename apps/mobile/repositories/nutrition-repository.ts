import type { RestaurantDomain } from "@haocu/shared/domain";
import { mobileRestaurantMockAdapter } from "../adapters/mock/mobile-restaurant-mock-adapter";

function snapshot() {
  return mobileRestaurantMockAdapter.getSnapshot();
}

export const nutritionRepository = {
  findFormalNutrition(menuItemId: string | undefined | null): RestaurantDomain.MenuItemNutrition | null {
    if (!menuItemId) return null;
    return snapshot().menuItemNutrition.find((nutrition) => nutrition.menuItemId === menuItemId) ?? null;
  },

  findAiEstimate(menuItemId: string | undefined | null): RestaurantDomain.NutritionEstimate | null {
    if (!menuItemId) return null;
    return snapshot().nutritionEstimates.find((estimate) => estimate.menuItemId === menuItemId) ?? null;
  },

  findLatestReview(menuItemId: string | undefined | null): RestaurantDomain.NutritionReview | null {
    if (!menuItemId) return null;
    return snapshot().nutritionReviews.find((review) => review.menuItemId === menuItemId) ?? null;
  }
};
