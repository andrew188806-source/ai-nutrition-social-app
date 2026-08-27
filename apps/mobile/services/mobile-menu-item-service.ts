import { menuItemRepository, normalizeMenuName } from "../repositories/menu-item-repository";
import { restaurantRepository } from "../repositories/restaurant-repository";
import { buildPriceRange, toRecommendedMenuItemViewModel } from "./mappers/mobile-restaurant-mappers";
import type { AliasResolutionViewModel, NextMealRecommendationViewModel, RecommendedMenuItemViewModel } from "../view-models/restaurant-view-models";

export type NextMealCandidateInput = Omit<NextMealRecommendationViewModel, "reason" | "matchPercent">;

function buildRecommendationReason(calories: number, protein: number, referenceCalories: number): string {
  if (protein >= 25) return "High-protein option from canonical menu nutrition.";
  if (Math.abs(calories - referenceCalories) <= 80) return "Calories are close to the current meal context.";
  return "Balanced canonical menu item for the next meal.";
}

function buildMatchPercent(calories: number, referenceCalories: number): number {
  const delta = Math.abs(calories - referenceCalories);
  return Math.max(70, Math.min(99, 100 - Math.round(delta / 8)));
}

export const mobileMenuItemService = {
  listMenuItemsForRestaurant(restaurantId: string, branchId?: string): RecommendedMenuItemViewModel[] {
    const branchItems = menuItemRepository.listBranchMenuItems(restaurantId, branchId);
    const branchItemsByMenuItemId = new Map(branchItems.map((item) => [item.menuItemId, item]));
    return menuItemRepository
      .listMenuItems(restaurantId)
      .map((menuItem) => toRecommendedMenuItemViewModel(menuItem, branchItemsByMenuItemId.get(menuItem.id) ?? menuItemRepository.findBranchMenuItem(menuItem.id, branchId)))
      .filter((item) => item.availability !== "unavailable");
  },

  findMenuItemById(menuItemId: string | undefined | null): RecommendedMenuItemViewModel | null {
    const menuItem = menuItemRepository.findMenuItemById(menuItemId);
    if (!menuItem) return null;
    return toRecommendedMenuItemViewModel(menuItem, menuItemRepository.findBranchMenuItem(menuItem.id));
  },

  getPrimaryMenuItemForRestaurant(restaurantId: string | undefined | null): RecommendedMenuItemViewModel | null {
    if (!restaurantId) return null;
    return this.listMenuItemsForRestaurant(restaurantId)[0] ?? null;
  },

  listNextMealCandidateInputs(): NextMealCandidateInput[] {
    const rows = restaurantRepository.listRestaurants().flatMap((restaurant) => {
      const branch = restaurantRepository.getPrimaryBranch(restaurant.id);
      const items = this.listMenuItemsForRestaurant(restaurant.id, branch?.id);
      const distance = branch ? `${branch.district}` : restaurant.city;
      return items.map((item) => ({
        menuItemId: item.menuItemId,
        restaurantId: restaurant.id,
        branchId: item.branchId ?? branch?.id,
        branchMenuItemId: item.branchMenuItemId,
        dishName: item.name,
        calories: item.calories,
        protein: item.protein,
        restaurantName: restaurant.name,
        distance,
        emoji: item.emoji ?? "TK"
      }));
    });

    return rows.sort((left, right) =>
      (left.branchMenuItemId ?? left.menuItemId).localeCompare(
        right.branchMenuItemId ?? right.menuItemId
      )
    );
  },

  getRecommendedMenuItemsForNextMeal(limit: number, referenceCalories: number): NextMealRecommendationViewModel[] {
    const rows = this.listNextMealCandidateInputs().map((item) => ({
      ...item,
      reason: buildRecommendationReason(item.calories, item.protein, referenceCalories),
      matchPercent: buildMatchPercent(item.calories, referenceCalories)
    }));

    return rows.sort((a, b) =>
      Math.abs(a.calories - referenceCalories) - Math.abs(b.calories - referenceCalories)
      || (a.branchMenuItemId ?? a.menuItemId).localeCompare(b.branchMenuItemId ?? b.menuItemId)
    ).slice(0, limit);
  },

  resolveAlias(inputName: string): AliasResolutionViewModel {
    const alias = menuItemRepository.findAliasByInput(inputName);
    if (alias) {
      return {
        matched: true,
        menuItemId: alias.menuItemId,
        aliasId: alias.id,
        confidenceScore: alias.confidenceScore
      };
    }

    const normalized = normalizeMenuName(inputName);
    const menuItem = menuItemRepository.listMenuItems().find((item) => normalizeMenuName(item.name) === normalized);
    if (menuItem) {
      return {
        matched: true,
        menuItemId: menuItem.id,
        confidenceScore: 1
      };
    }

    return {
      matched: false,
      unresolvedInput: inputName
    };
  },

  getPriceRangeForRestaurant(restaurantId: string, branchId?: string) {
    return buildPriceRange(this.listMenuItemsForRestaurant(restaurantId, branchId));
  }
};
