import type { BranchMenuItem, MenuItem } from "@haocu/shared/domain/restaurantDomain";
import { getBranchById, listBranches } from "../repositories/branch-repository";
import { getMenuItemById, listBranchMenuItems, listMenuCategories, listMenuItemAliases, listMenuItems, listMenus } from "../repositories/menu-repository";
import { listMenuItemIngredients, listMenuItemNutrition } from "../repositories/nutrition-repository";

export const nutritionBadgeStatusLabels = {
  approved: "已審核",
  ai_estimated: "AI 估算",
  pending_review: "待審核",
  missing: "未填寫"
} as const;

export function getMenuItemName(menuItemId?: string | null) {
  return getMenuItemById(menuItemId)?.name ?? "未對應餐點";
}

export function getBranchName(branchId?: string | null) {
  return getBranchById(branchId)?.name ?? "全部分店";
}

export function getMenuCatalog() {
  return {
    menus: listMenus(),
    categories: listMenuCategories(),
    branches: listBranches(),
    menuItems: listMenuItems(),
    branchMenuItems: listBranchMenuItems(),
    aliases: listMenuItemAliases(),
    nutrition: listMenuItemNutrition(),
    ingredients: listMenuItemIngredients()
  };
}

export function getBranchMenuItemsForMenuItem(menuItemId: string) {
  return listBranchMenuItems().filter((branchItem) => branchItem.menuItemId === menuItemId);
}

export function getPrimaryBranchMenuItem(menuItemId: string) {
  const branchItems = getBranchMenuItemsForMenuItem(menuItemId);
  return branchItems.find((item) => item.availability !== "unavailable") ?? branchItems[0] ?? null;
}

export function getBranchNamesForMenuItem(menuItemId: string) {
  return getBranchMenuItemsForMenuItem(menuItemId).map((item) => getBranchName(item.branchId)).join("、");
}

export function isMenuItemAvailable(menuItemId: string) {
  return getBranchMenuItemsForMenuItem(menuItemId).some((item) => item.availability !== "unavailable" && !item.soldOut && item.branchSpecificStatus === "available");
}

export function getMenuItemCategoryName(item: MenuItem) {
  return listMenuCategories().find((category) => category.id === item.menuCategoryId)?.name ?? "未分類";
}

export function getDisplayPrice(branchItem: BranchMenuItem | null) {
  return branchItem?.price ?? 0;
}
