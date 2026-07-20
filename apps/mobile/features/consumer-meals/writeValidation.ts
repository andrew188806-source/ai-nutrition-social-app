import {
  ConsumerMealWriteInvalidDateError,
  ConsumerMealWriteInvalidInputError,
  ConsumerMealWriteInvalidItemsError,
  ConsumerMealWriteInvalidNutritionError,
  ConsumerMealWriteOwnershipFieldRejectedError,
  ConsumerMealWritePayloadTooLargeError
} from "../consumer-auth/errors";
import type {
  ConsumerCreateMealRecordInput,
  ConsumerCreateMealRecordItemInput,
  ConsumerMealCorrectionStatus,
  ConsumerMealSourceType,
  ConsumerMealType,
  ConsumerNutritionSnapshot,
  ConsumerNutritionSourceType
} from "./types";
import { toDateKeyInTimeZone } from "./mealDateTime";

const mealTypes = new Set<ConsumerMealType>(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const mealSources = new Set<ConsumerMealSourceType>(["restaurant", "self_made", "manual", "ai_estimated"]);
const nutritionSources = new Set<ConsumerNutritionSourceType>(["restaurant_verified", "admin_verified", "ai_estimated", "user_corrected", "manual"]);
const rejectedOwnershipFields = new Set(["userId", "ownerId", "profileId", "externalUserId", "createdBy", "user_id", "owner_id", "profile_id"]);
const rejectedServerFields = new Set(["id", "mealRecordId", "mealRecordItemId", "createdAt", "updatedAt", "deletedAt", "created_at", "updated_at", "deleted_at"]);
const recordKeys = new Set(["idempotencyKey", "mealType", "occurredAt", "mealDate", "timezone", "title", "note", "source", "items"]);
const itemKeys = new Set([
  "restaurantId",
  "branchId",
  "menuId",
  "menuItemId",
  "displayName",
  "userEnteredName",
  "aiDetectedName",
  "normalizedName",
  "portion",
  "nutrition",
  "nutritionSource",
  "sourceEntityVersion",
  "confidenceScore",
  "consumedRatio"
]);
const nutritionKeys = new Set(["calories", "protein", "carbohydrates", "fat", "fiber"]);
const maxItems = 20;

export type ValidatedCreateMealRecordItemInput = Omit<ConsumerCreateMealRecordItemInput, "nutrition" | "nutritionSource" | "consumedRatio"> & {
  nutrition: ConsumerNutritionSnapshot;
  nutritionSource: ConsumerNutritionSourceType;
  consumedRatio: number;
  occurredAt: string;
  timezone: string;
  correctionStatus: ConsumerMealCorrectionStatus;
};

export type ValidatedCreateMealRecordInput = Omit<ConsumerCreateMealRecordInput, "timezone" | "source" | "items"> & {
  timezone: string;
  source: ConsumerMealSourceType;
  items: ValidatedCreateMealRecordItemInput[];
};

export function validateCreateMealRecordInput(input: ConsumerCreateMealRecordInput): ValidatedCreateMealRecordInput {
  const raw = objectValue(input, "meal record input");
  rejectUnsafeKeys(raw, recordKeys);
  const mealType = enumValue(raw.mealType, mealTypes, "mealType", ConsumerMealWriteInvalidInputError);
  const source = enumValue(raw.source ?? "manual", mealSources, "source", ConsumerMealWriteInvalidInputError);
  const mealDate = dateKey(raw.mealDate, "mealDate");
  const occurredAt = timestamp(raw.occurredAt, "occurredAt");
  const timezone = optionalString(raw.timezone, "timezone", 64) ?? "Asia/Taipei";
  let occurredDate: string;
  try {
    occurredDate = toDateKeyInTimeZone(new Date(occurredAt), timezone);
  } catch {
    throw new ConsumerMealWriteInvalidDateError("Meal write timezone or occurredAt is invalid.");
  }
  if (occurredDate !== mealDate) {
    throw new ConsumerMealWriteInvalidDateError("Meal write occurredAt date must match mealDate in the supplied timezone.");
  }
  const itemsRaw = Array.isArray(raw.items) ? raw.items : null;
  if (!itemsRaw || itemsRaw.length < 1) throw new ConsumerMealWriteInvalidItemsError("Meal write requires at least one item.");
  if (itemsRaw.length > maxItems) throw new ConsumerMealWritePayloadTooLargeError(`Meal write cannot include more than ${maxItems} items.`);
  return {
    idempotencyKey: optionalIdempotencyKey(raw.idempotencyKey),
    mealType,
    occurredAt,
    mealDate,
    timezone,
    title: optionalString(raw.title, "title", 140),
    note: optionalString(raw.note, "note", 1000),
    source,
    items: itemsRaw.map((item, index) => validateItem(item, index, occurredAt, timezone))
  };
}

function optionalIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ConsumerMealWriteInvalidInputError("Meal write idempotencyKey must be a UUID v4.");
  }
  return value.toLowerCase();
}

