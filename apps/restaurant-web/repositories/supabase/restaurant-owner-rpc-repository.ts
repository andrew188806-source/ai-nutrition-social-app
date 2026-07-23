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

// Postgres statement-timeout cancellation (57014) is a well-known transient
// condition, not a permanent failure; the Development instance occasionally
// hits it under connection contention even for individually-fast queries.
// Every other error code (e.g. 42501 permission denied) still fails immediately
// and is never retried.
//
// The `authenticated` role's statement_timeout is a fixed 8s (confirmed via
// pg_roles.rolconfig), so a single attempt is bounded at 8s. Callers such as
// loadLiveDashboard/loadLiveMenu make up to five of these calls sequentially,
// so the retry budget must stay small: at MAX_TRANSIENT_RETRIES=1, one page
// load's worst case is 5 calls x 2 attempts x 8s = 80s. The previous value
// of 2 retries produced a worst case of 5 x 3 x 8s = 120s, which is what
// produced one observed ~99s page load; capping at 1 retry keeps the
// amplification bounded without removing the transient-recovery benefit.
const TRANSIENT_RETRY_CODE = "57014";
const MAX_TRANSIENT_RETRIES = 1;
const RETRY_DELAY_MS = 300;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRestaurantOwnerRpcRepository(): RestaurantOwnerReadRepository {
  const client = createRestaurantSupabaseServerClient();
  async function call(name: string, args?: Record<string, string>) {
    let attempt = 0;
    for (;;) {
      const result = await client.rpc(name, args);
      if (result.error) {
        if (result.error.code === TRANSIENT_RETRY_CODE && attempt < MAX_TRANSIENT_RETRIES) {
          attempt += 1;
          await wait(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new SupabaseQueryError(`${name} failed: ${result.error.code ?? "rpc_error"}`);
      }
      if (result.data === null || result.data === undefined) throw new SupabaseQueryError(`${name} returned no data.`);
      return rows(result.data, name);
    }
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
