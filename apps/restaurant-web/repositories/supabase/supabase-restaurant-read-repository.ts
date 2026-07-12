import { SupabaseQueryError } from "../../adapters/supabase/errors";
import {
  mapBranchMenuItemRow,
  mapMenuCategoryRow,
  mapMenuItemAliasRow,
  mapMenuItemNutritionRow,
  mapMenuItemRow,
  mapMenuRow,
  mapRestaurantBranchRow,
  mapRestaurantRow
} from "../../adapters/supabase/mappers";
import type { ReadonlyDatabaseClient } from "../../adapters/supabase/readonly-database-client";
import type {
  BranchMenuItemRow,
  MenuCategoryRow,
  MenuItemAliasRow,
  MenuItemNutritionRow,
  MenuItemPerformanceRow,
  MenuItemRow,
  MenuRow,
  NutritionBadgePerformanceRow,
  RestaurantBranchRow,
  RestaurantExposureSummaryRow,
  RestaurantRow
} from "../../adapters/supabase/rows";
import type {
  MenuItemPerformanceSummary,
  NutritionBadgePerformanceSummary,
  RestaurantExposureAnalyticsSummary,
  RestaurantReadRepository
} from "../restaurant-read-repository";

function num(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function mapExposure(row: RestaurantExposureSummaryRow): RestaurantExposureAnalyticsSummary {
  return {
    restaurantId: row.restaurant_id,
    source: row.source,
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    storePageViews: num(row.store_page_views),
    newUserReach: num(row.new_user_reach)
  };
}

function mapNutritionBadgePerformance(row: NutritionBadgePerformanceRow): NutritionBadgePerformanceSummary {
  return {
    restaurantId: row.restaurant_id,
    menuItemId: row.menu_item_id,
    beforeViews: num(row.before_views),
    afterViews: num(row.after_views),
    beforeAddToCart: num(row.before_add_to_cart),
    afterAddToCart: num(row.after_add_to_cart)
  };
}

function mapMenuItemPerformance(row: MenuItemPerformanceRow): MenuItemPerformanceSummary {
  return {
    restaurantId: row.restaurant_id,
    menuItemId: row.menu_item_id,
    views: num(row.views),
    favorites: num(row.favorites),
    addToCart: num(row.add_to_cart),
    recommendationImpressions: num(row.recommendation_impressions)
  };
}

function firstOrNull<T>(rows: T[]): T | null {
  if (rows.length > 1) throw new SupabaseQueryError("Expected at most one readonly row.");
  return rows[0] ?? null;
}

export function createSupabaseRestaurantReadRepository(client: ReadonlyDatabaseClient): RestaurantReadRepository {
  return {
    async getRestaurant(restaurantId) {
      const rows = await client.select<RestaurantRow[]>("restaurants", { filters: [{ field: "id", operator: "eq", value: restaurantId }], limit: 1, operation: "getRestaurant" });
      const row = firstOrNull(rows);
      return row ? mapRestaurantRow(row) : null;
    },
    async listRestaurants() {
      const rows = await client.select<RestaurantRow[]>("restaurants", { order: { field: "name" }, operation: "listRestaurants" });
      return rows.map(mapRestaurantRow);
    },
    async listRestaurantBranches(restaurantId) {
      const rows = await client.select<RestaurantBranchRow[]>("restaurant_branches", {
        filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }],
        order: { field: "name" },
        operation: "listRestaurantBranches"
      });
      return rows.map(mapRestaurantBranchRow);
    },
    async getBranch(branchId) {
      const rows = await client.select<RestaurantBranchRow[]>("restaurant_branches", { filters: [{ field: "id", operator: "eq", value: branchId }], limit: 1, operation: "getBranch" });
      const row = firstOrNull(rows);
      return row ? mapRestaurantBranchRow(row) : null;
    },
    async listMenus(restaurantId) {
      const rows = await client.select<MenuRow[]>("menus", { filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }], order: { field: "name" }, operation: "listMenus" });
      return rows.map(mapMenuRow);
    },
    async listMenuCategories(menuId) {
      const rows = await client.select<MenuCategoryRow[]>("menu_categories", { filters: [{ field: "menu_id", operator: "eq", value: menuId }], order: { field: "sort_order" }, operation: "listMenuCategories" });
      return rows.map(mapMenuCategoryRow);
    },
    async listMenuItems(restaurantId) {
      const rows = await client.select<MenuItemRow[]>("menu_items", { filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }], order: { field: "name" }, operation: "listMenuItems" });
      return rows.map(mapMenuItemRow);
    },
    async listBranchMenuItems(restaurantId) {
      const rows = await client.select<BranchMenuItemRow[]>("branch_menu_items", { filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }], operation: "listBranchMenuItems" });
      return rows.map(mapBranchMenuItemRow);
    },
    async listMenuItemAliases(restaurantId) {
      const rows = await client.select<MenuItemAliasRow[]>("menu_item_aliases", { filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }], operation: "listMenuItemAliases" });
      return rows.map(mapMenuItemAliasRow);
    },
    async getCurrentPublishedNutrition(menuItemId) {
      const rows = await client.select<MenuItemNutritionRow[]>("current_published_menu_item_nutrition", { filters: [{ field: "menu_item_id", operator: "eq", value: menuItemId }], limit: 1, operation: "getCurrentPublishedNutrition" });
      const row = firstOrNull(rows);
      return row ? mapMenuItemNutritionRow(row) : null;
    },
    async listCurrentPublishedNutrition(restaurantId) {
      const rows = await client.select<MenuItemNutritionRow[]>("current_published_menu_item_nutrition", { filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }], operation: "listCurrentPublishedNutrition" });
      return rows.map(mapMenuItemNutritionRow);
    },
    async getRestaurantDashboardSummary(restaurantId) {
      const rows = await client.select<RestaurantExposureSummaryRow[]>("restaurant_exposure_summary", {
        filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }],
        operation: "getRestaurantDashboardSummary",
        accessToken: undefined
      });
      return rows.map(mapExposure);
    },
    async getRestaurantExposureAnalytics(restaurantId) {
      const rows = await client.select<RestaurantExposureSummaryRow[]>("restaurant_exposure_summary", {
        filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }],
        operation: "getRestaurantExposureAnalytics",
        accessToken: undefined
      });
      return rows.map(mapExposure);
    },
    async getNutritionBadgePerformance(restaurantId) {
      const rows = await client.select<NutritionBadgePerformanceRow[]>("nutrition_badge_performance", {
        filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }],
        operation: "getNutritionBadgePerformance",
        accessToken: undefined
      });
      return rows.map(mapNutritionBadgePerformance);
    },
    async getMenuItemPerformance(restaurantId) {
      const rows = await client.select<MenuItemPerformanceRow[]>("menu_item_performance", {
        filters: [{ field: "restaurant_id", operator: "eq", value: restaurantId }],
        operation: "getMenuItemPerformance",
        accessToken: undefined
      });
      return rows.map(mapMenuItemPerformance);
    }
  };
}