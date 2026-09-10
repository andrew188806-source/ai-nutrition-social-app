import "server-only";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import { createRestaurantSupabaseServiceClient } from "../../auth/supabase-service-server";
import {
  parsePublicWebsiteMutation, parsePublicWebsitePreview,
  RESTAURANT_OWNER_PUBLIC_WEBSITE_MUTATION_RPC, RESTAURANT_OWNER_PUBLIC_WEBSITE_PREVIEW_RPC,
  type PublicWebsiteInput
} from "../../runtime/restaurant-owner-public-website";

export function createRestaurantOwnerPublicWebsiteRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string) {
      const result = await client.rpc(RESTAURANT_OWNER_PUBLIC_WEBSITE_PREVIEW_RPC,
        { p_restaurant_id: restaurantId });
      if (result.error) throw new Error("public-website unavailable");
      return parsePublicWebsitePreview(result.data) ?? { state: "internal_failure" as const };
    },
    async mutate(actorAuthUserId: string, restaurantId: string, input: PublicWebsiteInput) {
      const result = await createRestaurantSupabaseServiceClient().rpc(
        RESTAURANT_OWNER_PUBLIC_WEBSITE_MUTATION_RPC, {
        p_actor_auth_user_id: actorAuthUserId,
        p_restaurant_id: restaurantId,
        p_operation: input.operation,
        p_expected_public_website_url: input.expectedPublicWebsiteUrl,
        p_next_public_website_url: input.operation === "set" ? input.nextPublicWebsiteUrl : null,
        p_expected_version: input.expectedVersion
      });
      if (result.error) throw new Error("public-website unavailable");
      return parsePublicWebsiteMutation(result.data) ?? { state: "internal_failure" as const };
    }
  };
}
