import "server-only";

import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import {
  RESTAURANT_OWNER_SOLD_OUT_MUTATION_RPC,
  RESTAURANT_OWNER_SOLD_OUT_PREVIEW_RPC,
  parseMutationResult,
  parsePreviewResult,
  type RestaurantOwnerSoldOutMutationRequest,
  type RestaurantOwnerSoldOutMutationResult,
  type RestaurantOwnerSoldOutPreview
} from "../../runtime/restaurant-owner-sold-out";

export class RestaurantOwnerSoldOutTransportError extends Error {
  constructor() { super("Restaurant Owner sold-out authority unavailable"); }
}

export function createRestaurantOwnerSoldOutRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string, branchId: string, branchMenuItemId: string): Promise<RestaurantOwnerSoldOutPreview> {
      const result = await client.rpc(RESTAURANT_OWNER_SOLD_OUT_PREVIEW_RPC, {
        p_restaurant_id: restaurantId,
        p_branch_id: branchId,
        p_branch_menu_item_id: branchMenuItemId
      });
      if (result.error) throw new RestaurantOwnerSoldOutTransportError();
      return parsePreviewResult(result.data) ?? { state: "internal_failure" };
    },
    async mutate(branchMenuItemId: string, input: RestaurantOwnerSoldOutMutationRequest): Promise<RestaurantOwnerSoldOutMutationResult> {
      const result = await client.rpc(RESTAURANT_OWNER_SOLD_OUT_MUTATION_RPC, {
        p_branch_menu_item_id: branchMenuItemId,
        p_expected_sold_out: input.expectedSoldOut,
        p_next_sold_out: input.nextSoldOut,
        p_expected_version: input.expectedVersion
      });
      if (result.error) throw new RestaurantOwnerSoldOutTransportError();
      return parseMutationResult(result.data) ?? { state: "internal_failure" };
    }
  };
}
