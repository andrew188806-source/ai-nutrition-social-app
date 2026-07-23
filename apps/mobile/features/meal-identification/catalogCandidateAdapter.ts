import type { CatalogRestaurantViewModel } from "../restaurants/catalog";
import type { CatalogMealIdentificationCandidate } from "./types";

export function adaptRestaurantCatalogCandidates(
  restaurants: readonly CatalogRestaurantViewModel[],
  source: CatalogMealIdentificationCandidate["source"]
): CatalogMealIdentificationCandidate[] {
  return restaurants.flatMap((restaurant) =>
    restaurant.branches.flatMap((branch) =>
      branch.menus.flatMap((menu) =>
        menu.categories.flatMap((category) =>
          category.items.map((item) => ({
            kind: "catalog_item" as const,
            identity: {
              restaurantId: restaurant.restaurantId,
              branchId: branch.branchId,
              menuId: menu.menuId,
              menuCategoryId: category.menuCategoryId,
              menuItemId: item.menuItemId,
              branchMenuItemId: item.branchMenuItemId
            },
            source,
            restaurantName: restaurant.name,
            branchName: branch.name,
            branchContext: [branch.district, branch.address].filter(Boolean).join(" · "),
            menuName: menu.name,
            menuCategoryName: category.name,
            mealItemName: item.name,
            price: item.price,
            availability: item.availability,
            nutritionProvenance: item.publishedNutrition?.source ?? "missing",
            confidence: null,
            matchReason: "active_public_catalog_offer",
            tags: item.tags
          }))
        )
      )
    )
  );
}
