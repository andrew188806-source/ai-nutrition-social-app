import "server-only";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import {
  parseRestaurantAboutMutation, parseRestaurantAboutPreview,
  RESTAURANT_OWNER_ABOUT_MUTATION_RPC, RESTAURANT_OWNER_ABOUT_PREVIEW_RPC,
  type RestaurantAboutInput
} from "../../runtime/restaurant-owner-about";

export function createRestaurantOwnerAboutRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string) {
      const result = await client.rpc(RESTAURANT_OWNER_ABOUT_PREVIEW_RPC,
        { p_restaurant_id: restaurantId });
      if (result.error) throw new Error("restaurant-about unavailable");
      return parseRestaurantAboutPreview(result.data) ?? { state: "internal_failure" as const };
    },
    async mutate(restaurantId: string, input: RestaurantAboutInput) {
      const result = await client.rpc(RESTAURANT_OWNER_ABOUT_MUTATION_RPC, {
        p_restaurant_id: restaurantId,
        p_operation: input.operation,
        p_expected_restaurant_about: input.expectedRestaurantAbout,
        p_next_restaurant_about: input.operation === "set" ? input.nextRestaurantAbout : null,
        p_expected_version: input.expectedVersion
      });
      if (result.error) throw new Error("restaurant-about unavailable");
      return parseRestaurantAboutMutation(result.data) ?? { state: "internal_failure" as const };
    }
  };
}
