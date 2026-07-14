import type { ConsumerAuthPort } from "../../consumer-auth/ports";
import {
  SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
  SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
  SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
  type SupabaseConsumerMealClientLike,
  type SupabaseMealPostgrestErrorLike,
  type SupabaseRemovePlannedMealRpcResultLike,
  type SupabaseSavePlannedMealRpcResultLike,
  type SupabaseUpdatePlannedMealRpcResultLike
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
  ConsumerPlannedMealWriteRepository,
  ConsumerPlannedMealWriteResult
} from "../types";

export type SupabaseConsumerPlannedMealWriteRepositoryOptions = {
  authPort: ConsumerAuthPort;
  mealClient: SupabaseConsumerMealClientLike;
  writeEnabled: boolean;
};

export class SupabaseConsumerPlannedMealWriteRepository implements ConsumerPlannedMealWriteRepository {
  readonly source = "supabase" as const;

  constructor(private readonly options: SupabaseConsumerPlannedMealWriteRepositoryOptions) {}

  async save(payload: CanonicalPlannedMealWritePayload): Promise<ConsumerPlannedMealWriteResult> {
    if (!this.options.writeEnabled) {
      return writeResult("skipped", "save", this.source, { errorCode: "planned_meal_write_unavailable" });
    }

    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok || !sessionResult.value) {
      return writeResult("unauthenticated", "save", this.source, {
        plannedFor: payload.plannedFor,
        mealType: payload.mealType,
        nutritionSnapshotAvailable: payload.nutritionSnapshot !== null,
        errorCode: "planned_meal_write_authentication_required"
      });
    }

    try {
      const response = await this.options.mealClient.rpc(
        SUPABASE_SAVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
        toSupabaseSavePlannedMealRpcArgs(payload)
      );
      if (response.error) {
        return mapSaveError(response.error, payload, this.source);
      }
      const result = response.data as SupabaseSavePlannedMealRpcResultLike | null;
      if (!result?.planned_meal_id) {
        return writeResult("write_failed", "save", this.source, {
          plannedFor: payload.plannedFor,
          mealType: payload.mealType,
          nutritionSnapshotAvailable: payload.nutritionSnapshot !== null,
          errorCode: "planned_meal_save_no_result"
        });
      }
      return {
        status: "saved",
        operation: "save",
        source: this.source,
        identity: "authenticated_user_planned_meal",
        plannedMealId: result.planned_meal_id,
        plannedFor: result.planned_for ?? payload.plannedFor,
        mealType: payload.mealType,
        nutritionSnapshotAvailable: result.nutrition_snapshot_present === true
      };
    } catch {
      return writeResult("write_failed", "save", this.source, {
        plannedFor: payload.plannedFor,
        mealType: payload.mealType,
        nutritionSnapshotAvailable: payload.nutritionSnapshot !== null,
        errorCode: "planned_meal_save_transport_failed"
      });
    }
  }

  async updatePlannedMeal(payload: CanonicalPlannedMealUpdatePayload): Promise<ConsumerPlannedMealWriteResult> {
    if (!this.options.writeEnabled) {
      return writeResult("skipped", "update", this.source, { plannedMealId: payload.plannedMealId, errorCode: "planned_meal_write_unavailable" });
    }

    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok || !sessionResult.value) {
      return writeResult("unauthenticated", "update", this.source, {
        plannedMealId: payload.plannedMealId,
        errorCode: "planned_meal_write_authentication_required"
      });
    }

    try {
      const response = await this.options.mealClient.rpc(
        SUPABASE_UPDATE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
        toSupabaseUpdatePlannedMealRpcArgs(payload)
      );
      if (response.error) {
        return mapUpdateError(response.error, payload, this.source);
      }
      const result = response.data as SupabaseUpdatePlannedMealRpcResultLike | null;
      if (!result?.found) {
        return writeResult("not_found", "update", this.source, {
          plannedMealId: payload.plannedMealId,
          errorCode: "planned_meal_update_not_found"
        });
      }
      if (!result.updated || !result.planned_meal_id) {
        return writeResult("write_failed", "update", this.source, {
          plannedMealId: payload.plannedMealId,
          errorCode: "planned_meal_update_no_result"
        });
      }
      return {
        status: "updated",
        operation: "update",
        source: this.source,
        identity: "authenticated_user_planned_meal",
        plannedMealId: result.planned_meal_id,
        plannedFor: result.planned_for ?? payload.plannedFor,
        mealType: payload.mealType,
        nutritionSnapshotAvailable: result.nutrition_snapshot_present === true
      };
    } catch {
      return writeResult("write_failed", "update", this.source, {
        plannedMealId: payload.plannedMealId,
        errorCode: "planned_meal_update_transport_failed"
      });
    }
  }

  async remove(payload: CanonicalPlannedMealRemovePayload): Promise<ConsumerPlannedMealWriteResult> {
    if (!this.options.writeEnabled) {
      return {
        status: "skipped",
        operation: "remove",
        source: this.source,
        identity: "authenticated_user_planned_meal",
        plannedMealId: payload.plannedMealId,
        errorCode: "planned_meal_write_unavailable"
      };
    }

    const sessionResult = await this.options.authPort.getCurrentSession();
    if (!sessionResult.ok || !sessionResult.value) {
      return {
        status: "unauthenticated",
        operation: "remove",
        source: this.source,
        identity: "authenticated_user_planned_meal",
        plannedMealId: payload.plannedMealId,
        errorCode: "planned_meal_write_authentication_required"
      };
    }

    try {
      const response = await this.options.mealClient.rpc(
        SUPABASE_REMOVE_AUTHENTICATED_PLANNED_MEAL_FUNCTION,
        toSupabaseRemovePlannedMealRpcArgs(payload)
      );
      if (response.error) {
        return mapRemoveError(response.error, payload, this.source);
      }
      const result = response.data as SupabaseRemovePlannedMealRpcResultLike | null;
      if (!result?.found) {
        return {
          status: "not_found",
          operation: "remove",
          source: this.source,
          identity: "authenticated_user_planned_meal",
          plannedMealId: payload.plannedMealId,
          errorCode: "planned_meal_remove_not_found"
        };
      }
      if (result.already_cancelled) {
        return {
          status: "not_found",
          operation: "remove",
          source: this.source,
          identity: "authenticated_user_planned_meal",
          plannedMealId: payload.plannedMealId,
          errorCode: "planned_meal_already_cancelled"
        };
      }
      return {
        status: "removed",
        operation: "remove",
        source: this.source,
        identity: "authenticated_user_planned_meal",
        plannedMealId: result.planned_meal_id ?? payload.plannedMealId
      };
    } catch {
      return {
        status: "write_failed",
        operation: "remove",
        source: this.source,
        identity: "authenticated_user_planned_meal",
        plannedMealId: payload.plannedMealId,
        errorCode: "planned_meal_remove_transport_failed"
      };
    }
  }
}

