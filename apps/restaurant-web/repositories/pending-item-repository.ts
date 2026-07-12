import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listPendingMenuItems() {
  return restaurantConsoleMockAdapter.pendingMenuItems;
}
