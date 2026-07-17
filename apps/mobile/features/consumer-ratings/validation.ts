import {
  ConsumerRatingOwnershipFieldRejectedError,
  ConsumerRatingTargetInvalidError,
  ConsumerRatingValueInvalidError,
  type ConsumerRatingRuntimeError
} from "./errors";
import type {
  ConsumerCreateOrReplaceRatingInput,
  ConsumerMenuItemRatingLookup,
  ConsumerRatingLookup,
  ConsumerRestaurantRatingLookup
} from "./types";

export type ConsumerRatingValidationResult =
  | { ok: true }
  | { ok: false; error: ConsumerRatingRuntimeError };

export function validateRestaurantRatingLookup(lookup: ConsumerRestaurantRatingLookup): ConsumerRatingValidationResult {
  if (hasOwnershipField(lookup)) return rejectedOwnership();
  return validId(lookup.restaurantId) ? { ok: true } : invalidTarget();
}

export function validateMenuItemRatingLookup(lookup: ConsumerMenuItemRatingLookup): ConsumerRatingValidationResult {
  if (hasOwnershipField(lookup)) return rejectedOwnership();
  return validId(lookup.menuItemId) ? { ok: true } : invalidTarget();
}

export function validateCreateOrReplaceRatingInput(input: ConsumerCreateOrReplaceRatingInput): ConsumerRatingValidationResult {
  if (hasOwnershipField(input) || hasOwnershipField(input.target)) return rejectedOwnership();
  if (!Number.isFinite(input.ratingValue) || input.ratingValue < 0 || input.ratingValue > 5) {
    return { ok: false, error: new ConsumerRatingValueInvalidError() };
  }
  if (input.target.kind === "restaurant") {
    return validId(input.target.restaurantId) && optionalId(input.target.mealRecordId) ? { ok: true } : invalidTarget();
  }
  return validId(input.target.restaurantId) &&
    validId(input.target.menuItemId) &&
    optionalId(input.target.branchId) &&
    optionalId(input.target.mealRecordItemId)
    ? { ok: true }
    : invalidTarget();
}

export function ratingLookupKey(lookup: ConsumerRatingLookup): string {
  return lookup.kind === "restaurant" ? `restaurant:${lookup.restaurantId}` : `menu_item:${lookup.menuItemId}`;
}

function validId(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalId(value: string | null | undefined): boolean {
  return value === undefined || value === null || validId(value);
}

function hasOwnershipField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return "userId" in value || "user_id" in value;
}

function invalidTarget(): ConsumerRatingValidationResult {
  return { ok: false, error: new ConsumerRatingTargetInvalidError() };
}

function rejectedOwnership(): ConsumerRatingValidationResult {
  return { ok: false, error: new ConsumerRatingOwnershipFieldRejectedError() };
}
