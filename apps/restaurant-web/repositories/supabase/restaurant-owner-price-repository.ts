import "server-only";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import { RESTAURANT_OWNER_PRICE_MUTATION_RPC, RESTAURANT_OWNER_PRICE_PREVIEW_RPC, parseMutationResult, parsePreviewResult, type RestaurantOwnerPriceMutationRequest, type RestaurantOwnerPriceMutationResult, type RestaurantOwnerPricePreview } from "../../runtime/restaurant-owner-price";
export class RestaurantOwnerPriceTransportError extends Error { constructor() { super("Restaurant Owner price authority unavailable"); } }
export function createRestaurantOwnerPriceRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string, branchId: string, branchMenuItemId: string): Promise<RestaurantOwnerPricePreview> {
      const result = await client.rpc(RESTAURANT_OWNER_PRICE_PREVIEW_RPC,{p_restaurant_id:restaurantId,p_branch_id:branchId,p_branch_menu_item_id:branchMenuItemId});
      if (result.error) throw new RestaurantOwnerPriceTransportError(); return parsePreviewResult(result.data) ?? { state:"internal_failure" };
    },
    async mutate(branchMenuItemId: string, input: RestaurantOwnerPriceMutationRequest): Promise<RestaurantOwnerPriceMutationResult> {
      const result = await client.rpc(RESTAURANT_OWNER_PRICE_MUTATION_RPC,{p_branch_menu_item_id:branchMenuItemId,p_expected_price:input.expectedPrice,p_next_price:input.nextPrice,p_expected_version:input.expectedVersion});
      if (result.error) throw new RestaurantOwnerPriceTransportError(); return parseMutationResult(result.data) ?? { state:"internal_failure" };
    }
  };
}
