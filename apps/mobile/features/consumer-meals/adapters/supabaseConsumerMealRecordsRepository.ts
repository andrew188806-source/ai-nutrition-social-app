import {
  ConsumerMealItemMappingFailedError,
  ConsumerMealRecordMappingFailedError,
  ConsumerMealSessionExpiredError,
  ConsumerMealSessionMissingError,
  ConsumerMealSourceUnavailableError,
  ConsumerMealTransportFailedError,
  ConsumerMealUnauthorizedError,
  ConsumerSessionExpiredError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { err, ok } from "../../consumer-auth/types";
import { resolveMealReadRange } from "../readRange";
import {
  SUPABASE_CONSUMER_MEAL_RECORD_SELECT_COLUMNS,
  SUPABASE_CONSUMER_MEAL_RECORDS_TABLE,
  type SupabaseConsumerMealClientLike,
  type SupabaseMealPostgrestErrorLike
} from "../supabaseMealContracts";
import { mapSupabaseMealRecordRowToConsumerMealRecord } from "../supabaseMealMappers";
import type { ConsumerMealReadInput, ConsumerMealRecordsRepository } from "../types";

export type SupabaseConsumerMealRecordsRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealClient: SupabaseConsumerMealClientLike;
  readEnabled: boolean;
};

export class SupabaseConsumerMealRecordsRepository implements ConsumerMealRecordsRepository {
  readonly source = "supabase-live" as const;

  constructor(private readonly options: SupabaseConsumerMealRecordsRepositoryOptions) {}

  async listCurrentUserMealRecords(input: ConsumerMealReadInput = {}) {
    if (!this.options.readEnabled) return err(new ConsumerMealSourceUnavailableError("Consumer live meal reads are disabled by feature flag."));
    const range = resolveMealReadRange(input);
    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok) {
      if (sessionResult.error instanceof ConsumerSessionExpiredError || sessionResult.error.code === "session_expired") {
        return err(new ConsumerMealSessionExpiredError());
      }
      return err(new ConsumerMealUnauthorizedError("Current auth session could not be verified for meal read."));
    }
    const session = sessionResult.value;
    if (!session) return err(new ConsumerMealSessionMissingError());
    const userId = session.user.userId;

    try {
      const response = await this.options.mealClient
        .from(SUPABASE_CONSUMER_MEAL_RECORDS_TABLE)
        .select(SUPABASE_CONSUMER_MEAL_RECORD_SELECT_COLUMNS)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("meal_date", range.startDate)
        .lte("meal_date", range.endDate)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(range.limit);
      if (response.error) return err(mapMealTransportError(response.error));
      const rows = response.data ?? [];
      return ok(rows.map((row) => mapSupabaseMealRecordRowToConsumerMealRecord(row, userId)));
    } catch (error) {
      if (error instanceof ConsumerMealRecordMappingFailedError || error instanceof ConsumerMealItemMappingFailedError) return err(error);
      return err(new ConsumerMealTransportFailedError("Consumer live meal read transport threw before rows could be mapped."));
    }
  }
}

function mapMealTransportError(error: SupabaseMealPostgrestErrorLike) {
  if (error.status === 401 || error.status === 403) return new ConsumerMealUnauthorizedError();
  if (error.message?.toLowerCase().includes("configuration")) return new ConsumerMealTransportFailedError("Consumer live meal configuration is invalid.");
  return new ConsumerMealTransportFailedError("Consumer live meal read failed.");
}
