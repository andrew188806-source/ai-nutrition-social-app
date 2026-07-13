import type {
  ConsumerDailyNutritionSummaryPersistencePayload,
  ConsumerDailyNutritionSummaryPersistenceRepository,
  ConsumerDailyNutritionSummaryPersistenceResult
} from "../types";

export class MockConsumerDailyNutritionSummaryPersistenceRepository implements ConsumerDailyNutritionSummaryPersistenceRepository {
  readonly source = "mock" as const;
  private readonly summaries = new Map<string, ConsumerDailyNutritionSummaryPersistencePayload>();

  async persistCurrentUserDailyNutritionSummary(
    payload: ConsumerDailyNutritionSummaryPersistencePayload
  ): Promise<ConsumerDailyNutritionSummaryPersistenceResult> {
    this.summaries.set(summaryKey(payload), { ...payload });
    return {
      status: "persisted",
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
      source: this.source
    };
  }

  getPersistedSummary(summaryDate: string, timezone: string, calculationVersion: string) {
    return this.summaries.get(`${summaryDate}|${timezone}|${calculationVersion}`) ?? null;
  }
}

function summaryKey(payload: ConsumerDailyNutritionSummaryPersistencePayload): string {
  return `${payload.summaryDate}|${payload.timezone}|${payload.calculationVersion}`;
}
