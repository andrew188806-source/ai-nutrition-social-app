import { ConsumerDailySummarySourceUnavailableError } from "../../consumer-auth/errors";
import { err } from "../../consumer-auth/types";
import type {
  ConsumerDailyNutritionSummaryReadInput,
  ConsumerDailyNutritionSummaryRepository
} from "../types";

export class SupabaseDisabledConsumerDailyNutritionSummaryRepository implements ConsumerDailyNutritionSummaryRepository {
  readonly source = "supabase-disabled" as const;

  async getCurrentUserDailyNutritionSummary(_input: ConsumerDailyNutritionSummaryReadInput) {
    return err(new ConsumerDailySummarySourceUnavailableError("Consumer daily nutrition summary live reads are disabled in Consumer Runtime Phase 2E."));
  }
}
