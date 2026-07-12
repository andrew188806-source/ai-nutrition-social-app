import type { RestaurantDomain } from "@haocu/shared/domain";
import { mobileRestaurantMockAdapter } from "../adapters/mock/mobile-restaurant-mock-adapter";

function snapshot() {
  return mobileRestaurantMockAdapter.getSnapshot();
}

export const restaurantRepository = {
  listRestaurants(): RestaurantDomain.Restaurant[] {
    return snapshot().restaurants.filter((restaurant) => restaurant.status === "active");
  },

  findRestaurantById(restaurantId: string | undefined | null): RestaurantDomain.Restaurant | null {
    if (!restaurantId) return null;
    return snapshot().restaurants.find((restaurant) => restaurant.id === restaurantId) ?? null;
  },

  findRestaurantByName(name: string | undefined | null): RestaurantDomain.Restaurant | null {
    if (!name) return null;
    return snapshot().restaurants.find((restaurant) => restaurant.name === name || restaurant.legalName === name) ?? null;
  },

  listBranches(restaurantId: string): RestaurantDomain.RestaurantBranch[] {
    return snapshot().branches.filter((branch) => branch.restaurantId === restaurantId && branch.isActive);
  },

  findBranchById(branchId: string | undefined | null): RestaurantDomain.RestaurantBranch | null {
    if (!branchId) return null;
    return snapshot().branches.find((branch) => branch.id === branchId) ?? null;
  },

  getPrimaryBranch(restaurantId: string): RestaurantDomain.RestaurantBranch | null {
    return this.listBranches(restaurantId)[0] ?? null;
  }
};
