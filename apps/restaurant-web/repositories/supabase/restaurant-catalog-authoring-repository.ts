import "server-only";
import { createRestaurantSupabaseServerClient } from "../../auth/supabase-server";
import {
  RPC,
  parseCreateMenuResult, parsePreviewMenuResult, parseSetMenuNameResult, parseTransitionMenuStatusResult,
  parseCreateCategoryResult, parsePreviewCategoryResult, parseSetCategoryContentResult,
  parseCreateItemResult, parsePreviewItemResult, parseSetItemContentResult, parseTransitionItemStatusResult,
  parseLinkItemToBranchResult
} from "../../runtime/restaurant-catalog-authoring";

export class RestaurantCatalogAuthoringTransportError extends Error {
  constructor() { super("Restaurant catalog authoring authority unavailable"); }
}

export function createRestaurantCatalogAuthoringRepository() {
  const client = createRestaurantSupabaseServerClient();
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.rpc(name, args);
    if (result.error) throw new RestaurantCatalogAuthoringTransportError();
    return result.data as unknown;
  };
  return {
    // Menu
    async createMenu(restaurantId: string, name: string) {
      return parseCreateMenuResult(await call(RPC.createMenu, { p_restaurant_id: restaurantId, p_name: name })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async previewMenu(restaurantId: string, menuId: string) {
      return parsePreviewMenuResult(await call(RPC.previewMenu, { p_restaurant_id: restaurantId, p_menu_id: menuId })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async setMenuName(menuId: string, expectedName: string, nextName: string, expectedVersion: string) {
      return parseSetMenuNameResult(await call(RPC.setMenuName, { p_menu_id: menuId, p_expected_name: expectedName, p_next_name: nextName, p_expected_version: expectedVersion })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async transitionMenuStatus(menuId: string, expectedStatus: string, nextStatus: string, expectedVersion: string) {
      return parseTransitionMenuStatusResult(await call(RPC.transitionMenuStatus, { p_menu_id: menuId, p_expected_status: expectedStatus, p_next_status: nextStatus, p_expected_version: expectedVersion })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    // Category
    async createCategory(menuId: string, name: string, sortOrder: number | null) {
      return parseCreateCategoryResult(await call(RPC.createCategory, { p_menu_id: menuId, p_name: name, p_sort_order: sortOrder })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async previewCategory(restaurantId: string, menuCategoryId: string) {
      return parsePreviewCategoryResult(await call(RPC.previewCategory, { p_restaurant_id: restaurantId, p_menu_category_id: menuCategoryId })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async setCategoryContent(menuCategoryId: string, expectedName: string, nextName: string, expectedSortOrder: number, nextSortOrder: number, expectedVersion: string) {
      return parseSetCategoryContentResult(await call(RPC.setCategoryContent, { p_menu_category_id: menuCategoryId, p_expected_name: expectedName, p_next_name: nextName, p_expected_sort_order: expectedSortOrder, p_next_sort_order: nextSortOrder, p_expected_version: expectedVersion })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    // Item
    async createItem(restaurantId: string, menuCategoryId: string, name: string, description: string | null, allergens: string[] | null) {
      return parseCreateItemResult(await call(RPC.createItem, { p_restaurant_id: restaurantId, p_menu_category_id: menuCategoryId, p_name: name, p_description: description, p_allergens: allergens })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async previewItem(restaurantId: string, menuItemId: string) {
      return parsePreviewItemResult(await call(RPC.previewItem, { p_restaurant_id: restaurantId, p_menu_item_id: menuItemId })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async setItemContent(menuItemId: string, expectedName: string, nextName: string, expectedDescription: string | null, nextDescription: string | null, expectedAllergens: string[], nextAllergens: string[], expectedMenuCategoryId: string, nextMenuCategoryId: string, expectedVersion: string) {
      return parseSetItemContentResult(await call(RPC.setItemContent, { p_menu_item_id: menuItemId, p_expected_name: expectedName, p_next_name: nextName, p_expected_description: expectedDescription, p_next_description: nextDescription, p_expected_allergens: expectedAllergens, p_next_allergens: nextAllergens, p_expected_menu_category_id: expectedMenuCategoryId, p_next_menu_category_id: nextMenuCategoryId, p_expected_version: expectedVersion })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    async transitionItemStatus(menuItemId: string, expectedStatus: string, nextStatus: string, expectedVersion: string) {
      return parseTransitionItemStatusResult(await call(RPC.transitionItemStatus, { p_menu_item_id: menuItemId, p_expected_status: expectedStatus, p_next_status: nextStatus, p_expected_version: expectedVersion })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    },
    // Branch linkage
    async linkItemToBranch(branchId: string, menuItemId: string, price: string, availability: string | null) {
      return parseLinkItemToBranchResult(await call(RPC.linkItemToBranch, { p_branch_id: branchId, p_menu_item_id: menuItemId, p_price: price, p_availability: availability })) ?? { ok: false as const, errorCode: "internal_failure" as const };
    }
  };
}
