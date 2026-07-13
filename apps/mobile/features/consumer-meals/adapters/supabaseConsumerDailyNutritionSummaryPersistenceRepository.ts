import {
  ConsumerDailySummaryMappingFailedError,
  ConsumerDailySummaryPersistenceAuthenticationRequiredError,
  ConsumerDailySummaryPersistenceFailedError,
  ConsumerDailySummaryPersistenceUnavailableError,
  ConsumerSessionExpiredError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { mapSupabaseDailyNutritionSummaryRowToConsumerSummary } from "../dailyNutritionSummaryMappers";
import {
  SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION,
  type SupabaseConsumerMealClientLike,
  type SupabaseMealPostgrestErrorLike,
  type SupabasePersistDailyNutritionSummaryRpcArgs
} from "../supabaseMealContracts";
import type {
  ConsumerDailyNutritionSummaryPersistencePayload,
  ConsumerDailyNutritionSummaryPersistenceRepository,
  ConsumerDailyNutritionSummaryPersistenceResult
} from "../types";

export type SupabaseConsumerDailyNutritionSummaryPersistenceRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealClient: SupabaseConsumerMealClientLike;
  writeEnabled: boolean;
};

export class SupabaseConsumerDailyNutritionSummaryPersistenceRepository implements ConsumerDailyNutritionSummaryPersistenceRepository {
  readonly source = "supabase" as const;

  constructor(private readonly options: SupabaseConsumerDailyNutritionSummaryPersistenceRepositoryOptions) {}

  async persistCurrentUserDailyNutritionSummary(
    payload: ConsumerDailyNutritionSummaryPersistencePayload
  ): Promise<ConsumerDailyNutritionSummaryPersistenceResult> {
    if (!this.options.writeEnabled) {
      return unavailable(payload, this.source, "daily_summary_persistence_unavailable");
    }

    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok) {
      if (sessionResult.error instanceof ConsumerSessionExpiredError || sessionResult.error.code === "session_expired") {
        return unavailable(payload, this.source, "daily_summary_persistence_authentication_required", "unauthenticated");
      }
      return unavailable(payload, this.source, "daily_summary_unauthorized", "persistence_failed");
    }
    const session = sessionResult.value;
    if (!session) {
      return unavailable(payload, this.source, "daily_summary_persistence_authentication_required", "unauthenticated");
    }

    try {
      const response = await this.options.mealClient.rpc(
        SUPABASE_PERSIST_AUTHENTICATED_DAILY_NUTRITION_SUMMARY_FUNCTION,
        buildPersistDailyNutritionSummaryRpcArgs(payload)
      );
      if (response.error) {
        const mappedError = mapSummaryPersistenceRpcError(response.error);
        return unavailable(payload, this.source, mappedError.code, mappedError.code === "daily_summary_persistence_authentication_required" ? "unauthenticated" : "persistence_failed");
      }
      if (!response.data) {
        return unavailable(payload, this.source, "daily_summary_persistence_failed", "persistence_failed");
      }
      const stored = mapSupabaseDailyNutritionSummaryRowToConsumerSummary(response.data, session.user.userId);
      return {
        status: "persisted",
        summaryDate: stored.summaryDate,
        timezone: stored.timezone,
        mealCount: stored.mealCount,
        itemCount: payload.itemCount,
        nutrition: {
          calories: stored.calories,
          protein: stored.protein,
          carbohydrates: stored.carbohydrates,
          fat: stored.fat,
          fiber: stored.fiber
        },
        identity: "authenticated_user_summary_date",
        source: this.source
      };
    } catch (error) {
      if (error instanceof ConsumerDailySummaryMappingFailedError) {
        return unavailable(payload, this.source, error.code, "persistence_failed");
      }
      return unavailable(payload, this.source, "daily_summary_persistence_failed", "persistence_failed");
    }
  }
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

function unavailable(
  payload: ConsumerDailyNutritionSummaryPersistencePayload,
  source: "supabase",
  errorCode: string,
  status: ConsumerDailyNutritionSummaryPersistenceResult["status"] = "persistence_unavailable"
): ConsumerDailyNutritionSummaryPersistenceResult {
  return {
    status,
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
    source,
    errorCode
  };
}

function mapSummaryPersistenceRpcError(error: SupabaseMealPostgrestErrorLike) {
  const message = error.message?.toUpperCase() ?? "";
  if (error.status === 401 || error.status === 403 || error.code === "28000" || message.includes("AUTHENTICATION_REQUIRED")) {
    return new ConsumerDailySummaryPersistenceAuthenticationRequiredError();
  }
  if (error.status === 404 || message.includes("FUNCTION") || message.includes("NOT FOUND")) {
    return new ConsumerDailySummaryPersistenceUnavailableError();
  }
  return new ConsumerDailySummaryPersistenceFailedError();
}
