import { ConsumerFavoriteResponseMalformedError } from "./errors";
import type { ConsumerFavoriteRecord } from "./types";
import { validateConsumerFavoriteTarget } from "./validation";

export function mapSupabaseRestaurantFavoriteRow(value: unknown): ConsumerFavoriteRecord {
  const row = record(value);
  const target = canonicalTarget({
    kind: "restaurant",
    restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id")
  });
  return {
    ...mapCommonFavoriteRow(row),
    target
  };
}

export function mapSupabaseMenuItemFavoriteRow(value: unknown): ConsumerFavoriteRecord {
  const row = record(value);
  const target = canonicalTarget({
    kind: "menu_item",
    restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id"),
    menuItemId: nonEmptyString(row.menu_item_id, "menu_item_id")
  });
  return {
    ...mapCommonFavoriteRow(row),
    target
  };
}

function mapCommonFavoriteRow(row: Record<string, unknown>) {
  if (row.removed_at !== null) malformed("removed_at");
  return {
    favoriteId: nonEmptyString(row.id, "id"),
    collectionLabel: nullableString(row.collection_label, "collection_label"),
    sortOrder: nullableInteger(row.sort_order, "sort_order"),
    createdAt: timestamp(row.created_at, "created_at"),
    active: true
  } as const;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) malformed("object");
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) malformed(field);
  return value.trim();
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") malformed(field);
  return value;
}

function nullableInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) malformed(field);
  return value;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || !Number.isFinite(Date.parse(value))) malformed(field);
  return value;
}

function canonicalTarget(value: unknown) {
  const validation = validateConsumerFavoriteTarget(value);
  if (!validation.ok) malformed("target");
  return validation.value;
}

function malformed(field: string): never {
  throw new ConsumerFavoriteResponseMalformedError(`Favorite response field is malformed: ${field}.`);
}
