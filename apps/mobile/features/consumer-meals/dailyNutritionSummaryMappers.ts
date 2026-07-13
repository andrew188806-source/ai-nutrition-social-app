import { ConsumerDailySummaryMappingFailedError } from "../consumer-auth/errors";
import type { ConsumerDailyNutritionSummary } from "./types";
import type { SupabaseDailyNutritionSummaryRowLike } from "./supabaseMealContracts";

export function mapSupabaseDailyNutritionSummaryRowToConsumerSummary(
  row: SupabaseDailyNutritionSummaryRowLike,
  currentUserId: string
): ConsumerDailyNutritionSummary {
  const userId = requiredString(row.user_id, "daily summary user_id");
  if (userId !== currentUserId) {
    throw new ConsumerDailySummaryMappingFailedError("Daily nutrition summary owner did not match the authenticated session.");
  }
  return {
    summaryDate: dateKey(row.local_date, "local_date"),
    timezone: requiredString(row.timezone, "timezone"),
    calculationVersion: requiredString(row.calculation_version, "calculation_version"),
    calories: nonNegativeNumber(row.total_calories, "total_calories"),
    protein: nonNegativeNumber(row.total_protein_g, "total_protein_g"),
    carbohydrates: nonNegativeNumber(row.total_carbohydrates_g, "total_carbohydrates_g"),
    fat: nonNegativeNumber(row.total_fat_g, "total_fat_g"),
    fiber: optionalNonNegativeNumber(row.total_fiber_g, "total_fiber_g"),
    mealCount: nonNegativeInteger(row.meal_count, "meal_count"),
    itemCount: null,
    itemCountAvailable: false,
    sourceCutoffAt: timestampOrNull(row.source_cutoff_at, "source_cutoff_at"),
    recalculatedAt: timestamp(row.recalculated_at, "recalculated_at"),
    isCurrent: row.is_current === true,
    provenance: "stored",
    calculationStatus: row.is_current === true ? "current" : "deferred"
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConsumerDailySummaryMappingFailedError(`Missing ${label}.`);
  }
  return value;
}

function dateKey(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConsumerDailySummaryMappingFailedError(`Invalid ${label}.`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ConsumerDailySummaryMappingFailedError(`Invalid ${label}.`);
  }
  return value;
}

function timestampOrNull(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return timestamp(value, label);
}

function nonNegativeNumber(value: unknown, label: string): number {
  const numberValue = typeof value === "string" ? Number(value) : value;
  if (typeof numberValue !== "number" || !Number.isFinite(numberValue) || numberValue < 0) {
    throw new ConsumerDailySummaryMappingFailedError(`Invalid ${label}.`);
  }
  return numberValue;
}

function optionalNonNegativeNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return nonNegativeNumber(value, label);
}

function nonNegativeInteger(value: unknown, label: string): number {
  const numberValue = nonNegativeNumber(value, label);
  if (!Number.isInteger(numberValue)) throw new ConsumerDailySummaryMappingFailedError(`Invalid ${label}.`);
  return numberValue;
}
