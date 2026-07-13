import {
  SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION,
  type SupabasePersistDailyNutritionSummaryRpcArgs
} from "../supabaseMealContracts";
import type {
  ConsumerDailyNutritionSummaryPersistencePayload,
  ConsumerDailyNutritionSummaryPersistenceRepository,
  ConsumerDailyNutritionSummaryPersistenceResult
} from "../types";

export class SupabasePreparedConsumerDailyNutritionSummaryPersistenceRepository implements ConsumerDailyNutritionSummaryPersistenceRepository {
  readonly source = "supabase_prepared" as const;

  async persistCurrentUserDailyNutritionSummary(
    payload: ConsumerDailyNutritionSummaryPersistencePayload
  ): Promise<ConsumerDailyNutritionSummaryPersistenceResult> {
    buildPersistDailyNutritionSummaryRpcArgs(payload);
    return {
      status: "persistence_unavailable",
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

export function getPreparedDailyNutritionSummaryPersistenceRpcName() {
  return SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION;
}

export function buildPersistDailyNutritionSummaryRpcArgs(
  payload: ConsumerDailyNutritionSummaryPersistencePayload
): SupabasePersistDailyNutritionSummaryRpcArgs {
  return {
    p_summary_date: payload.summaryDate,
    p_timezone: payload.timezone,
    p_calculation_version: payload.calculationVersion,
    p_total_calories: payload.calories,
    p_total_protein_g: payload.protein,
    p_total_carbohydrates_g: payload.carbohydrates,
    p_total_fat_g: payload.fat,
    p_total_fiber_g: payload.fiber,
    p_meal_count: payload.mealCount,
    p_item_count: payload.itemCount,
    p_source_cutoff_at: payload.sourceCutoffAt,
    p_recalculated_at: payload.recalculatedAt
  };
}
