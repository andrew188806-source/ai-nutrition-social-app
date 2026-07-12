import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";
import type {
  MenuItemPerformanceSummary,
  NutritionBadgePerformanceSummary,
  RestaurantExposureAnalyticsSummary,
  RestaurantReadRepository
} from "./restaurant-read-repository";

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function createMockRestaurantReadRepository(): RestaurantReadRepository {
  return {
    async getRestaurant(restaurantId) {
      return restaurantConsoleMockAdapter.restaurants.find((restaurant) => restaurant.id === restaurantId) ?? null;
    },
    async listRestaurants() {
      return restaurantConsoleMockAdapter.restaurants;
    },
    async listRestaurantBranches(restaurantId) {
      return restaurantConsoleMockAdapter.branches.filter((branch) => branch.restaurantId === restaurantId);
    },
    async getBranch(branchId) {
      return restaurantConsoleMockAdapter.branches.find((branch) => branch.id === branchId) ?? null;
    },
    async listMenus(restaurantId) {
      return restaurantConsoleMockAdapter.menus.filter((menu) => menu.restaurantId === restaurantId);
    },
    async listMenuCategories(menuId) {
      return restaurantConsoleMockAdapter.menuCategories.filter((category) => category.menuId === menuId);
    },
    async listMenuItems(restaurantId) {
      return restaurantConsoleMockAdapter.menuItems.filter((item) => item.restaurantId === restaurantId);
    },
    async listBranchMenuItems(restaurantId) {
      return restaurantConsoleMockAdapter.branchMenuItems.filter((item) => item.restaurantId === restaurantId);
    },
    async listMenuItemAliases(restaurantId) {
      return restaurantConsoleMockAdapter.menuItemAliases.filter((alias) => alias.restaurantId === restaurantId);
    },
    async getCurrentPublishedNutrition(menuItemId) {
      return restaurantConsoleMockAdapter.menuItemNutrition.find((nutrition) => nutrition.menuItemId === menuItemId && nutrition.verifiedStatus === "verified") ?? null;
    },
    async listCurrentPublishedNutrition(restaurantId) {
      const menuItemIds = new Set(restaurantConsoleMockAdapter.menuItems.filter((item) => item.restaurantId === restaurantId).map((item) => item.id));
      return restaurantConsoleMockAdapter.menuItemNutrition.filter((nutrition) => menuItemIds.has(nutrition.menuItemId) && nutrition.verifiedStatus === "verified");
    },
    async getRestaurantDashboardSummary(restaurantId) {
      return buildExposureSummary(restaurantId);
    },
    async getRestaurantExposureAnalytics(restaurantId) {
      return buildExposureSummary(restaurantId);
    },
    async getNutritionBadgePerformance(restaurantId) {
      return buildNutritionBadgePerformance(restaurantId);
    },
    async getMenuItemPerformance(restaurantId) {
      return buildMenuItemPerformance(restaurantId);
    }
  };
}

function buildExposureSummary(restaurantId: string): RestaurantExposureAnalyticsSummary[] {
  const bySource = new Map<string, RestaurantExposureAnalyticsSummary>();
  for (const event of restaurantConsoleMockAdapter.analyticsEvents.filter((item) => item.restaurantId === restaurantId)) {
    const current = bySource.get(event.source) ?? { restaurantId, source: event.source, impressions: 0, clicks: 0, storePageViews: 0, newUserReach: 0 };
    current.impressions += toNumber(event.metadata.count);
    current.clicks += toNumber(event.metadata.clicks);
    current.storePageViews += toNumber(event.metadata.storePageViews);
    current.newUserReach += toNumber(event.metadata.newUserReach);
    bySource.set(event.source, current);
  }
  return [...bySource.values()];
}

function buildNutritionBadgePerformance(restaurantId: string): NutritionBadgePerformanceSummary[] {
  return restaurantConsoleMockAdapter.menuItems
    .filter((item) => item.restaurantId === restaurantId)
    .map((item) => ({ restaurantId, menuItemId: item.id, beforeViews: 0, afterViews: 0, beforeAddToCart: 0, afterAddToCart: 0 }));
}

function buildMenuItemPerformance(restaurantId: string): MenuItemPerformanceSummary[] {
  return restaurantConsoleMockAdapter.menuItems
    .filter((item) => item.restaurantId === restaurantId)
    .map((item) => ({ restaurantId, menuItemId: item.id, views: 0, favorites: 0, addToCart: 0, recommendationImpressions: 0 }));
}