function writeResult(
  status: ConsumerPlannedMealWriteResult["status"],
  operation: ConsumerPlannedMealWriteResult["operation"],
  source: "supabase",
  extra: Partial<ConsumerPlannedMealWriteResult> = {}
): ConsumerPlannedMealWriteResult {
  return {
    status,
    operation,
    source,
    identity: "authenticated_user_planned_meal",
    ...extra
  };
}

function mapSaveError(error: SupabaseMealPostgrestErrorLike, payload: CanonicalPlannedMealWritePayload, source: "supabase"): ConsumerPlannedMealWriteResult {
  const msg = error.message?.toUpperCase() ?? "";
  if (error.status === 401 || error.status === 403 || error.code === "28000" || msg.includes("AUTHENTICATION_REQUIRED")) {
    return writeResult("unauthenticated", "save", source, { plannedFor: payload.plannedFor, mealType: payload.mealType, errorCode: "planned_meal_write_authentication_required" });
  }
  if (error.status === 422 || error.code === "22023" || msg.includes("INVALID_") || msg.includes("REQUIRED")) {
    return writeResult("invalid_input", "save", source, { plannedFor: payload.plannedFor, mealType: payload.mealType, errorCode: "planned_meal_save_rpc_rejected" });
  }
  return writeResult("write_failed", "save", source, { plannedFor: payload.plannedFor, mealType: payload.mealType, nutritionSnapshotAvailable: payload.nutritionSnapshot !== null, errorCode: "planned_meal_save_rpc_failed" });
}

function mapUpdateError(error: SupabaseMealPostgrestErrorLike, payload: CanonicalPlannedMealUpdatePayload, source: "supabase"): ConsumerPlannedMealWriteResult {
  const msg = error.message?.toUpperCase() ?? "";
  if (error.status === 401 || error.status === 403 || error.code === "28000" || msg.includes("AUTHENTICATION_REQUIRED")) {
    return writeResult("unauthenticated", "update", source, { plannedMealId: payload.plannedMealId, errorCode: "planned_meal_write_authentication_required" });
  }
  if (error.status === 422 || error.code === "22023" || msg.includes("INVALID_") || msg.includes("REQUIRED")) {
    return writeResult("invalid_input", "update", source, { plannedMealId: payload.plannedMealId, errorCode: "planned_meal_update_rpc_rejected" });
  }
  return writeResult("write_failed", "update", source, { plannedMealId: payload.plannedMealId, errorCode: "planned_meal_update_rpc_failed" });
}

function mapRemoveError(error: SupabaseMealPostgrestErrorLike, payload: CanonicalPlannedMealRemovePayload, source: "supabase"): ConsumerPlannedMealWriteResult {
  const msg = error.message?.toUpperCase() ?? "";
  if (error.status === 401 || error.status === 403 || error.code === "28000" || msg.includes("AUTHENTICATION_REQUIRED")) {
    return { status: "unauthenticated", operation: "remove", source, identity: "authenticated_user_planned_meal", plannedMealId: payload.plannedMealId, errorCode: "planned_meal_write_authentication_required" };
  }
  return { status: "write_failed", operation: "remove", source, identity: "authenticated_user_planned_meal", plannedMealId: payload.plannedMealId, errorCode: "planned_meal_remove_rpc_failed" };
}
