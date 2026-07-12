import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listAnalyticsEvents() {
  return restaurantConsoleMockAdapter.analyticsEvents;
}

export function listRecommendationResults() {
  return restaurantConsoleMockAdapter.recommendationResults;
}

export function listMenuItemRatings() {
  return restaurantConsoleMockAdapter.menuItemRatings;
}
