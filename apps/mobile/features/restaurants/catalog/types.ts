import type { RecommendedMenuItemViewModel, RestaurantCardViewModel } from "../../../view-models/restaurant-view-models";

export type RestaurantCatalogSource = "disabled" | "mock" | "supabase";

export type RestaurantCatalogRuntimeFlags = {
  source: RestaurantCatalogSource;
  issues: readonly string[];
};

export type CatalogMenuItemViewModel = RecommendedMenuItemViewModel & {
  menuId: string;
  menuCategoryId: string;
  description: string;
  allergens: readonly string[];
  publishedNutrition: {
    calories: number | null;
    protein: number | null;
    carbohydrates: number | null;
    fat: number | null;
    fiber: number | null;
    sugar: number | null;
    sodium: number | null;
    saturatedFat: number | null;
    servingSize: string | null;
    source: "ai_estimated" | "restaurant_confirmed" | "platform_reviewed";
    updatedAt: string;
  } | null;
};

export type CatalogMenuCategoryViewModel = {
  menuCategoryId: string;
  menuId: string;
  name: string;
  sortOrder: number;
  items: readonly CatalogMenuItemViewModel[];
};

export type CatalogMenuViewModel = {
  menuId: string;
  restaurantId: string;
  name: string;
  categories: readonly CatalogMenuCategoryViewModel[];
};

export type CatalogBranchViewModel = {
  branchId: string;
  restaurantId: string;
  name: string;
  district: string;
  address: string;
  menus: readonly CatalogMenuViewModel[];
};

export type CatalogRestaurantViewModel = RestaurantCardViewModel & {
  branches: readonly CatalogBranchViewModel[];
};

export type RestaurantCatalogResult =
  | { status: "available"; restaurants: readonly CatalogRestaurantViewModel[]; source: RestaurantCatalogSource }
  | { status: "empty"; restaurants: readonly []; source: RestaurantCatalogSource }
  | { status: "unavailable"; source: "disabled"; message: string }
  | { status: "error"; source: RestaurantCatalogSource; message: string; retryable: boolean };

export type RestaurantCatalogUiState =
  | { status: "loading"; restaurants: readonly []; source: RestaurantCatalogSource }
  | { status: "success"; restaurants: readonly CatalogRestaurantViewModel[]; source: RestaurantCatalogSource }
  | { status: "empty"; restaurants: readonly []; source: RestaurantCatalogSource }
  | { status: "unavailable"; restaurants: readonly []; source: "disabled"; message: string }
  | { status: "error"; restaurants: readonly []; source: RestaurantCatalogSource; message: string; retryable: boolean };
