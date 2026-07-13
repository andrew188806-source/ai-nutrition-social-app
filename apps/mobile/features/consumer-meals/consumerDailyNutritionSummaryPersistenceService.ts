import {
  ConsumerDailySummaryInvalidDateError,
  ConsumerDailySummaryRuleUnavailableError
} from "../consumer-auth/errors";
import { calculateDailyNutritionSummary } from "./dailyNutritionSummaryCalculator";
import type { ConsumerMealRecordsService } from "./consumerMealRecordsService";
import type {
  ConsumerDailyNutritionSummary,
  ConsumerDailyNutritionSummaryPersistencePayload,
  ConsumerDailyNutritionSummaryPersistenceRepository,
  ConsumerDailyNutritionSummaryPersistenceResult,
  PersistDailyNutritionSummaryInput
} from "./types";

const DEFAULT_TIMEZONE = "Asia/Taipei";

export type ConsumerDailyNutritionSummaryPersistenceClock = {
  now(): Date;
};

export type ConsumerDailyNutritionSummaryPersistenceServiceOptions = {
  mealRecordsService: ConsumerMealRecordsService;
  repository: ConsumerDailyNutritionSummaryPersistenceRepository;
  clock: ConsumerDailyNutritionSummaryPersistenceClock;
  timezone?: string;
};

export class ConsumerDailyNutritionSummaryPersistenceService {
  constructor(private readonly options: ConsumerDailyNutritionSummaryPersistenceServiceOptions) {}

  async persistCurrentUserDailyNutritionSummary(input: PersistDailyNutritionSummaryInput): Promise<ConsumerDailyNutritionSummaryPersistenceResult> {
    const timezone = this.options.timezone ?? DEFAULT_TIMEZONE;
    if (!isDateKey(input.summaryDate)) {
      return result("invalid_input", this.options.repository.source, input.summaryDate, timezone, "daily_summary_persistence_invalid_input");
    }

    const mealsResult = await this.options.mealRecordsService.listCurrentUserMealRecords({
      startDate: input.summaryDate,
      endDate: input.summaryDate,
      limit: 100
    });
    if (!mealsResult.ok) {
      const status = isAuthenticationError(mealsResult.error.code) ? "unauthenticated" : "read_failed";
      return result(status, this.options.repository.source, input.summaryDate, timezone, mealsResult.error.code);
    }

    const calculated = calculateDailyNutritionSummary({
      summaryDate: input.summaryDate,
      timezone,
      calculatedAt: this.options.clock.now().toISOString(),
      mealRecords: mealsResult.value
    });
    if (!calculated.ok) {
      const errorCode = calculated.error instanceof ConsumerDailySummaryRuleUnavailableError || calculated.error instanceof ConsumerDailySummaryInvalidDateError
        ? calculated.error.code
        : "daily_summary_calculation_failed";
      return result("calculation_failed", this.options.repository.source, input.summaryDate, timezone, errorCode);
    }

    return this.options.repository.persistCurrentUserDailyNutritionSummary(toPersistencePayload(calculated.value));
  }
}

function toPersistencePayload(summary: ConsumerDailyNutritionSummary): ConsumerDailyNutritionSummaryPersistencePayload {
  return {
    summaryDate: summary.summaryDate,
    timezone: summary.timezone,
    calculationVersion: summary.calculationVersion,
    calories: summary.calories,
    protein: summary.protein,
    carbohydrates: summary.carbohydrates,
    fat: summary.fat,
    fiber: summary.fiber,
    mealCount: summary.mealCount,
    itemCount: summary.itemCount,
    itemCountAvailable: summary.itemCountAvailable,
    sourceCutoffAt: summary.sourceCutoffAt,
    recalculatedAt: summary.recalculatedAt,
    isCurrent: summary.isCurrent
  };
}

function result(
  status: ConsumerDailyNutritionSummaryPersistenceResult["status"],
  source: ConsumerDailyNutritionSummaryPersistenceResult["source"],
  summaryDate: string,
  timezone: string,
  errorCode?: string
): ConsumerDailyNutritionSummaryPersistenceResult {
  return {
    status,
    summaryDate,
    timezone,
    identity: "authenticated_user_summary_date",
    source,
    errorCode
  };
}

function isAuthenticationError(code: string): boolean {
  return code === "meal_session_missing" || code === "meal_session_expired" || code === "meal_unauthorized";
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
