import {
  ConsumerDailySummaryNotFoundError,
  ConsumerDailySummaryRuleUnavailableError,
  ConsumerDailySummarySourceUnavailableError,
  ConsumerMealSessionExpiredError,
  ConsumerMealSessionMissingError,
  ConsumerMealTransportFailedError,
  ConsumerMealUnauthorizedError,
  ConsumerTodayIntakeOverviewAuthenticationRequiredError,
  ConsumerTodayIntakeOverviewCalculationFailedError,
  ConsumerTodayIntakeOverviewInvalidDateError,
  ConsumerTodayIntakeOverviewMealReadFailedError
} from "../consumer-auth/errors";
import { err, ok, type ConsumerAuthResult } from "../consumer-auth/types";
import { calculateDailyNutritionSummary, compareStoredAndCalculatedDailyNutritionSummary } from "./dailyNutritionSummaryCalculator";
import type { ConsumerDailyNutritionSummaryService } from "./consumerDailyNutritionSummaryService";
import type { ConsumerMealRecordsService } from "./consumerMealRecordsService";
import type { ConsumerPlannedMealsService } from "./consumerPlannedMealsService";
import type {
  ConsumerDailyNutritionSource,
  ConsumerMealRecordsSource,
  ConsumerPlannedMealOverview,
  ConsumerTodayIntakeOverview,
  ConsumerTodayIntakeOverviewInput,
  ConsumerTodayIntakeOverviewStatus,
  ConsumerTodayIntakeOverviewWarning
} from "./types";

const DEFAULT_TIMEZONE = "Asia/Taipei";

export type ConsumerTodayIntakeOverviewClock = {
  now(): Date;
};

export type ConsumerTodayIntakeOverviewServiceOptions = {
  mealRecordsService: ConsumerMealRecordsService;
  dailyNutritionSummaryService: ConsumerDailyNutritionSummaryService;
  plannedMealsService?: ConsumerPlannedMealsService;
  plannedMealsRepository?: {
    listCurrentUserPlannedMeals(input: { date: string }): Promise<ConsumerAuthResult<ConsumerPlannedMealOverview[]>>;
  };
  clock: ConsumerTodayIntakeOverviewClock;
  mealRecordsSource: ConsumerMealRecordsSource;
  dailyNutritionSource: ConsumerDailyNutritionSource;
  timezone?: string;
};

export class ConsumerTodayIntakeOverviewService {
  constructor(private readonly options: ConsumerTodayIntakeOverviewServiceOptions) {}

  async getCurrentUserTodayIntakeOverview(input: ConsumerTodayIntakeOverviewInput = {}): Promise<ConsumerAuthResult<ConsumerTodayIntakeOverview>> {
    const timezone = this.options.timezone ?? DEFAULT_TIMEZONE;
    const now = this.options.clock.now();
    const generatedAt = now.toISOString();
    const date = input.date ?? toDateKeyInTimeZone(now, timezone);
    if (!isDateKey(date)) return err(new ConsumerTodayIntakeOverviewInvalidDateError());

    const mealsResult = await this.options.mealRecordsService.listCurrentUserMealRecords({
      startDate: date,
      endDate: date,
      limit: 100
    });
    if (!mealsResult.ok) return err(mapMealReadError(mealsResult.error));

    const meals = mealsResult.value;
    const calculated = calculateDailyNutritionSummary({
      summaryDate: date,
      timezone,
      calculatedAt: generatedAt,
      mealRecords: meals
    });
    if (!calculated.ok) {
      if (calculated.error instanceof ConsumerDailySummaryRuleUnavailableError) {
        return err(new ConsumerTodayIntakeOverviewCalculationFailedError("Consumer Today Intake overview calculation rule is unavailable."));
      }
      return err(new ConsumerTodayIntakeOverviewCalculationFailedError());
    }

    const warnings: ConsumerTodayIntakeOverviewWarning[] = [];
    const storedResult = await this.options.dailyNutritionSummaryService.getCurrentUserDailyNutritionSummary({ summaryDate: date, timezone });
    const storedNutrition = storedResult.ok ? storedResult.value : null;
    let storedSummaryStatus: ConsumerTodayIntakeOverview["storedSummaryStatus"] = "available";
    if (!storedResult.ok) {
      if (storedResult.error instanceof ConsumerDailySummaryNotFoundError || storedResult.error.code === "daily_summary_not_found") {
        storedSummaryStatus = "unavailable";
        warnings.push("stored_summary_unavailable");
      } else if (storedResult.error instanceof ConsumerDailySummarySourceUnavailableError || storedResult.error.code === "daily_summary_source_unavailable") {
        storedSummaryStatus = "unavailable";
        warnings.push("stored_summary_unavailable");
      } else {
        storedSummaryStatus = "error";
        warnings.push("stored_summary_error");
      }
    }

    if (storedNutrition) {
      const parity = compareStoredAndCalculatedDailyNutritionSummary(storedNutrition, calculated.value);
      if (!parity.ok || !parity.value.matches) warnings.push("stored_summary_parity_mismatch");
    }

    const plannedMealsResult = this.options.plannedMealsService
      ? await this.options.plannedMealsService.getCurrentUserPlannedMeals({ plannedDate: date })
      : this.options.plannedMealsRepository
        ? mapLegacyPlannedMealsResult(date, await this.options.plannedMealsRepository.listCurrentUserPlannedMeals({ date }))
        : null;
    const plannedMeals = plannedMealsResult?.status === "available"
      ? plannedMealsResult.meals.map((meal) => ({
          plannedMealId: meal.plannedMealId,
          date: meal.plannedDate,
          mealTime: meal.plannedTime,
          mealType: meal.mealType,
          title: meal.title ?? "",
          restaurantName: meal.restaurantName,
          note: meal.note ?? null,
          estimatedNutrition: meal.estimatedNutrition
        }))
      : [];
    let plannedMealsStatus: ConsumerTodayIntakeOverview["plannedMealsStatus"] = "unavailable";
    if (!plannedMealsResult) {
      warnings.push("planned_meals_unavailable");
    }
    if (plannedMealsResult?.status === "available") {
      plannedMealsStatus = "available";
    } else if (plannedMealsResult?.status === "empty") {
      plannedMealsStatus = "empty";
    } else if (plannedMealsResult?.status === "unavailable") {
      plannedMealsStatus = "unavailable";
      warnings.push("planned_meals_unavailable");
    } else if (plannedMealsResult) {
      plannedMealsStatus = "error";
      warnings.push("planned_meals_error");
    }

    const mealCount = meals.length;
    const itemCount = calculated.value.itemCount ?? 0;
    const actualConsumedStatus = mealCount > 0 ? "available" : "empty";
    const status = resolveOverviewStatus({
      mealCount,
      storedSummaryStatus,
      plannedMealsStatus,
      warnings
    });

    return ok({
      date,
      timezone,
      meals,
      calculatedNutrition: calculated.value,
      storedNutrition,
      storedSummaryStatus,
      mealCount,
      itemCount,
      actualConsumedStatus,
      plannedMeals,
      plannedMealsStatus,
      provenance: {
        meals: this.options.mealRecordsSource,
        calculatedNutrition: "calculated",
        storedNutrition: storedSummaryStatus === "unavailable" ? "unavailable" : this.options.dailyNutritionSource,
        plannedMeals: plannedMealsResult ? this.options.plannedMealsService?.source ?? "mock" : "unavailable"
      },
      warnings,
      status,
      generatedAt
    });
  }
}

