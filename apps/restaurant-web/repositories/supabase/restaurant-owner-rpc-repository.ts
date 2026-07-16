import "server-only";

import { SupabaseQueryError } from "../../adapters/supabase/errors";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import {
  mapOwnerBranch, mapOwnerBranchMenuItem, mapOwnerMenu, mapOwnerMenuCategory, mapOwnerMenuItem, mapOwnerNutrition, mapOwnerRestaurant
} from "../../runtime/restaurant-rpc-mappers";
import type { RestaurantOwnerReadRepository } from "../../runtime/restaurant-rpc-contracts";

const RPC = {
  restaurants: "restaurant_internal_restaurants_v1",
  branches: "restaurant_internal_branches_v1",
  menus: "restaurant_internal_menus_v1",
  categories: "restaurant_internal_menu_categories_v1",
  items: "restaurant_internal_menu_items_v1",
  branchItems: "restaurant_internal_branch_menu_items_v1",
  nutrition: "restaurant_internal_current_nutrition_v1"
} as const;

function rows(data: unknown, operation: string): unknown[] {
  if (!Array.isArray(data)) throw new SupabaseQueryError(`${operation} returned malformed data.`);
  return data;
}

export function createRestaurantOwnerRpcRepository(): RestaurantOwnerReadRepository {
  const client = createRestaurantSupabaseServerClient();
  async function call(name: string, args?: Record<string, string>) {
    const result = await client.rpc(name, args);
    if (result.error) throw new SupabaseQueryError(`${name} failed: ${result.error.code ?? "rpc_error"}`);
    if (result.data === null || result.data === undefined) throw new SupabaseQueryError(`${name} returned no data.`);
    return rows(result.data, name);
  }

  return {
    async listRestaurants() {
      return (await call(RPC.restaurants)).map(mapOwnerRestaurant);
    },
    async listBranches(restaurantId) {
      return (await call(RPC.branches, { p_restaurant_id: restaurantId })).map((value) => mapOwnerBranch(value, restaurantId));
    },
    async listMenus(restaurantId) {
      return (await call(RPC.menus, { p_restaurant_id: restaurantId })).map((value) => mapOwnerMenu(value, restaurantId));
    },
    async listMenuCategories(restaurantId) {
      return (await call(RPC.categories, { p_restaurant_id: restaurantId })).map((value) => mapOwnerMenuCategory(value, restaurantId));
    },
    async listMenuItems(restaurantId) {
      return (await call(RPC.items, { p_restaurant_id: restaurantId })).map((value) => mapOwnerMenuItem(value, restaurantId));
    },
    async listBranchMenuItems(restaurantId) {
      return (await call(RPC.branchItems, { p_restaurant_id: restaurantId })).map((value) => mapOwnerBranchMenuItem(value, restaurantId));
    },
    async listCurrentNutrition(restaurantId) {
      return (await call(RPC.nutrition, { p_restaurant_id: restaurantId })).map((value) => mapOwnerNutrition(value, restaurantId));
    }
  };
}
