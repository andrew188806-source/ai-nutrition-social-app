import "server-only";

import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import {
  RESTAURANT_OWNER_AVAILABILITY_MUTATION_RPC,
  RESTAURANT_OWNER_AVAILABILITY_PREVIEW_RPC,
  parseMutationResult,
  parsePreviewResult,
  type RestaurantOwnerAvailabilityMutationRequest,
  type RestaurantOwnerAvailabilityMutationResult,
  type RestaurantOwnerAvailabilityPreview
} from "../../runtime/restaurant-owner-availability";

export class RestaurantOwnerAvailabilityTransportError extends Error {
  constructor() { super("Restaurant Owner availability authority unavailable"); }
}

export function createRestaurantOwnerAvailabilityRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string, branchId: string, branchMenuItemId: string): Promise<RestaurantOwnerAvailabilityPreview> {
      const result = await client.rpc(RESTAURANT_OWNER_AVAILABILITY_PREVIEW_RPC, {
        p_restaurant_id: restaurantId,
        p_branch_id: branchId,
        p_branch_menu_item_id: branchMenuItemId
      });
      if (result.error) throw new RestaurantOwnerAvailabilityTransportError();
      return parsePreviewResult(result.data) ?? { state: "internal_failure" };
    },
    async mutate(branchMenuItemId: string, input: RestaurantOwnerAvailabilityMutationRequest): Promise<RestaurantOwnerAvailabilityMutationResult> {
      const result = await client.rpc(RESTAURANT_OWNER_AVAILABILITY_MUTATION_RPC, {
        p_branch_menu_item_id: branchMenuItemId,
        p_expected_availability: input.expectedAvailability,
        p_next_availability: input.nextAvailability,
        p_expected_version: input.expectedVersion
      });
      if (result.error) throw new RestaurantOwnerAvailabilityTransportError();
      return parseMutationResult(result.data) ?? { state: "internal_failure" };
    }
  };
}