function mapLegacyPlannedMealsResult(date: string, result: ConsumerAuthResult<ConsumerPlannedMealOverview[]>) {
  if (!result.ok) {
    return { status: "read_failed" as const, plannedDate: date, errorCode: result.error.code };
  }
  return result.value.length > 0
    ? {
        status: "available" as const,
        plannedDate: date,
        meals: result.value.map((meal) => ({
          plannedMealId: meal.plannedMealId ?? `legacy-planned-${meal.mealTime ?? meal.title}`,
          plannedDate: meal.date || date,
          plannedTime: meal.mealTime ?? null,
          mealType: null,
          title: meal.title,
          restaurantName: meal.restaurantName ?? null,
          estimatedNutrition: meal.estimatedNutrition ?? null,
          status: "planned" as const,
          note: meal.note ?? null,
          items: []
        }))
      }
    : { status: "empty" as const, plannedDate: date, meals: [] };
}

function mapMealReadError(error: { code: string }) {
  if (
    error instanceof ConsumerMealSessionMissingError ||
    error instanceof ConsumerMealSessionExpiredError ||
    error instanceof ConsumerMealUnauthorizedError ||
    error.code === "meal_session_missing" ||
    error.code === "meal_session_expired" ||
    error.code === "meal_unauthorized"
  ) {
    return new ConsumerTodayIntakeOverviewAuthenticationRequiredError();
  }
  if (error.code === "meal_read_invalid_range") return new ConsumerTodayIntakeOverviewInvalidDateError();
  if (error instanceof ConsumerMealTransportFailedError || error.code === "meal_transport_failed") {
    return new ConsumerTodayIntakeOverviewMealReadFailedError();
  }
  return new ConsumerTodayIntakeOverviewMealReadFailedError();
}

function resolveOverviewStatus(input: {
  mealCount: number;
  storedSummaryStatus: ConsumerTodayIntakeOverview["storedSummaryStatus"];
  plannedMealsStatus: ConsumerTodayIntakeOverview["plannedMealsStatus"];
  warnings: ConsumerTodayIntakeOverviewWarning[];
}): ConsumerTodayIntakeOverviewStatus {
  const unavailableWarnings = new Set<ConsumerTodayIntakeOverviewWarning>([
    "stored_summary_missing",
    "stored_summary_unavailable",
    "planned_meals_unavailable"
  ]);
  const blockingWarnings = input.warnings.filter((warning) => !unavailableWarnings.has(warning));
  if (blockingWarnings.length > 0 || input.storedSummaryStatus === "error" || input.plannedMealsStatus === "error") return "partial";
  if (input.mealCount > 0 && input.warnings.some((warning) => unavailableWarnings.has(warning))) return "partial";
  return input.mealCount > 0 ? "complete" : "empty";
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function toDateKeyInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
