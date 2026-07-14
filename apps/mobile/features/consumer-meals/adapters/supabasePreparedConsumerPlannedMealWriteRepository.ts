import {
  SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
  SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
  SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION
} from "../supabaseMealContracts";
import {
  toSupabaseRemovePlannedMealRpcArgs,
  toSupabaseSavePlannedMealRpcArgs,
  toSupabaseUpdatePlannedMealRpcArgs
} from "../plannedMealWriteMappers";
import type {
  CanonicalPlannedMealRemovePayload,
  CanonicalPlannedMealUpdatePayload,
  CanonicalPlannedMealWritePayload,
  ConsumerPlannedMealWriteOperation,
  ConsumerPlannedMealWriteRepository,
  ConsumerPlannedMealWriteResult
} from "../types";

// Deprecated after Phase 2O. Use SupabaseConsumerPlannedMealWriteRepository (source: "supabase") instead.
// Source is now "disabled" since "supabase_prepared" is no longer a valid ConsumerPlannedMealsWriteSource.
export class SupabasePreparedConsumerPlannedMealWriteRepository implements ConsumerPlannedMealWriteRepository {
  readonly source = "disabled" as const;
  readonly saveFunction = SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION;
  readonly updateFunction = SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION;
  readonly removeFunction = SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION;

  async save(payload: CanonicalPlannedMealWritePayload): Promise<ConsumerPlannedMealWriteResult> {
    toSupabaseSavePlannedMealRpcArgs(payload);
    return unavailable("save", payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== null);
  }

  async updatePlannedMeal(payload: CanonicalPlannedMealUpdatePayload): Promise<ConsumerPlannedMealWriteResult> {
    toSupabaseUpdatePlannedMealRpcArgs(payload);
    return unavailable("update", payload.plannedFor, payload.mealType, payload.nutritionSnapshot !== undefined);
  }

  async remove(payload: CanonicalPlannedMealRemovePayload): Promise<ConsumerPlannedMealWriteResult> {
    toSupabaseRemovePlannedMealRpcArgs(payload);
    return {
      status: "skipped",
      operation: "remove",
      source: this.source,
      identity: "authenticated_user_planned_meal",
      plannedMealId: payload.plannedMealId,
      errorCode: "planned_meal_write_prepared_not_live"
    };
  }
}

function unavailable(
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
    errorCode: "planned_meal_write_prepared_not_live"
  };
}
