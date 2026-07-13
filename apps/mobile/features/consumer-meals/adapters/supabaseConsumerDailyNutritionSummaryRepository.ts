import {
  ConsumerDailySummaryMappingFailedError,
  ConsumerDailySummaryNotFoundError,
  ConsumerDailySummarySessionExpiredError,
  ConsumerDailySummarySessionMissingError,
  ConsumerDailySummarySourceUnavailableError,
  ConsumerDailySummaryTransportFailedError,
  ConsumerDailySummaryUnauthorizedError,
  ConsumerSessionExpiredError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err, ok } from "../../consumer-auth/types";
import { mapSupabaseDailyNutritionSummaryRowToConsumerSummary } from "../dailyNutritionSummaryMappers";
import {
  SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARIES_TABLE,
  SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARY_SELECT_COLUMNS,
  type SupabaseConsumerMealClientLike,
  type SupabaseMealPostgrestErrorLike
} from "../supabaseMealContracts";
import type {
  ConsumerDailyNutritionSummaryReadInput,
  ConsumerDailyNutritionSummaryRepository
} from "../types";

export type SupabaseConsumerDailyNutritionSummaryRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealClient: SupabaseConsumerMealClientLike;
  readEnabled: boolean;
};

export class SupabaseConsumerDailyNutritionSummaryRepository implements ConsumerDailyNutritionSummaryRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseConsumerDailyNutritionSummaryRepositoryOptions) {}

  async getCurrentUserDailyNutritionSummary(input: ConsumerDailyNutritionSummaryReadInput) {
    if (!this.options.readEnabled) {
      return err(new ConsumerDailySummarySourceUnavailableError("Consumer daily nutrition summary live reads are not enabled in Consumer Runtime Phase 2E."));
    }
    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok) {
      if (sessionResult.error instanceof ConsumerSessionExpiredError || sessionResult.error.code === "session_expired") {
        return err(new ConsumerDailySummarySessionExpiredError());
      }
      return err(new ConsumerDailySummaryUnauthorizedError());
    }
    const session = sessionResult.value;
    if (!session) return err(new ConsumerDailySummarySessionMissingError());
    const userId = session.user.userId;

    try {
      const response = await this.options.mealClient
        .from(SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARIES_TABLE)
        .select(SUPABASE_CONSUMER_DAILY_NUTRITION_SUMMARY_SELECT_COLUMNS)
        .eq("user_id", userId)
        .eq("local_date", input.summaryDate)
        .eq("timezone", input.timezone ?? "Asia/Taipei")
        .eq("is_current", "true")
        .limit(1);
      if (response.error) return err(mapSummaryTransportError(response.error));
      const rows = response.data ?? [];
      if (rows.length === 0) return err(new ConsumerDailySummaryNotFoundError());
      return ok(mapSupabaseDailyNutritionSummaryRowToConsumerSummary(rows[0], userId));
    } catch (error) {
      if (error instanceof ConsumerDailySummaryMappingFailedError) return err(error);
      return err(new ConsumerDailySummaryTransportFailedError("Consumer live daily nutrition summary read transport failed."));
    }
  }
}

function mapSummaryTransportError(error: SupabaseMealPostgrestErrorLike) {
  if (error.status === 401 || error.status === 403) return new ConsumerDailySummaryUnauthorizedError();
  return new ConsumerDailySummaryTransportFailedError("Consumer live daily nutrition summary read failed.");
}
