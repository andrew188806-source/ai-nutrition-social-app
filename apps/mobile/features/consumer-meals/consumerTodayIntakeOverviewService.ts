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
import type {
  ConsumerDailyNutritionSource,
  ConsumerMealRecordsSource,
  ConsumerPlannedMealsRepository,
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
  plannedMealsRepository?: ConsumerPlannedMealsRepository;
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

    const plannedMealsResult = this.options.plannedMealsRepository
      ? await this.options.plannedMealsRepository.listCurrentUserPlannedMeals({ date })
      : null;
    const plannedMeals = plannedMealsResult?.ok ? plannedMealsResult.value : [];
    let plannedMealsStatus: ConsumerTodayIntakeOverview["plannedMealsStatus"] = "unavailable";
    if (!plannedMealsResult) {
      warnings.push("planned_meals_unavailable");
    }
    if (plannedMealsResult?.ok) {
      plannedMealsStatus = plannedMeals.length > 0 ? "available" : "empty";
    } else if (plannedMealsResult && !plannedMealsResult.ok) {
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
        plannedMeals: plannedMealsResult ? "injected" : "unavailable"
      },
      warnings,
      status,
      generatedAt
    });
  }
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
