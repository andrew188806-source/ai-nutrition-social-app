import type {
  CanonicalPlannedMealRemovePayload,
  CanonicalPlannedMealUpdatePayload,
  CanonicalPlannedMealWritePayload,
  ConsumerPlannedMealWriteOperation,
  ConsumerPlannedMealWriteRepository,
  ConsumerPlannedMealWriteResult
} from "../types";

export class SupabaseDisabledConsumerPlannedMealWriteRepository implements ConsumerPlannedMealWriteRepository {
  readonly source = "disabled" as const;

  async save(payload: CanonicalPlannedMealWritePayload): Promise<ConsumerPlannedMealWriteResult> {
    return skipped("save", payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== null);
  }

  async updatePlannedMeal(payload: CanonicalPlannedMealUpdatePayload): Promise<ConsumerPlannedMealWriteResult> {
    return skipped("update", payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== undefined);
  }

  async remove(payload: CanonicalPlannedMealRemovePayload): Promise<ConsumerPlannedMealWriteResult> {
    return {
      status: "skipped",
      operation: "remove",
      source: this.source,
      identity: "authenticated_user_planned_meal",
      plannedMealId: payload.plannedMealId,
      errorCode: "planned_meal_write_unavailable"
    };
  }
}

function skipped(
  operation: ConsumerPlannedMealWriteOperation,
  plannedFor: string | undefined,
  mealType: ConsumerPlannedMealWriteResult["mealType"],
  nutritionSnapshotAvailable: boolean
): ConsumerPlannedMealWriteResult {
  return {
    status: "skipped",
    operation,
    source: "disabled",
    identity: "authenticated_user_planned_meal",
    plannedFor,
    mealType,
    nutritionSnapshotAvailable,
    errorCode: "planned_meal_write_unavailable"
  };
}
