import {
  SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE,
  SUPABASE_CONSUMER_MEAL_CORRECTIONS_SELECT_COLUMNS,
  SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE
} from "../supabaseMealContracts";
import type {
  ConsumerMealCorrectionReadInput,
  ConsumerMealCorrectionReadResult,
  ConsumerMealCorrectionRepository,
  ConsumerMealCorrectionSource
} from "../types";

// Phase 2P architecture preparation only.
// No authenticated read grant exists yet for meal_analyses or meal_corrections.
// When the grant migration is added, this repository will be superseded by a live Supabase adapter.
//
// Future query:
//   from(SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE)
//     .select(SUPABASE_CONSUMER_MEAL_CORRECTIONS_SELECT_COLUMNS)
//     .eq("meal_record_id", input.mealRecordId)
//     .eq("user_id", userId)
export class SupabasePreparedConsumerMealCorrectionRepository implements ConsumerMealCorrectionRepository {
  readonly source: ConsumerMealCorrectionSource = "supabase-prepared";
  readonly analysisTable = SUPABASE_CONSUMER_MEAL_ANALYSES_TABLE;
  readonly correctionTable = SUPABASE_CONSUMER_MEAL_CORRECTIONS_TABLE;
  readonly correctionSelectColumns = SUPABASE_CONSUMER_MEAL_CORRECTIONS_SELECT_COLUMNS;

  async getCurrentUserMealCorrectionOverview(_input: ConsumerMealCorrectionReadInput): Promise<ConsumerMealCorrectionReadResult> {
    return {
      status: "grant_pending",
      correctionReadSource: this.source,
      errorCode: "correction_read_grant_pending"
    };
  }
}
