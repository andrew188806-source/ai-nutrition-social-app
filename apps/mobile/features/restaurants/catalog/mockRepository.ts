import type { RestaurantDomain } from "@haocu/shared/domain";
import { mobileRestaurantMockAdapter } from "../../../adapters/mock/mobile-restaurant-mock-adapter";
import { mapRestaurantCatalogRows } from "./mapper";
import type { RestaurantCatalogRepository } from "./ports";
import type { SupabaseRestaurantCatalogRow } from "./rowContract";

export class MockRestaurantCatalogRepository implements RestaurantCatalogRepository {
  readonly source = "mock" as const;

  async listCatalog() {
    try {
      const restaurants = mapRestaurantCatalogRows(snapshotRows());
      return restaurants.length
        ? { status: "available" as const, restaurants, source: this.source }
        : { status: "empty" as const, restaurants: [] as const, source: this.source };
    } catch {
      return {
        status: "error" as const,
        source: this.source,
        message: "Mock restaurant catalog data is malformed.",
        retryable: false
      };
    }
  }
}

export function snapshotRows(): SupabaseRestaurantCatalogRow[] {
  const snapshot = mobileRestaurantMockAdapter.getSnapshot();
  return snapshot.restaurants
    .filter((restaurant) => restaurant.status === "active")
    .flatMap((restaurant) => {
      const menus = snapshot.menus.filter(
        (menu) => menu.restaurantId === restaurant.id && menu.status === "active"
      );
      const branches = snapshot.branches.filter(
        (branch) => branch.restaurantId === restaurant.id && branch.isActive
      );
      return branches.flatMap((branch) =>
        menus.flatMap((menu) =>
          snapshot.menuCategories
            .filter((category) => category.menuId === menu.id)
            .flatMap((category) =>
              snapshot.menuItems
                .filter(
                  (item) =>
                    item.restaurantId === restaurant.id &&
                    item.menuCategoryId === category.id &&
                    item.status === "active"
                )
                .flatMap((item) => {
                  const branchItem = snapshot.branchMenuItems.find(
                    (candidate) =>
                      candidate.restaurantId === restaurant.id &&
                      candidate.branchId === branch.id &&
                      candidate.menuItemId === item.id &&
                      candidate.branchSpecificStatus !== "hidden" &&
                      candidate.availability !== "unavailable" &&
                      !candidate.soldOut
                  );
                  return branchItem
                    ? [toRow(restaurant, branch, menu, category, item, branchItem, snapshot.menuItemNutrition)]
                    : [];
                })
            )
        )
      );
    });
}

function toRow(
  restaurant: RestaurantDomain.Restaurant,
  branch: RestaurantDomain.RestaurantBranch,
  menu: RestaurantDomain.Menu,
  category: RestaurantDomain.MenuCategory,
  item: RestaurantDomain.MenuItem,
  branchItem: RestaurantDomain.BranchMenuItem,
  nutritionRows: readonly RestaurantDomain.MenuItemNutrition[]
): SupabaseRestaurantCatalogRow {
  const nutrition = nutritionRows.find((candidate) => candidate.menuItemId === item.id);
  const publicSource =
    nutrition?.source === "ai_estimated"
      ? "ai_estimated"
      : nutrition?.source === "restaurant_verified"
        ? "restaurant_confirmed"
        : nutrition?.source === "admin_verified"
          ? "platform_reviewed"
          : null;
  return {
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    restaurant_city: restaurant.city,
    restaurant_category: restaurant.category,
    restaurant_tags: restaurant.tags,
    branch_id: branch.id,
    branch_name: branch.name,
    branch_district: branch.district,
    branch_address: branch.address,
    menu_id: menu.id,
    menu_name: menu.name,
    menu_category_id: category.id,
    menu_category_name: category.name,
    menu_category_sort_order: category.sortOrder,
    branch_menu_item_id: branchItem.id,
    menu_item_id: item.id,
    menu_item_name: branchItem.branchSpecificName ?? item.name,
    menu_item_description: branchItem.branchSpecificDescription ?? item.description,
    menu_item_image_url: item.imageUrl ?? null,
    menu_item_tags: item.tagIds,
    menu_item_allergens: item.allergens,
    branch_price: branchItem.price,
    branch_availability: branchItem.availability,
    calories: publicSource ? nutrition?.calories ?? null : null,
    protein: publicSource ? nutrition?.protein ?? null : null,
    carbohydrates: publicSource ? nutrition?.carbohydrates ?? null : null,
    fat: publicSource ? nutrition?.fat ?? null : null,
    fiber: publicSource ? nutrition?.fiber ?? null : null,
    sugar: publicSource ? nutrition?.sugar ?? null : null,
    sodium: publicSource ? nutrition?.sodium ?? null : null,
    saturated_fat: publicSource ? nutrition?.saturatedFat ?? null : null,
    serving_size: publicSource ? nutrition?.servingSize ?? null : null,
    nutrition_source_public: publicSource,
    nutrition_updated_at: publicSource ? nutrition?.updatedAt ?? null : null
  };
}
