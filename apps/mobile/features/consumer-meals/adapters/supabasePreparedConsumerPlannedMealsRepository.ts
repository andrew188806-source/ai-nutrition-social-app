import {
  SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS,
  SUPABASE_CONSUMER_PLANNED_MEALS_TABLE
} from "../supabaseMealContracts";
import type { CanonicalPlannedMealsRepositoryInput, ConsumerPlannedMealsRepository } from "../types";

export class SupabasePreparedConsumerPlannedMealsRepository implements ConsumerPlannedMealsRepository {
  readonly source = "supabase_prepared" as const;
  readonly table = SUPABASE_CONSUMER_PLANNED_MEALS_TABLE;
  readonly selectColumns = SUPABASE_CONSUMER_PLANNED_MEALS_SELECT_COLUMNS;

  async getCurrentUserPlannedMeals(input: CanonicalPlannedMealsRepositoryInput) {
    return {
      status: "unavailable" as const,
      plannedDate: input.plannedDate,
      reason: "phase_not_started" as const
    };
  }
}
