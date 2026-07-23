import type {
  CatalogBranchViewModel,
  CatalogMenuCategoryViewModel,
  CatalogMenuItemViewModel,
  CatalogMenuViewModel,
  CatalogRestaurantViewModel
} from "./types";
import type { SupabaseRestaurantCatalogRow } from "./rowContract";

type MutableRestaurant = Omit<CatalogRestaurantViewModel, "branches"> & {
  branches: CatalogBranchViewModel[];
};
type MutableBranch = Omit<CatalogBranchViewModel, "menus"> & {
  menus: CatalogMenuViewModel[];
};
type MutableMenu = Omit<CatalogMenuViewModel, "categories"> & {
  categories: CatalogMenuCategoryViewModel[];
};
type MutableCategory = Omit<CatalogMenuCategoryViewModel, "items"> & {
  items: CatalogMenuItemViewModel[];
};

export function mapRestaurantCatalogRows(
  rows: readonly SupabaseRestaurantCatalogRow[]
): CatalogRestaurantViewModel[] {
  const restaurants = new Map<string, MutableRestaurant>();

  for (const row of rows) {
    const restaurantId = requiredString(row.restaurant_id, "restaurant_id");
    const branchId = requiredString(row.branch_id, "branch_id");
    const menuId = requiredString(row.menu_id, "menu_id");
    const menuCategoryId = requiredString(row.menu_category_id, "menu_category_id");
    const menuItemId = requiredString(row.menu_item_id, "menu_item_id");
    const branchMenuItemId = requiredString(row.branch_menu_item_id, "branch_menu_item_id");

    let restaurant = restaurants.get(restaurantId);
    if (!restaurant) {
      restaurant = {
        id: restaurantId,
        restaurantId,
        branchId,
        name: requiredString(row.restaurant_name, "restaurant_name"),
        location: optionalString(row.branch_district) ?? requiredString(row.restaurant_city, "restaurant_city"),
        address: optionalString(row.branch_address) ?? undefined,
        distanceDisplay: optionalString(row.branch_district) ?? requiredString(row.restaurant_city, "restaurant_city"),
        category: requiredString(row.restaurant_category, "restaurant_category"),
        tags: stringArray(row.restaurant_tags, "restaurant_tags"),
        priceRange: "NT$--",
        score: "—",
        menuItems: [],
        branches: []
      };
      restaurants.set(restaurantId, restaurant);
    }

    let branch = restaurant.branches.find((candidate) => candidate.branchId === branchId) as MutableBranch | undefined;
    if (!branch) {
      branch = {
        branchId,
        restaurantId,
        name: requiredString(row.branch_name, "branch_name"),
        district: optionalString(row.branch_district) ?? "",
        address: optionalString(row.branch_address) ?? "",
        menus: []
      };
      restaurant.branches.push(branch);
    }

    let menu = branch.menus.find((candidate) => candidate.menuId === menuId) as MutableMenu | undefined;
    if (!menu) {
      menu = {
        menuId,
        restaurantId,
        name: requiredString(row.menu_name, "menu_name"),
        categories: []
      };
      branch.menus.push(menu);
    }

    let category = menu.categories.find(
      (candidate) => candidate.menuCategoryId === menuCategoryId
    ) as MutableCategory | undefined;
    if (!category) {
      category = {
        menuCategoryId,
        menuId,
        name: requiredString(row.menu_category_name, "menu_category_name"),
        sortOrder: requiredNumber(row.menu_category_sort_order, "menu_category_sort_order"),
        items: []
      };
      menu.categories.push(category);
    }

    if (!category.items.some((candidate) => candidate.branchMenuItemId === branchMenuItemId)) {
      category.items.push(mapMenuItem(row, {
        restaurantId,
        branchId,
        menuId,
        menuCategoryId,
        menuItemId,
        branchMenuItemId
      }));
    }
  }

  const result = [...restaurants.values()];
  for (const restaurant of result) {
    restaurant.branches.sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));
    for (const branch of restaurant.branches) {
      for (const menu of branch.menus) {
        (menu.categories as MutableCategory[]).sort((left, right) => left.sortOrder - right.sortOrder);
      }
    }
    restaurant.branchId = restaurant.branches[0]?.branchId;
    restaurant.location = restaurant.branches[0]?.district || restaurant.location;
    restaurant.address = restaurant.branches[0]?.address || restaurant.address;
    restaurant.distanceDisplay = restaurant.location;
    restaurant.menuItems = flattenBranchItems(restaurant.branches[0]);
    restaurant.priceRange = priceRange(restaurant.menuItems);
  }
  return result.sort((left, right) => left.name.localeCompare(right.name, "zh-Hant"));
}

