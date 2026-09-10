import "server-only";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import {
  parsePublicPhoneMutation,
  parsePublicPhonePreview,
  RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_MUTATION_RPC,
  RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_PREVIEW_RPC,
  type PublicPhoneInput
} from "../../runtime/restaurant-owner-branch-public-phone";

export function createRestaurantOwnerBranchPublicPhoneRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string, branchId: string) {
      const result = await client.rpc(RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_PREVIEW_RPC, {
        p_restaurant_id: restaurantId,
        p_branch_id: branchId
      });
      if (result.error) throw new Error("public-phone unavailable");
      return parsePublicPhonePreview(result.data) ?? { state: "internal_failure" as const };
    },
    async mutate(branchId: string, input: PublicPhoneInput) {
      const result = await client.rpc(RESTAURANT_OWNER_BRANCH_PUBLIC_PHONE_MUTATION_RPC, {
        p_branch_id: branchId,
        p_operation: input.operation,
        p_expected_public_phone: input.expectedPublicPhone,
        p_next_public_phone: input.operation === "set" ? input.nextPublicPhone : null,
        p_expected_version: input.expectedVersion
      });
      if (result.error) throw new Error("public-phone unavailable");
      return parsePublicPhoneMutation(result.data) ?? { state: "internal_failure" as const };
    }
  };
}
