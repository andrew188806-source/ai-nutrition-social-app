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
import {
  isLiveConsumerComposition,
  readConsumerPublicRuntimeEnv
} from "../../features/consumer-runtime-config/consumerPublicRuntimeEnv";

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

const EMPTY_SNAPSHOT: MobileRestaurantMockSnapshot = Object.freeze({
  restaurants: [],
  branches: [],
  menus: [],
  menuCategories: [],
  menuItems: [],
  branchMenuItems: [],
  menuItemAliases: [],
  menuItemNutrition: [],
  nutritionEstimates: [],
  nutritionReviews: []
}) as MobileRestaurantMockSnapshot;

// GQA-6R C-1B: the SINGLE gate through which the mock restaurant platform reaches any Consumer screen.
// A live Consumer composition (real Supabase identity) receives these fixtures only when the catalogue
// source is EXPLICITLY "mock"; a missing, disabled or live catalogue source yields an empty snapshot, so
// no path — catalogue, next-meal carousel, display resolvers or Meal Buddy helpers — can present
// invented restaurants to a real user.
export function mockRestaurantPlatformAllowed(env: Readonly<Record<string, string | undefined>> = readConsumerPublicRuntimeEnv()): boolean {
  if (!isLiveConsumerComposition(env)) return true;
  return env.EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE === "mock";
}

export const mobileRestaurantMockAdapter = {
  getSnapshot(): MobileRestaurantMockSnapshot {
    if (!mockRestaurantPlatformAllowed()) return EMPTY_SNAPSHOT;
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