export function flattenBranchItems(
  branch: CatalogBranchViewModel | undefined
): CatalogMenuItemViewModel[] {
  return branch?.menus.flatMap((menu) => menu.categories.flatMap((category) => category.items)) ?? [];
}

export function findCatalogMenuItem(
  restaurants: readonly CatalogRestaurantViewModel[],
  menuItemId: string
): CatalogMenuItemViewModel | null {
  for (const restaurant of restaurants) {
    for (const branch of restaurant.branches) {
      const item = flattenBranchItems(branch).find((candidate) => candidate.menuItemId === menuItemId);
      if (item) return item;
    }
  }
  return null;
}

function mapMenuItem(
  row: SupabaseRestaurantCatalogRow,
  ids: {
    restaurantId: string;
    branchId: string;
    menuId: string;
    menuCategoryId: string;
    menuItemId: string;
    branchMenuItemId: string;
  }
): CatalogMenuItemViewModel {
  const nutritionSource = publicNutritionSource(row.nutrition_source_public);
  const publishedNutrition = nutritionSource
    ? {
        calories: nullableNumber(row.calories, "calories"),
        protein: nullableNumber(row.protein, "protein"),
        carbohydrates: nullableNumber(row.carbohydrates, "carbohydrates"),
        fat: nullableNumber(row.fat, "fat"),
        fiber: nullableNumber(row.fiber, "fiber"),
        sugar: nullableNumber(row.sugar, "sugar"),
        sodium: nullableNumber(row.sodium, "sodium"),
        saturatedFat: nullableNumber(row.saturated_fat, "saturated_fat"),
        servingSize: optionalString(row.serving_size),
        source: nutritionSource,
        updatedAt: requiredString(row.nutrition_updated_at, "nutrition_updated_at")
      }
    : null;
  const verificationStatus =
    nutritionSource === "restaurant_confirmed" || nutritionSource === "platform_reviewed"
      ? "restaurant_verified"
      : nutritionSource === "ai_estimated"
        ? "ai_estimated"
        : "pending_review";

  return {
    ...ids,
    name: requiredString(row.menu_item_name, "menu_item_name"),
    description: optionalString(row.menu_item_description) ?? "",
    allergens: stringArray(row.menu_item_allergens, "menu_item_allergens"),
    calories: publishedNutrition?.calories ?? 0,
    protein: publishedNutrition?.protein ?? 0,
    carbs: publishedNutrition?.carbohydrates ?? 0,
    fat: publishedNutrition?.fat ?? 0,
    fiber: publishedNutrition?.fiber ?? undefined,
    price: requiredNumber(row.branch_price, "branch_price"),
    tags: stringArray(row.menu_item_tags, "menu_item_tags"),
    image: optionalString(row.menu_item_image_url) ?? undefined,
    emoji: "TK",
    source: "restaurant_menu",
    verificationStatus,
    availability: branchAvailability(row.branch_availability),
    nutritionSourceLabel: nutritionSource ?? "missing",
    publishedNutrition
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Catalog row field ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Catalog optional string field is malformed.");
  const normalized = value.trim();
  return normalized || null;
}

function requiredNumber(value: unknown, field: string): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") {
    throw new Error(`Catalog row field ${field} must be numeric.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Catalog row field ${field} must be finite.`);
  return parsed;
}

function nullableNumber(value: unknown, field: string): number | null {
  return value == null ? null : requiredNumber(value, field);
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Catalog row field ${field} must be a string array.`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function publicNutritionSource(
  value: unknown
): "ai_estimated" | "restaurant_confirmed" | "platform_reviewed" | null {
  if (value == null) return null;
  if (value === "ai_estimated" || value === "restaurant_confirmed" || value === "platform_reviewed") {
    return value;
  }
  throw new Error("Catalog nutrition provenance is not public-safe.");
}

function branchAvailability(value: unknown): "available" | "limited" {
  if (value === "available" || value === "limited") return value;
  throw new Error("Catalog branch availability is invalid.");
}

function priceRange(items: readonly { price: number }[]): string {
  const prices = items.map((item) => item.price).filter((price) => price > 0);
  if (!prices.length) return "NT$--";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `NT$${min}` : `NT$${min}-${max}`;
}
