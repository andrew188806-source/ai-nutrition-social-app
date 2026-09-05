import "server-only";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import { parseMutation, parsePreview, RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_MUTATION_RPC, RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_PREVIEW_RPC, type Input } from "../../runtime/restaurant-owner-menu-item-display-name";

export function createRestaurantOwnerMenuItemDisplayNameRepository() {
  const client = createRestaurantSupabaseServerClient();
  return {
    async preview(restaurantId: string, branchId: string, branchMenuItemId: string) {
      const result = await client.rpc(RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_PREVIEW_RPC, { p_restaurant_id: restaurantId, p_branch_id: branchId, p_branch_menu_item_id: branchMenuItemId });
      if (result.error) throw new Error("menu-item display-name unavailable");
      return parsePreview(result.data) ?? { state: "internal_failure" as const };
    },
    async mutate(branchMenuItemId: string, input: Input) {
      const result = await client.rpc(RESTAURANT_OWNER_MENU_ITEM_DISPLAY_NAME_MUTATION_RPC, {
        p_branch_menu_item_id: branchMenuItemId,
        p_operation: input.operation,
        p_expected_display_name: input.expectedDisplayName,
        p_next_display_name: input.operation === "set" ? input.nextDisplayName : null,
        p_expected_version: input.expectedVersion
      });
      if (result.error) throw new Error("menu-item display-name unavailable");
      return parseMutation(result.data) ?? { state: "internal_failure" as const };
    }
  };
}
