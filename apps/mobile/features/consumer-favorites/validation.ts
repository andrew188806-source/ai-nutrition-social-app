import { Buffer } from "buffer";
import {
  ConsumerFavoritePaginationInvalidError,
  ConsumerFavoriteTargetInvalidError,
  type ConsumerFavoriteRuntimeError
} from "./errors";
import type {
  ConsumerFavoriteEntityType,
  ConsumerFavoriteListInput,
  ConsumerFavoriteRecord,
  ConsumerFavoriteTarget
} from "./types";

export const CONSUMER_FAVORITE_DEFAULT_PAGE_SIZE = 20;
export const CONSUMER_FAVORITE_MAX_PAGE_SIZE = 50;

export type ConsumerFavoriteCursorTuple = readonly [number | null, string, string];

export type ConsumerFavoriteValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ConsumerFavoriteRuntimeError };

export function validateConsumerFavoriteTarget(value: unknown): ConsumerFavoriteValidationResult<ConsumerFavoriteTarget> {
  if (!isPlainObject(value)) return invalidTarget();
  if (value.kind === "restaurant" && exactKeys(value, ["kind", "restaurantId"]) && validOpaqueId(value.restaurantId)) {
    return { ok: true, value: { kind: "restaurant", restaurantId: value.restaurantId.trim() } };
  }
  if (
    value.kind === "menu_item" &&
    exactKeys(value, ["kind", "restaurantId", "menuItemId"]) &&
    validOpaqueId(value.restaurantId) &&
    validOpaqueId(value.menuItemId)
  ) {
    return {
      ok: true,
      value: { kind: "menu_item", restaurantId: value.restaurantId.trim(), menuItemId: value.menuItemId.trim() }
    };
  }
  return invalidTarget();
}

export function validateConsumerFavoriteListInput(
  value: unknown
): ConsumerFavoriteValidationResult<Required<Pick<ConsumerFavoriteListInput, "entityType" | "pageSize">> & { cursor: ConsumerFavoriteCursorTuple | null }> {
  if (!isPlainObject(value) || !exactKeys(value, ["entityType", "cursor", "pageSize"], true)) return invalidPagination();
  if (value.entityType !== "restaurant" && value.entityType !== "menu_item") return invalidPagination();
  const pageSize = value.pageSize === undefined ? CONSUMER_FAVORITE_DEFAULT_PAGE_SIZE : value.pageSize;
  if (!Number.isInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > CONSUMER_FAVORITE_MAX_PAGE_SIZE) {
    return invalidPagination();
  }
  const cursor = value.cursor === undefined || value.cursor === null ? null : decodeConsumerFavoriteCursor(value.cursor);
  if (value.cursor !== undefined && value.cursor !== null && !cursor) return invalidPagination();
  return { ok: true, value: { entityType: value.entityType, pageSize: pageSize as number, cursor } };
}

export function encodeConsumerFavoriteCursor(
  record: Pick<ConsumerFavoriteRecord, "sortOrder" | "createdAt" | "favoriteId">
): string {
  return Buffer.from(JSON.stringify([record.sortOrder, record.createdAt, record.favoriteId]), "utf8").toString("base64url");
}

export function decodeConsumerFavoriteCursor(value: unknown): ConsumerFavoriteCursorTuple | null {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  try {
    const tuple: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(tuple) || tuple.length !== 3) return null;
    const [sortOrder, createdAt, id] = tuple;
    if (!(sortOrder === null || (typeof sortOrder === "number" && Number.isFinite(sortOrder)))) return null;
    if (!validTimestamp(createdAt) || !validOpaqueId(id)) return null;
    return [sortOrder, createdAt, id];
  } catch {
    return null;
  }
}

export function compareConsumerFavoriteRecords(
  left: Pick<ConsumerFavoriteRecord, "sortOrder" | "createdAt" | "favoriteId">,
  right: Pick<ConsumerFavoriteRecord, "sortOrder" | "createdAt" | "favoriteId">
): number {
  if (left.sortOrder === null && right.sortOrder !== null) return 1;
  if (left.sortOrder !== null && right.sortOrder === null) return -1;
  if (left.sortOrder !== null && right.sortOrder !== null && left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt);
  return left.favoriteId.localeCompare(right.favoriteId);
}

export function favoriteTargetKey(target: ConsumerFavoriteTarget): string {
  return target.kind === "restaurant"
    ? `restaurant:${target.restaurantId}`
    : `menu_item:${target.restaurantId}:${target.menuItemId}`;
}

export function entityTypeForTarget(target: ConsumerFavoriteTarget): ConsumerFavoriteEntityType {
  return target.kind;
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/^fav-/i.test(value.trim());
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], optional = false): boolean {
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) return false;
  return optional ? true : keys.length === allowed.length && allowed.every((key) => key in value);
}

function invalidTarget(): ConsumerFavoriteValidationResult<never> {
  return { ok: false, error: new ConsumerFavoriteTargetInvalidError() };
}

function invalidPagination(): ConsumerFavoriteValidationResult<never> {
  return { ok: false, error: new ConsumerFavoritePaginationInvalidError() };
}
