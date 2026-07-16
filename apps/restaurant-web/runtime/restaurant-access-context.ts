import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { getVerifiedRestaurantClaims } from "../auth/supabase-server";
import { SELECTED_RESTAURANT_COOKIE } from "../auth/selection-cookie";
import { createRestaurantOwnerRpcRepository } from "../repositories/supabase/restaurant-owner-rpc-repository";
import type { OwnerBranch, OwnerRestaurant } from "./restaurant-rpc-contracts";

export type RestaurantAccessContext =
  | { state: "missing-identity" }
  | { state: "no-active-access" }
  | { state: "selection-required"; restaurants: OwnerRestaurant[] }
  | { state: "invalid-selection" }
  | { state: "selected"; restaurant: OwnerRestaurant };

export const loadRestaurantAccessContext = cache(async (): Promise<RestaurantAccessContext> => {
  const claims = await getVerifiedRestaurantClaims();
  if (!claims) return { state: "missing-identity" };

  const restaurants = await createRestaurantOwnerRpcRepository().listRestaurants();
  if (restaurants.length === 0) return { state: "no-active-access" };
  const selectedId = cookies().get(SELECTED_RESTAURANT_COOKIE)?.value;
  if (selectedId) {
    const selected = restaurants.find((restaurant) => restaurant.id === selectedId);
    return selected ? { state: "selected", restaurant: selected } : { state: "invalid-selection" };
  }
  if (restaurants.length === 1) {
    const [onlyRestaurant] = restaurants;
    if (onlyRestaurant) return { state: "selected", restaurant: onlyRestaurant };
  }
  return { state: "selection-required", restaurants };
});

export async function loadValidatedBranch(branchId?: string | null): Promise<{ branches: OwnerBranch[]; selected: OwnerBranch | null; invalid: boolean }> {
  const context = await loadRestaurantAccessContext();
  if (context.state !== "selected") return { branches: [], selected: null, invalid: Boolean(branchId) };
  const branches = await createRestaurantOwnerRpcRepository().listBranches(context.restaurant.id);
  if (!branchId) return { branches, selected: null, invalid: false };
  const selected = branches.find((branch) => branch.id === branchId) ?? null;
  return { branches, selected, invalid: !selected };
}
