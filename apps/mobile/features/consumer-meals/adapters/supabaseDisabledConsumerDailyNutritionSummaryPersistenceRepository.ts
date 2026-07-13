import type {
  ConsumerDailyNutritionSummaryPersistencePayload,
  ConsumerDailyNutritionSummaryPersistenceRepository,
  ConsumerDailyNutritionSummaryPersistenceResult
} from "../types";

export class SupabaseDisabledConsumerDailyNutritionSummaryPersistenceRepository implements ConsumerDailyNutritionSummaryPersistenceRepository {
  readonly source = "disabled" as const;

  async persistCurrentUserDailyNutritionSummary(
    payload: ConsumerDailyNutritionSummaryPersistencePayload
  ): Promise<ConsumerDailyNutritionSummaryPersistenceResult> {
    return {
      status: "skipped",
      summaryDate: payload.summaryDate,
      timezone: payload.timezone,
      mealCount: payload.mealCount,
      itemCount: payload.itemCount,
      nutrition: {
        calories: payload.calories,
        protein: payload.protein,
        carbohydrates: payload.carbohydrates,
        fat: payload.fat,
        fiber: payload.fiber
      },
      identity: "authenticated_user_summary_date",
      source: this.source,
      errorCode: "daily_summary_persistence_unavailable"
    };
  }
}
