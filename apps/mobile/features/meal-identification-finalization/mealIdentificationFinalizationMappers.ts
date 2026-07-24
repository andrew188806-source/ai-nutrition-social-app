import {
  ConsumerMealIdentificationFinalizationAnalysisInvariantViolationError,
  ConsumerMealIdentificationFinalizationAuthenticationRequiredError,
  ConsumerMealIdentificationFinalizationCatalogIdentityRejectedError,
  ConsumerMealIdentificationFinalizationCorrectionInvariantViolationError,
  ConsumerMealIdentificationFinalizationDurableStateInconsistencyError,
  ConsumerMealIdentificationFinalizationForbiddenFieldError,
  ConsumerMealIdentificationFinalizationIdempotencyConflictError,
  ConsumerMealIdentificationFinalizationIdentityInvariantViolationError,
  ConsumerMealIdentificationFinalizationInvalidInputError,
  ConsumerMealIdentificationFinalizationOwnershipRejectedError,
  ConsumerMealIdentificationFinalizationResponseMalformedError,
  ConsumerMealIdentificationFinalizationTransportFailedError,
  ConsumerMealIdentificationFinalizationUnsupportedContractVersionError,
  type ConsumerMealIdentificationFinalizationRuntimeError
} from "./errors";
import {
  type SupabaseFinalizeMealIdentificationRpcArgs,
  type SupabaseFinalizeMealIdentificationRpcResultLike,
  type SupabaseMealIdentificationFinalizationErrorLike
} from "./supabaseMealIdentificationFinalizationContracts";
import type {
  ConsumerMealIdentificationFinalizationValue,
  FinalizeCurrentUserMealIdentificationInput
} from "./types";

// Request shape is intentionally thin: MealIdentificationFinalizationCommand (frozen by
// meal-identification/finalizationContract.ts) already matches the RPC's p_finalization
// jsonb contract field-for-field, so it is passed through as-is rather than re-derived.
export function buildFinalizeMealIdentificationRpcArgs(
  input: FinalizeCurrentUserMealIdentificationInput
): SupabaseFinalizeMealIdentificationRpcArgs {
  return {
    p_client_request_id: input.clientRequestId,
    p_meal_type: input.mealType,
    p_occurred_at: input.occurredAt,
    p_meal_date: input.mealDate,
    p_timezone: input.timezone,
    p_finalization: input.finalization as unknown as Record<string, unknown>
  };
}

export function mapFinalizeMealIdentificationRpcResponse(
  data: SupabaseFinalizeMealIdentificationRpcResultLike | null | undefined
): ConsumerMealIdentificationFinalizationValue {
  if (!data || typeof data !== "object") {
    throw new ConsumerMealIdentificationFinalizationResponseMalformedError();
  }
  if (typeof data.replayed !== "boolean") {
    throw new ConsumerMealIdentificationFinalizationResponseMalformedError();
  }
  const mealRecordId = requiredId(data.meal_record_id);
  const mealRecordItemId = requiredId(data.meal_record_item_id);
  const mealAnalysisId = requiredId(data.meal_analysis_id);
  const mealIdentificationFinalizationId = requiredId(data.meal_identification_finalization_id);
  const mealCorrectionIds = requiredIdArray(data.meal_correction_ids);
  return {
    replayed: data.replayed,
    mealRecordId,
    mealRecordItemId,
    mealAnalysisId,
    mealIdentificationFinalizationId,
    mealCorrectionIds
  };
}

export function mapMealIdentificationFinalizationRpcError(
  error: SupabaseMealIdentificationFinalizationErrorLike,
  status?: number
): ConsumerMealIdentificationFinalizationRuntimeError {
  const token = (error.message ?? "").trim().toUpperCase();
  const effectiveStatus = status ?? error.status ?? undefined;

  if (effectiveStatus === 401 || error.code === "28000" || token === "AUTHENTICATION_REQUIRED") {
    return new ConsumerMealIdentificationFinalizationAuthenticationRequiredError();
  }
  if (effectiveStatus === 403 || error.code === "42501" || token === "OWNERSHIP_OR_AUTHORIZATION_REJECTED") {
    return new ConsumerMealIdentificationFinalizationOwnershipRejectedError();
  }
  if (error.code === "23503" || token === "CATALOG_IDENTITY_REJECTED") {
    return new ConsumerMealIdentificationFinalizationCatalogIdentityRejectedError();
  }
  if (error.code === "23505" || token === "IDEMPOTENCY_KEY_CONFLICT") {
    return new ConsumerMealIdentificationFinalizationIdempotencyConflictError();
  }
  if (token === "ANALYSIS_INVARIANT_VIOLATION") {
    return new ConsumerMealIdentificationFinalizationAnalysisInvariantViolationError();
  }
  if (token === "IDENTITY_INVARIANT_VIOLATION") {
    return new ConsumerMealIdentificationFinalizationIdentityInvariantViolationError();
  }
  if (token === "CORRECTION_INVARIANT_VIOLATION") {
    return new ConsumerMealIdentificationFinalizationCorrectionInvariantViolationError();
  }
  if (token === "DURABLE_STATE_INCONSISTENCY" || error.code === "23514") {
    return new ConsumerMealIdentificationFinalizationDurableStateInconsistencyError();
  }
  if (token === "FORBIDDEN_FIELD") {
    return new ConsumerMealIdentificationFinalizationForbiddenFieldError();
  }
  if (token === "UNSUPPORTED_CONTRACT_VERSION") {
    return new ConsumerMealIdentificationFinalizationUnsupportedContractVersionError();
  }
  if (token === "INVALID_FINALIZATION" || error.code === "22023") {
    return new ConsumerMealIdentificationFinalizationInvalidInputError();
  }
  return new ConsumerMealIdentificationFinalizationTransportFailedError();
}

function requiredId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConsumerMealIdentificationFinalizationResponseMalformedError();
  }
  return value;
}

function requiredIdArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim())) {
    throw new ConsumerMealIdentificationFinalizationResponseMalformedError();
  }
  return value;
}
