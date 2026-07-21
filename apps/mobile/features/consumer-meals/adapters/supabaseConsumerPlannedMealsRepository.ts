import {
  ConsumerMealRecordMappingFailedError,
  ConsumerMealSourceUnavailableError,
  ConsumerMealTransportFailedError,
  ConsumerMealUnauthorizedError,
  ConsumerSessionExpiredError
} from "../../consumer-auth/errors";
import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import { mapSupabasePlannedMealRowToConsumerPlannedMeal } from "../plannedMealMappers";
import {
  SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS,
  SUPABASE_CONSUMER_PLANNED_MEALS_TABLE,
  type SupabaseConsumerMealClientLike,
  type SupabaseMealPostgrestErrorLike
} from "../supabaseMealContracts";
import type { CanonicalPlannedMealsRepositoryInput, ConsumerPlannedMealsReadResult, ConsumerPlannedMealsRepository } from "../types";

export type SupabaseConsumerPlannedMealsRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealClient: SupabaseConsumerMealClientLike;
  readEnabled: boolean;
};

export class SupabaseConsumerPlannedMealsRepository implements ConsumerPlannedMealsRepository {
  readonly source = "supabase" as const;

  constructor(private readonly options: SupabaseConsumerPlannedMealsRepositoryOptions) {}

  async getCurrentUserPlannedMeals(input: CanonicalPlannedMealsRepositoryInput): Promise<ConsumerPlannedMealsReadResult> {
    if (!this.options.readEnabled) {
      return {
        status: "unavailable" as const,
        plannedDate: input.plannedDate,
        reason: "phase_not_started" as const
      };
    }

    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok) {
      if (sessionResult.error instanceof ConsumerSessionExpiredError || sessionResult.error.code === "session_expired") {
        return { status: "unauthenticated" as const, plannedDate: input.plannedDate };
      }
      return { status: "unauthenticated" as const, plannedDate: input.plannedDate };
    }
    const session = sessionResult.value;
    if (!session) return { status: "unauthenticated" as const, plannedDate: input.plannedDate };
    const userId = session.user.userId;

    try {
      const response = await this.options.mealClient
        .from(SUPABASE_CONSUMER_PLANNED_MEALS_TABLE)
        .select(SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS)
        .eq("user_id", userId)
        .eq("planned_for", input.plannedDate)
        .order("planned_for", { ascending: true })
        .order("planned_local_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(100);
      if (response.error) {
        return { status: "read_failed" as const, plannedDate: input.plannedDate, errorCode: mapPlannedMealsTransportError(response.error).code };
      }
      const rows = response.data ?? [];
      if (rows.length === 0) return { status: "empty" as const, plannedDate: input.plannedDate, meals: [] };
      return {
        status: "available" as const,
        plannedDate: input.plannedDate,
        meals: rows.map((row) => mapSupabasePlannedMealRowToConsumerPlannedMeal(row, userId))
      };
    } catch (error) {
      if (error instanceof ConsumerMealRecordMappingFailedError) {
        return { status: "read_failed" as const, plannedDate: input.plannedDate, errorCode: error.code };
      }
      return { status: "read_failed" as const, plannedDate: input.plannedDate, errorCode: new ConsumerMealTransportFailedError().code };
    }
  }
}

function mapPlannedMealsTransportError(error: SupabaseMealPostgrestErrorLike) {
  if (error.status === 401 || error.status === 403) return new ConsumerMealUnauthorizedError();
  if (error.message?.toLowerCase().includes("configuration")) return new ConsumerMealSourceUnavailableError();
  return new ConsumerMealTransportFailedError("Consumer live planned meals read failed.");
}
