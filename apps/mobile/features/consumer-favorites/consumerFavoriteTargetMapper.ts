import type { ConsumerFavoriteTarget } from "./types";

export type ConsumerFavoriteTargetSource = {
  restaurantId?: string | null;
  menuItemId?: string | null;
};

export type ConsumerFavoriteTargetMapping =
  | { status: "available"; target: ConsumerFavoriteTarget }
  | { status: "target_unavailable"; reason: "restaurant_id_missing" | "menu_item_parent_missing" | "invalid_target_id" };

const fakeFavoriteId = /^fav-/i;
const arrayIndex = /^\d+$/;

export function mapConsumerFavoriteTarget(source: ConsumerFavoriteTargetSource): ConsumerFavoriteTargetMapping {
  const restaurantId = opaqueId(source.restaurantId);
  const menuItemId = opaqueId(source.menuItemId);

  if (menuItemId) {
    if (!restaurantId) return { status: "target_unavailable", reason: "menu_item_parent_missing" };
    return {
      status: "available",
      target: { kind: "menu_item", restaurantId, menuItemId }
    };
  }

  if (!restaurantId) return { status: "target_unavailable", reason: "restaurant_id_missing" };
  return {
    status: "available",
    target: { kind: "restaurant", restaurantId }
  };
}

function opaqueId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (fakeFavoriteId.test(normalized) || arrayIndex.test(normalized)) return null;
  return normalized;
}
