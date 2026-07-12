import { adminRestaurantMockAdapter } from "../adapters/mock/admin-restaurant-mock-adapter";

export function getAdminCanonicalSnapshot() {
  return adminRestaurantMockAdapter.getSnapshot();
}

export function findRestaurantName(restaurantId: string) {
  return getAdminCanonicalSnapshot().restaurants.find((restaurant) => restaurant.id === restaurantId)?.name ?? restaurantId;
}

export function findBranchName(branchId: string | undefined) {
  if (!branchId) return undefined;
  return getAdminCanonicalSnapshot().branches.find((branch) => branch.id === branchId)?.name ?? branchId;
}

export function findMenuItemName(menuItemId: string | undefined) {
  if (!menuItemId) return undefined;
  return getAdminCanonicalSnapshot().menuItems.find((menuItem) => menuItem.id === menuItemId)?.name ?? menuItemId;
}