export function getConsumerMealWriteMaxItems() {
  return maxItems;
}

function validateItem(input: unknown, index: number, occurredAt: string, timezone: string): ValidatedCreateMealRecordItemInput {
  const raw = objectValue(input, `meal item ${index + 1}`);
  rejectUnsafeKeys(raw, itemKeys);
  const nutritionSource = enumValue(raw.nutritionSource ?? "manual", nutritionSources, "nutritionSource", ConsumerMealWriteInvalidItemsError);
  return {
    restaurantId: optionalString(raw.restaurantId, "restaurantId", 120),
    branchId: optionalString(raw.branchId, "branchId", 120),
    menuId: optionalString(raw.menuId, "menuId", 120),
    menuItemId: optionalString(raw.menuItemId, "menuItemId", 120),
    displayName: requiredString(raw.displayName, "displayName", 160),
    userEnteredName: optionalString(raw.userEnteredName, "userEnteredName", 160),
    aiDetectedName: optionalString(raw.aiDetectedName, "aiDetectedName", 160),
    normalizedName: optionalString(raw.normalizedName, "normalizedName", 160),
    portion: optionalString(raw.portion, "portion", 120),
    nutrition: nutrition(raw.nutrition ?? {}),
    nutritionSource,
    sourceEntityVersion: optionalString(raw.sourceEntityVersion, "sourceEntityVersion", 120),
    confidenceScore: optionalUnitNumber(raw.confidenceScore, "confidenceScore"),
    consumedRatio: optionalUnitNumber(raw.consumedRatio, "consumedRatio") ?? 1,
    occurredAt,
    timezone,
    correctionStatus: "none" satisfies ConsumerMealCorrectionStatus
  };
}

function rejectUnsafeKeys(raw: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(raw)) {
    if (rejectedOwnershipFields.has(key)) throw new ConsumerMealWriteOwnershipFieldRejectedError(`Meal write input rejected ownership field: ${key}.`);
    if (rejectedServerFields.has(key)) throw new ConsumerMealWriteInvalidInputError(`Meal write input rejected server-managed field: ${key}.`);
    if (!allowed.has(key)) throw new ConsumerMealWriteInvalidInputError(`Meal write input contains unknown field: ${key}.`);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ConsumerMealWriteInvalidInputError(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new ConsumerMealWriteInvalidInputError(`Missing ${label}.`);
  const trimmed = value.trim();
  if (!trimmed) throw new ConsumerMealWriteInvalidInputError(`Missing ${label}.`);
  if (trimmed.length > maxLength) throw new ConsumerMealWritePayloadTooLargeError(`${label} is too long.`);
  return trimmed;
}

function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ConsumerMealWriteInvalidInputError(`Invalid ${label}.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new ConsumerMealWritePayloadTooLargeError(`${label} is too long.`);
  return trimmed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  label: string,
  ErrorClass: new (message?: string) => Error
): T {
  if (typeof value === "string" && allowed.has(value as T)) return value as T;
  throw new ErrorClass(`Invalid ${label}.`);
}

function dateKey(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValidDateKey(value)) {
    throw new ConsumerMealWriteInvalidDateError(`Invalid ${label}.`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ConsumerMealWriteInvalidDateError(`Invalid ${label}.`);
  }
  return value;
}

function isValidDateKey(date: string): boolean {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function nutrition(value: unknown): ConsumerNutritionSnapshot {
  const raw = objectValue(value, "nutrition");
  for (const key of Object.keys(raw)) {
    if (!nutritionKeys.has(key)) throw new ConsumerMealWriteInvalidNutritionError(`Unknown nutrition field: ${key}.`);
  }
  return {
    calories: optionalNonNegativeNumber(raw.calories, "calories"),
    protein: optionalNonNegativeNumber(raw.protein, "protein"),
    carbohydrates: optionalNonNegativeNumber(raw.carbohydrates, "carbohydrates"),
    fat: optionalNonNegativeNumber(raw.fat, "fat"),
    fiber: optionalNonNegativeNumber(raw.fiber, "fiber")
  };
}

function optionalNonNegativeNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ConsumerMealWriteInvalidNutritionError(`Invalid nutrition ${label}.`);
  return value;
}

function optionalUnitNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ConsumerMealWriteInvalidInputError(`Invalid ${label}.`);
  }
  return value;
}
