import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listBranches(restaurantId = "restaurant-haochu-bowl") {
  return restaurantConsoleMockAdapter.branches.filter((branch) => branch.restaurantId === restaurantId);
}

export function getBranchById(branchId: string | undefined | null) {
  if (!branchId) return null;
  return restaurantConsoleMockAdapter.branches.find((branch) => branch.id === branchId) ?? null;
}
