import type { CanonicalPlannedMealsRepositoryInput, ConsumerPlannedMealsRepository } from "../types";

export class SupabaseDisabledConsumerPlannedMealsRepository implements ConsumerPlannedMealsRepository {
  readonly source = "disabled" as const;

  async getCurrentUserPlannedMeals(input: CanonicalPlannedMealsRepositoryInput) {
    return {
      status: "unavailable" as const,
      plannedDate: input.plannedDate,
      reason: "source_disabled" as const
    };
  }
}
