import type { RestaurantDomain } from "@haocu/shared/domain";
import {
  canonicalBranches,
  canonicalBranchMenuItems,
  canonicalMenuCategories,
  canonicalMenuItemAliases,
  canonicalMenuItemNutrition,
  canonicalMenuItems,
  canonicalMenus,
  canonicalNutritionEstimates,
  canonicalNutritionReviews,
  canonicalRestaurants
} from "@haocu/shared/mock/restaurant-platform";

export type MobileRestaurantMockSnapshot = {
  restaurants: RestaurantDomain.Restaurant[];
  branches: RestaurantDomain.RestaurantBranch[];
  menus: RestaurantDomain.Menu[];
  menuCategories: RestaurantDomain.MenuCategory[];
  menuItems: RestaurantDomain.MenuItem[];
  branchMenuItems: RestaurantDomain.BranchMenuItem[];
  menuItemAliases: RestaurantDomain.MenuItemAlias[];
  menuItemNutrition: RestaurantDomain.MenuItemNutrition[];
  nutritionEstimates: RestaurantDomain.NutritionEstimate[];
  nutritionReviews: RestaurantDomain.NutritionReview[];
};

export const mobileRestaurantMockAdapter = {
  getSnapshot(): MobileRestaurantMockSnapshot {
    return {
      restaurants: canonicalRestaurants,
      branches: canonicalBranches,
      menus: canonicalMenus,
      menuCategories: canonicalMenuCategories,
      menuItems: canonicalMenuItems,
      branchMenuItems: canonicalBranchMenuItems,
      menuItemAliases: canonicalMenuItemAliases,
      menuItemNutrition: canonicalMenuItemNutrition,
      nutritionEstimates: canonicalNutritionEstimates,
      nutritionReviews: canonicalNutritionReviews
    };
  }
};
