import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listMenus(restaurantId = "restaurant-haochu-bowl") {
  return restaurantConsoleMockAdapter.menus.filter((menu) => menu.restaurantId === restaurantId);
}

export function listMenuCategories(menuId = "menu-haochu-main") {
  return restaurantConsoleMockAdapter.menuCategories.filter((category) => category.menuId === menuId);
}

export function listMenuItems(restaurantId = "restaurant-haochu-bowl") {
  return restaurantConsoleMockAdapter.menuItems.filter((item) => item.restaurantId === restaurantId);
}

export function getMenuItemById(menuItemId: string | undefined | null) {
  if (!menuItemId) return null;
  return restaurantConsoleMockAdapter.menuItems.find((item) => item.id === menuItemId) ?? null;
}

export function listBranchMenuItems(restaurantId = "restaurant-haochu-bowl") {
  return restaurantConsoleMockAdapter.branchMenuItems.filter((item) => item.restaurantId === restaurantId);
}

export function listMenuItemAliases(restaurantId = "restaurant-haochu-bowl") {
  return restaurantConsoleMockAdapter.menuItemAliases.filter((alias) => alias.restaurantId === restaurantId);
}
