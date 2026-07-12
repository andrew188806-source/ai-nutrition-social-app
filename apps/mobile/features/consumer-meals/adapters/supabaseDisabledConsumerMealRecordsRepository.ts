import { ConsumerMealSourceUnavailableError } from "../../consumer-auth/errors";
import { err } from "../../consumer-auth/types";
import type { ConsumerMealReadInput, ConsumerMealRecordsRepository } from "../types";

export class SupabaseDisabledConsumerMealRecordsRepository implements ConsumerMealRecordsRepository {
  readonly source = "supabase-disabled" as const;

  async listCurrentUserMealRecords(_input: ConsumerMealReadInput = {}) {
    return err(new ConsumerMealSourceUnavailableError("Consumer meal records live reads are disabled in Consumer Runtime Phase 2A."));
  }
}
