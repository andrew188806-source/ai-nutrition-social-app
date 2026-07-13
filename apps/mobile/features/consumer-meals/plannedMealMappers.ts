import { ConsumerMealRecordMappingFailedError } from "../consumer-auth/errors";
import type { SupabasePlannedMealRowLike } from "./supabaseMealContracts";
import type {
  ConsumerMealType,
  ConsumerNutritionSnapshot,
  ConsumerPlannedMeal,
  ConsumerPlannedMealStatusValue
} from "./types";

const mealTypes = new Set<ConsumerMealType>(["breakfast", "lunch", "dinner", "late_night", "snack", "other"]);
const plannedMealStatuses = new Set<ConsumerPlannedMealStatusValue>(["planned", "converted", "cancelled", "expired"]);

export function mapSupabasePlannedMealRowToConsumerPlannedMeal(row: SupabasePlannedMealRowLike, currentUserId: string): ConsumerPlannedMeal {
  const plannedMealId = requiredString(row.id, "planned meal id");
  const userId = requiredString(row.user_id, "planned meal user_id");
  if (userId !== currentUserId) throw new ConsumerMealRecordMappingFailedError("Planned meal owner did not match the authenticated session.");
  const plannedDate = dateKey(row.planned_for, "planned_for");
  const mealType = row.meal_type == null ? null : enumValue(row.meal_type, mealTypes, "meal_type");
  const status = enumValue(row.status, plannedMealStatuses, "status");
  const title = requiredString(row.display_name_snapshot, "display_name_snapshot");
  const estimatedNutrition = mapNutritionSnapshot(row.planned_nutrition_snapshot);

  return {
    plannedMealId,
    plannedDate,
    plannedTime: null,
    mealType,
    title,
    restaurantId: row.restaurant_id ?? null,
    branchId: row.branch_id ?? null,
    menuItemId: row.menu_item_id ?? null,
    restaurantName: null,
    estimatedNutrition,
    status,
    note: row.note ?? null,
    items: []
  };
}

function mapNutritionSnapshot(value: unknown): ConsumerNutritionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const snapshot = {
    calories: optionalFiniteNumber(raw.calories ?? raw.kcal) ?? undefined,
    protein: optionalFiniteNumber(raw.protein) ?? undefined,
    carbohydrates: optionalFiniteNumber(raw.carbohydrates ?? raw.carbs) ?? undefined,
    fat: optionalFiniteNumber(raw.fat) ?? undefined,
    fiber: optionalFiniteNumber(raw.fiber) ?? undefined
  };
  return Object.values(snapshot).some((value) => value !== undefined) ? snapshot : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ConsumerMealRecordMappingFailedError(`Missing ${label}.`);
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  if (typeof value === "string" && allowed.has(value as T)) return value as T;
  throw new ConsumerMealRecordMappingFailedError(`Invalid ${label}.`);
}

function dateKey(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ConsumerMealRecordMappingFailedError(`Invalid ${label}.`);
  return value;
}

function optionalFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) throw new ConsumerMealRecordMappingFailedError("Invalid planned nutrition value.");
  return numberValue;
}
