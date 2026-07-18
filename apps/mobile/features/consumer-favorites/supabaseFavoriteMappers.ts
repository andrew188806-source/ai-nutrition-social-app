import { ConsumerFavoriteResponseMalformedError } from "./errors";
import type { ConsumerFavoriteRecord } from "./types";
import type { ConsumerFavoriteTarget } from "./types";
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

export type MappedSupabaseFavoriteWrite =
  | { status: "added" | "already_present" | "removed"; record: ConsumerFavoriteRecord }
  | { status: "already_absent"; target: ConsumerFavoriteTarget };

export function mapSupabaseFavoriteRpcResponse(value: unknown): MappedSupabaseFavoriteWrite {
  const row = record(value);
  const status = writeStatus(row.status);
  const target = rpcTarget(row);
  const targetKeys = target.kind === "restaurant"
    ? ["status", "target_kind", "restaurant_id"]
    : ["status", "target_kind", "restaurant_id", "menu_item_id"];
  if (status === "already_absent") {
    exactKeys(row, targetKeys);
    return { status, target };
  }
  exactKeys(row, [
    ...targetKeys,
    "favorite_id",
    "collection_label",
    "sort_order",
    "created_at",
    "active"
  ]);
  const active = requiredBoolean(row.active, "active");
  if ((status === "removed") === active) malformed("active");
  return {
    status,
    record: {
      favoriteId: nonEmptyString(row.favorite_id, "favorite_id"),
      target,
      collectionLabel: nullableString(row.collection_label, "collection_label"),
      sortOrder: nullableInteger(row.sort_order, "sort_order"),
      createdAt: timestamp(row.created_at, "created_at"),
      active
    }
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

function rpcTarget(row: Record<string, unknown>): ConsumerFavoriteTarget {
  if (row.target_kind === "restaurant") {
    return canonicalTarget({
      kind: "restaurant",
      restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id")
    });
  }
  if (row.target_kind === "menu_item") {
    return canonicalTarget({
      kind: "menu_item",
      restaurantId: nonEmptyString(row.restaurant_id, "restaurant_id"),
      menuItemId: nonEmptyString(row.menu_item_id, "menu_item_id")
    });
  }
  malformed("target_kind");
}

function writeStatus(value: unknown): MappedSupabaseFavoriteWrite["status"] {
  if (value === "added" || value === "already_present" || value === "removed" || value === "already_absent") {
    return value;
  }
  malformed("status");
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") malformed(field);
  return value;
}

function exactKeys(row: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(row).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) malformed("shape");
}

function malformed(field: string): never {
  throw new ConsumerFavoriteResponseMalformedError(`Favorite response field is malformed: ${field}.`);
}
