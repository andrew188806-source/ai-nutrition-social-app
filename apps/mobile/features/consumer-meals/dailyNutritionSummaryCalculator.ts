import {
  ConsumerDailySummaryInvalidNutritionError,
  ConsumerDailySummaryInvalidDateError,
  ConsumerDailySummaryParityMismatchError,
  ConsumerDailySummaryRuleUnavailableError
} from "../consumer-auth/errors";
import { err, ok, type ConsumerAuthResult } from "../consumer-auth/types";
import type {
  ConsumerMealRecord,
  ConsumerNutritionSnapshot,
  ConsumerDailyNutritionSummary,
  ConsumerDailyNutritionSummaryCalculationInput,
  ConsumerDailySummaryParityMetric,
  ConsumerDailySummaryParityResult
} from "./types";

const DEFAULT_TIMEZONE = "Asia/Taipei";
const DEFAULT_CALCULATION_VERSION = "consumer-daily-summary-v1";
const NUTRITION_KEYS = ["calories", "protein", "carbohydrates", "fat", "fiber"] as const;

export function calculateDailyNutritionSummary(
  input: ConsumerDailyNutritionSummaryCalculationInput
): ConsumerAuthResult<ConsumerDailyNutritionSummary> {
  if (!isDateKey(input.summaryDate)) return err(new ConsumerDailySummaryInvalidDateError());
  if (!isTimestamp(input.calculatedAt)) {
    return err(new ConsumerDailySummaryInvalidDateError("Consumer daily nutrition summary calculatedAt timestamp is invalid."));
  }
  if ((input.corrections?.length ?? 0) > 0) {
    return err(new ConsumerDailySummaryRuleUnavailableError("Meal correction application is deferred until correction rules are frozen."));
  }
  if ((input.consumptionAdjustments?.length ?? 0) > 0) {
    return err(new ConsumerDailySummaryRuleUnavailableError("Consumption adjustment application is deferred until adjustment rules are frozen."));
  }

  let calories = 0;
  let protein = 0;
  let carbohydrates = 0;
  let fat = 0;
  let fiber = 0;
  let itemCount = 0;
  const mealIds = new Set<string>();

  try {
    for (const record of input.mealRecords) {
      if (record.mealDate !== input.summaryDate) continue;
      let includedRecord = false;
      for (const item of record.items) {
        const consumedRatio = finiteNonNegative(item.consumedRatio, "consumedRatio");
        if (consumedRatio > 1) return err(new ConsumerDailySummaryInvalidNutritionError("Meal item consumedRatio must be between 0 and 1."));
        const nutrition = item.nutrition;
        const normalized = normalizeNutrition(nutrition);
        calories += normalized.calories * consumedRatio;
        protein += normalized.protein * consumedRatio;
        carbohydrates += normalized.carbohydrates * consumedRatio;
        fat += normalized.fat * consumedRatio;
        fiber += normalized.fiber * consumedRatio;
        itemCount += 1;
        includedRecord = true;
      }
      if (includedRecord) mealIds.add(record.mealRecordId);
    }
  } catch (error) {
    if (error instanceof ConsumerDailySummaryInvalidNutritionError) return err(error);
    return err(new ConsumerDailySummaryInvalidNutritionError());
  }

  return ok({
    summaryDate: input.summaryDate,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    calculationVersion: input.calculationVersion ?? DEFAULT_CALCULATION_VERSION,
    calories: roundNutrition(calories),
    protein: roundNutrition(protein),
    carbohydrates: roundNutrition(carbohydrates),
    fat: roundNutrition(fat),
    fiber: itemCount > 0 ? roundNutrition(fiber) : 0,
    mealCount: mealIds.size,
    itemCount,
    itemCountAvailable: true,
    sourceCutoffAt: input.sourceCutoffAt ?? input.calculatedAt,
    recalculatedAt: input.calculatedAt,
    isCurrent: true,
    provenance: "calculated",
    calculationStatus: itemCount > 0 ? "calculated" : "missing"
  });
}

export function compareStoredAndCalculatedDailyNutritionSummary(
  stored: ConsumerDailyNutritionSummary,
  calculated: ConsumerDailyNutritionSummary,
  tolerance = 0.01
): ConsumerAuthResult<ConsumerDailySummaryParityResult> {
  if (stored.summaryDate !== calculated.summaryDate || stored.timezone !== calculated.timezone) {
    return err(new ConsumerDailySummaryParityMismatchError("Stored and calculated summaries refer to different date or timezone."));
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return err(new ConsumerDailySummaryInvalidNutritionError("Summary parity tolerance is invalid."));
  }
  const differences = [
    diff("calories", stored.calories, calculated.calories, tolerance),
    diff("protein", stored.protein, calculated.protein, tolerance),
    diff("carbohydrates", stored.carbohydrates, calculated.carbohydrates, tolerance),
    diff("fat", stored.fat, calculated.fat, tolerance),
    diff("fiber", stored.fiber ?? 0, calculated.fiber ?? 0, tolerance),
    diff("mealCount", stored.mealCount, calculated.mealCount, tolerance),
    itemCountDiff(stored, calculated, tolerance)
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
  return ok({ matches: differences.length === 0, tolerance, differences });
}

function normalizeNutrition(nutrition: ConsumerNutritionSnapshot) {
  const normalized = {
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fat: 0,
    fiber: 0
  };
  for (const key of NUTRITION_KEYS) {
    const value = nutrition[key] ?? 0;
    normalized[key] = finiteNonNegative(value, key);
  }
  return normalized;
}

function finiteNonNegative(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ConsumerDailySummaryInvalidNutritionError(`Invalid daily nutrition ${label}.`);
  }
  return value;
}

function diff(metric: ConsumerDailySummaryParityMetric, stored: number, calculated: number, tolerance: number) {
  const delta = roundNutrition(calculated - stored);
  return Math.abs(delta) > tolerance ? { metric, stored, calculated, delta } : null;
}

function itemCountDiff(stored: ConsumerDailyNutritionSummary, calculated: ConsumerDailyNutritionSummary, tolerance: number) {
  if (!stored.itemCountAvailable || !calculated.itemCountAvailable || stored.itemCount === null || calculated.itemCount === null) {
    return null;
  }
  return diff("itemCount", stored.itemCount, calculated.itemCount, tolerance);
}

function roundNutrition(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimestamp(value: string): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
