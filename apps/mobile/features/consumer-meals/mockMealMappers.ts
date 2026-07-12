import type { SavedMealRecord } from "../analysis/types";
import type { ConsumerMealRecord, ConsumerMealSourceType, ConsumerMealType, ConsumerNutritionSourceType } from "./types";

const periodMap: Record<string, ConsumerMealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack"
};

export function mapSavedMealRecordToConsumerMealRecord(record: SavedMealRecord): ConsumerMealRecord {
  const mealRecordId = record.mealId ?? `mock-meal-${stableKey(record.date)}-${stableKey(record.mealName)}`;
  const occurredAt = `${toDateKey(record.date)}T12:00:00.000Z`;
  const source = mapMealSource(record.source);
  const itemName = record.mealName || record.restaurantName || "Meal";
  const calories = finiteOrZero(record.actualCalories ?? record.estimatedCalories ?? record.calories);
  const protein = finiteOrZero(record.protein);
  const carbohydrates = finiteOrZero(record.carbohydrates);
  const fat = finiteOrZero(record.fat);

  return {
    mealRecordId,
    mealType: mapMealType(record.mealPeriod),
    occurredAt,
    mealDate: toDateKey(record.date),
    timezone: "Asia/Taipei",
    title: record.mealName || null,
    note: record.ingredients || null,
    source,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    items: [
      {
        mealRecordItemId: `${mealRecordId}-item-1`,
        restaurantId: record.restaurantId ?? null,
        branchId: null,
        menuId: null,
        menuItemId: null,
        displayName: itemName,
        userEnteredName: record.mealName || null,
        aiDetectedName: null,
        normalizedName: itemName.toLowerCase(),
        portion: record.portion || null,
        nutrition: { calories, protein, carbohydrates, fat },
        nutritionSource: mapNutritionSource(source),
        nutritionSchemaVersion: "consumer-nutrition-snapshot-v1",
        sourceEntityVersion: null,
        occurredAt,
        timezone: "Asia/Taipei",
        confidenceScore: null,
        consumedRatio: 1,
        correctionStatus: "none",
        createdAt: occurredAt,
        updatedAt: occurredAt
      }
    ]
  };
}

function toDateKey(date: string): string {
  return date.replaceAll("/", "-");
}

function mapMealSource(source: SavedMealRecord["source"]): ConsumerMealSourceType {
  if (source === "restaurant" || source === "self_made" || source === "manual" || source === "ai_estimated") return source;
  return "manual";
}

function mapNutritionSource(source: ConsumerMealSourceType): ConsumerNutritionSourceType {
  if (source === "restaurant") return "restaurant_verified";
  if (source === "ai_estimated") return "ai_estimated";
  return "manual";
}

function mapMealType(period: string): ConsumerMealType {
  const lower = period.toLowerCase();
  return Object.entries(periodMap).find(([key]) => lower.includes(key))?.[1] ?? "other";
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stableKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "record";
}
