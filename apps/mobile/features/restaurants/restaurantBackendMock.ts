// DEMO_ONLY compatibility facade:
// Existing Mobile screens still import these names, but the data now flows through
// Mobile adapter -> repository -> service and the shared canonical restaurant mock.
import { mobileMenuItemService } from "../../services/mobile-menu-item-service";
import { mobileRestaurantService } from "../../services/mobile-restaurant-service";
import type { RecommendedMenuItemViewModel, RestaurantCardViewModel } from "../../view-models/restaurant-view-models";

export type CanonicalRestaurantMenuItem = RecommendedMenuItemViewModel;
export type CanonicalRestaurant = RestaurantCardViewModel;

export const canonicalRestaurants = mobileRestaurantService.listRestaurantCards();

export function getCanonicalRestaurants() {
  return mobileRestaurantService.listRestaurantCards();
}

export function getCanonicalRestaurantById(restaurantId: string | undefined | null) {
  return mobileRestaurantService.findRestaurantById(restaurantId);
}

export function getCanonicalRestaurantByName(name: string | undefined | null) {
  return mobileRestaurantService.findRestaurantByName(name);
}

export function getCanonicalRestaurantMenuItems(restaurantId: string) {
  return mobileMenuItemService.listMenuItemsForRestaurant(restaurantId);
}

export function getCanonicalMenuItemById(menuItemId: string | undefined | null) {
  return mobileMenuItemService.findMenuItemById(menuItemId);
}

export function getPrimaryMenuItemForRestaurant(restaurantId: string | undefined | null) {
  return mobileMenuItemService.getPrimaryMenuItemForRestaurant(restaurantId);
}

export function getDefaultRestaurantForProfileTags(tags: string[]) {
  return mobileRestaurantService.getDefaultRestaurantForProfileTags(tags);
}
