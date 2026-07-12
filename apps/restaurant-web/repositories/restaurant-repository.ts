import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listRestaurants() {
  return restaurantConsoleMockAdapter.restaurants;
}

export function getRestaurantById(restaurantId: string) {
  return restaurantConsoleMockAdapter.restaurants.find((restaurant) => restaurant.id === restaurantId) ?? null;
}
