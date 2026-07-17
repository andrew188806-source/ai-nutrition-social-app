import type { ConsumerRatingTarget } from "./types";

export type ConsumerRatingTargetSource = {
  restaurantId?: string | null;
  menuItemId?: string | null;
  branchId?: string | null;
  canonicalMealRecordId?: string | null;
  canonicalMealRecordItemId?: string | null;
};

export type ConsumerRatingTargetMapping =
  | { status: "available"; target: ConsumerRatingTarget }
  | { status: "target_unavailable"; reason: "restaurant_id_missing" | "menu_item_parent_missing" };

const databaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mapConsumerRatingTarget(source: ConsumerRatingTargetSource): ConsumerRatingTargetMapping {
  const restaurantId = opaqueId(source.restaurantId);
  const menuItemId = opaqueId(source.menuItemId);

  if (menuItemId) {
    if (!restaurantId) return { status: "target_unavailable", reason: "menu_item_parent_missing" };
    return {
      status: "available",
      target: {
        kind: "menu_item",
        restaurantId,
        menuItemId,
        branchId: nullableOpaqueId(source.branchId),
        mealRecordItemId: canonicalDatabaseUuid(source.canonicalMealRecordItemId)
      }
    };
  }

  if (!restaurantId) return { status: "target_unavailable", reason: "restaurant_id_missing" };
  return {
    status: "available",
    target: {
      kind: "restaurant",
      restaurantId,
      mealRecordId: canonicalDatabaseUuid(source.canonicalMealRecordId)
    }
  };
}

function opaqueId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function nullableOpaqueId(value: string | null | undefined): string | null {
  return opaqueId(value);
}

function canonicalDatabaseUuid(value: string | null | undefined): string | null {
  const normalized = opaqueId(value);
  return normalized && databaseUuid.test(normalized) ? normalized : null;
}
