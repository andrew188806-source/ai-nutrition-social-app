import type {
  BranchMenuItem,
  Menu,
  MenuCategory,
  MenuItem,
  MenuItemAlias,
  MenuItemNutrition,
  Restaurant,
  RestaurantBranch
} from "@haocu/shared/domain/restaurantDomain";

export interface RestaurantExposureAnalyticsSummary {
  restaurantId: string;
  source: string;
  impressions: number;
  clicks: number;
  storePageViews: number;
  newUserReach: number;
}

export interface NutritionBadgePerformanceSummary {
  restaurantId: string;
  menuItemId: string;
  beforeViews: number;
  afterViews: number;
  beforeAddToCart: number;
  afterAddToCart: number;
}

export interface MenuItemPerformanceSummary {
  restaurantId: string;
  menuItemId: string;
  views: number;
  favorites: number;
  addToCart: number;
  recommendationImpressions: number;
}

export interface RestaurantReadRepository {
  getRestaurant(restaurantId: string): Promise<Restaurant | null>;
  listRestaurants(): Promise<Restaurant[]>;
  listRestaurantBranches(restaurantId: string): Promise<RestaurantBranch[]>;
  getBranch(branchId: string): Promise<RestaurantBranch | null>;
  listMenus(restaurantId: string): Promise<Menu[]>;
  listMenuCategories(menuId: string): Promise<MenuCategory[]>;
  listMenuItems(restaurantId: string): Promise<MenuItem[]>;
  listBranchMenuItems(restaurantId: string): Promise<BranchMenuItem[]>;
  listMenuItemAliases(restaurantId: string): Promise<MenuItemAlias[]>;
  getCurrentPublishedNutrition(menuItemId: string): Promise<MenuItemNutrition | null>;
  listCurrentPublishedNutrition(restaurantId: string): Promise<MenuItemNutrition[]>;
  getRestaurantDashboardSummary(restaurantId: string): Promise<RestaurantExposureAnalyticsSummary[]>;
  getRestaurantExposureAnalytics(restaurantId: string): Promise<RestaurantExposureAnalyticsSummary[]>;
  getNutritionBadgePerformance(restaurantId: string): Promise<NutritionBadgePerformanceSummary[]>;
  getMenuItemPerformance(restaurantId: string): Promise<MenuItemPerformanceSummary[]>;
}
