import type { RestaurantDomain } from "@haocu/shared/domain";
import { mobileRestaurantMockAdapter } from "../adapters/mock/mobile-restaurant-mock-adapter";

function snapshot() {
  return mobileRestaurantMockAdapter.getSnapshot();
}

function visibleBranchItem(branchMenuItem: RestaurantDomain.BranchMenuItem) {
  return branchMenuItem.branchSpecificStatus !== "hidden";
}

export const menuItemRepository = {
  listMenuItems(restaurantId?: string): RestaurantDomain.MenuItem[] {
    const items = snapshot().menuItems.filter((item) => item.status === "active");
    return restaurantId ? items.filter((item) => item.restaurantId === restaurantId) : items;
  },

  findMenuItemById(menuItemId: string | undefined | null): RestaurantDomain.MenuItem | null {
    if (!menuItemId) return null;
    return snapshot().menuItems.find((item) => item.id === menuItemId) ?? null;
  },

  listBranchMenuItems(restaurantId: string, branchId?: string): RestaurantDomain.BranchMenuItem[] {
    return snapshot().branchMenuItems.filter((item) => item.restaurantId === restaurantId && (!branchId || item.branchId === branchId) && visibleBranchItem(item));
  },

  findBranchMenuItem(menuItemId: string, branchId?: string): RestaurantDomain.BranchMenuItem | null {
    const items = snapshot().branchMenuItems.filter((item) => item.menuItemId === menuItemId && (!branchId || item.branchId === branchId) && visibleBranchItem(item));
    return items[0] ?? null;
  },

  listAliases(): RestaurantDomain.MenuItemAlias[] {
    return snapshot().menuItemAliases;
  },

  listApprovedAliases(): RestaurantDomain.MenuItemAlias[] {
    return snapshot().menuItemAliases.filter((alias) => alias.status === "approved");
  },

  findAliasByInput(inputName: string): RestaurantDomain.MenuItemAlias | null {
    const normalized = normalizeMenuName(inputName);
    if (!normalized) return null;
    return (
      snapshot().menuItemAliases.find((alias) => alias.normalizedAliasName === normalized || normalizeMenuName(alias.aliasName) === normalized) ??
      snapshot().menuItemAliases.find((alias) => normalizeMenuName(alias.aliasName).includes(normalized) || normalized.includes(normalizeMenuName(alias.aliasName))) ??
      null
    );
  }
};

export function normalizeMenuName(inputName: string | undefined | null) {
  return (inputName ?? "").trim().toLowerCase().replace(/\s+/g, "");
}
