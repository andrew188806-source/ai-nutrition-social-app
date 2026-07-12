import {
  ConsumerMealItemMappingFailedError,
  ConsumerMealRecordMappingFailedError
} from "../consumer-auth/errors";
import type {
  ConsumerMealCorrectionStatus,
  ConsumerMealRecord,
  ConsumerMealRecordItem,
  ConsumerMealSourceType,
  ConsumerMealType,
  ConsumerNutritionSnapshot,
  ConsumerNutritionSourceType
} from "./types";
import type { SupabaseMealRecordItemRowLike, SupabaseMealRecordRowLike } from "./supabaseMealContracts";

const mealTypes = new Set<ConsumerMealType>(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const mealSources = new Set<ConsumerMealSourceType>(["restaurant", "self_made", "manual", "ai_estimated"]);
const nutritionSources = new Set<ConsumerNutritionSourceType>(["restaurant_verified", "admin_verified", "ai_estimated", "user_corrected", "manual"]);
const correctionStatuses = new Set<ConsumerMealCorrectionStatus>(["none", "pending", "confirmed", "rejected"]);

export function mapSupabaseMealRecordRowToConsumerMealRecord(row: SupabaseMealRecordRowLike, currentUserId: string): ConsumerMealRecord {
  const mealRecordId = requiredString(row.id, "meal record id");
  const userId = requiredString(row.user_id, "meal record user_id");
  if (userId !== currentUserId) throw new ConsumerMealRecordMappingFailedError("Meal record owner did not match the authenticated session.");
  const mealType = enumValue(row.meal_type, mealTypes, "meal_type", ConsumerMealRecordMappingFailedError);
  const source = enumValue(row.source, mealSources, "source", ConsumerMealRecordMappingFailedError);
  const occurredAt = timestamp(row.occurred_at, "occurred_at", ConsumerMealRecordMappingFailedError);
  const mealDate = dateKey(row.meal_date, "meal_date", ConsumerMealRecordMappingFailedError);
  const timezone = requiredString(row.timezone, "timezone");
  const createdAt = timestamp(row.created_at, "created_at", ConsumerMealRecordMappingFailedError);
  const updatedAt = timestamp(row.updated_at, "updated_at", ConsumerMealRecordMappingFailedError);
  const items = (row.meal_record_items ?? []).map((item) => mapSupabaseMealItemRowToConsumerMealItem(item, currentUserId, mealRecordId));

  return {
    mealRecordId,
    mealType,
    occurredAt,
    mealDate,
    timezone,
    title: row.title ?? null,
    note: row.note ?? null,
    source,
    createdAt,
    updatedAt,
    items
  };
}

export function mapSupabaseMealItemRowToConsumerMealItem(row: SupabaseMealRecordItemRowLike, currentUserId: string, mealRecordId: string): ConsumerMealRecordItem {
  const itemId = requiredString(row.id, "meal record item id");
  const rowMealRecordId = requiredString(row.meal_record_id, "meal_record_id");
  if (rowMealRecordId !== mealRecordId) throw new ConsumerMealItemMappingFailedError("Meal item parent did not match the meal record.");
  const userId = requiredString(row.user_id, "meal item user_id");
  if (userId !== currentUserId) throw new ConsumerMealItemMappingFailedError("Meal item owner did not match the authenticated session.");
  const displayName = requiredString(row.display_name_snapshot, "display_name_snapshot");
  const nutritionSource = enumValue(row.nutrition_source, nutritionSources, "nutrition_source", ConsumerMealItemMappingFailedError);
  const correctionStatus = enumValue(row.correction_status, correctionStatuses, "correction_status", ConsumerMealItemMappingFailedError);

  return {
    mealRecordItemId: itemId,
    restaurantId: row.restaurant_id ?? null,
    branchId: row.branch_id ?? null,
    menuId: row.menu_id ?? null,
    menuItemId: row.menu_item_id ?? null,
    displayName,
    userEnteredName: row.user_entered_name ?? null,
    aiDetectedName: row.ai_detected_name ?? null,
    normalizedName: row.normalized_name ?? null,
    portion: row.portion_snapshot ?? null,
    nutrition: mapNutritionSnapshot(row.nutrition_snapshot),
    nutritionSource,
    nutritionSchemaVersion: requiredString(row.nutrition_schema_version, "nutrition_schema_version"),
    sourceEntityVersion: row.source_entity_version ?? null,
    occurredAt: timestamp(row.occurred_at, "item occurred_at", ConsumerMealItemMappingFailedError),
    timezone: requiredString(row.timezone, "item timezone"),
    confidenceScore: optionalFiniteNumber(row.confidence_score, "confidence_score", ConsumerMealItemMappingFailedError),
    consumedRatio: finiteNumber(row.consumed_ratio, "consumed_ratio", ConsumerMealItemMappingFailedError),
    correctionStatus,
    createdAt: timestamp(row.created_at, "item created_at", ConsumerMealItemMappingFailedError),
    updatedAt: timestamp(row.updated_at, "item updated_at", ConsumerMealItemMappingFailedError)
  };
}

function mapNutritionSnapshot(value: unknown): ConsumerNutritionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    calories: optionalFiniteNumber(raw.calories ?? raw.kcal, "nutrition.calories", ConsumerMealItemMappingFailedError) ?? undefined,
    protein: optionalFiniteNumber(raw.protein, "nutrition.protein", ConsumerMealItemMappingFailedError) ?? undefined,
    carbohydrates: optionalFiniteNumber(raw.carbohydrates ?? raw.carbs, "nutrition.carbohydrates", ConsumerMealItemMappingFailedError) ?? undefined,
    fat: optionalFiniteNumber(raw.fat, "nutrition.fat", ConsumerMealItemMappingFailedError) ?? undefined,
    fiber: optionalFiniteNumber(raw.fiber, "nutrition.fiber", ConsumerMealItemMappingFailedError) ?? undefined
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ConsumerMealRecordMappingFailedError(`Missing ${label}.`);
  return value;
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

function timestamp(value: unknown, label: string, ErrorClass: new (message?: string) => Error): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new ErrorClass(`Invalid ${label}.`);
  return value;
}

function dateKey(value: unknown, label: string, ErrorClass: new (message?: string) => Error): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ErrorClass(`Invalid ${label}.`);
  return value;
}

function finiteNumber(value: unknown, label: string, ErrorClass: new (message?: string) => Error): number {
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) throw new ErrorClass(`Invalid ${label}.`);
  return numberValue;
}

function optionalFiniteNumber(value: unknown, label: string, ErrorClass: new (message?: string) => Error): number | null {
  if (value === undefined || value === null) return null;
  return finiteNumber(value, label, ErrorClass);
}
