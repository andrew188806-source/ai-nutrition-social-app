import {
  ConsumerMealIdentificationFinalizationAnalysisAccessDeniedError,
  ConsumerMealIdentificationFinalizationAnalysisAlreadyFinalizedError,
  ConsumerMealIdentificationFinalizationAnalysisInvariantViolationError,
  ConsumerMealIdentificationFinalizationAnalysisNotFoundError,
  ConsumerMealIdentificationFinalizationActorBindingMismatchError,
  ConsumerMealIdentificationFinalizationAnalysisNotReadyError,
  ConsumerMealIdentificationFinalizationAuthenticationRequiredError,
  ConsumerMealIdentificationFinalizationCatalogIdentityRejectedError,
  ConsumerMealIdentificationFinalizationCorrectionInvariantViolationError,
  ConsumerMealIdentificationFinalizationCorrectionValidationFailedError,
  ConsumerMealIdentificationFinalizationDurableStateInconsistencyError,
  ConsumerMealIdentificationFinalizationEligibilityRequiredError,
  ConsumerMealIdentificationFinalizationForbiddenFieldError,
  ConsumerMealIdentificationFinalizationIdempotencyConflictError,
  ConsumerMealIdentificationFinalizationIdentityInvariantViolationError,
  ConsumerMealIdentificationFinalizationInvalidCandidateError,
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
    p_finalization: input.finalization
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

// Diagnostics only (local reference code): SQLSTATE-like code and HTTP status of the answer. Never the
// message, never the payload.
// `structured` = the answer carried a well-formed server error code (a server answer, i.e. the RPC transaction ended in
// rollback); a transport failure without one (network, gateway, unreadable, malformed code) is `structured: false` =
// unknown result.
export type FinalizationErrorDiagnostics = { sqlstate: string | null; httpStatus: number | null; structured: boolean };

export function mapMealIdentificationFinalizationRpcError(
  error: SupabaseMealIdentificationFinalizationErrorLike,
  status?: number
): ConsumerMealIdentificationFinalizationRuntimeError & FinalizationErrorDiagnostics {
  const mapped = mapFinalizationRpcErrorInner(error, status);
  const code = typeof error.code === "string" && /^[0-9A-Za-z]{5}$/.test(error.code) ? error.code : null;
  return Object.assign(mapped, { sqlstate: code, httpStatus: status ?? error.status ?? null, structured: isTrustedServerErrorCode(error.code) });
}

// Only a well-formed server error code (SQLSTATE or PGRSTnnn) makes an answer server-authored. A missing, empty or
// malformed code (gateway/proxy text, HTML, unreadable body) proves nothing about the write, whatever its text or HTTP
// status says.
function isTrustedServerErrorCode(code: unknown): boolean {
  return typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code);
}

function mapFinalizationRpcErrorInner(
  error: SupabaseMealIdentificationFinalizationErrorLike,
  status?: number
): ConsumerMealIdentificationFinalizationRuntimeError {
  const token = (error.message ?? "").trim().toUpperCase();
  const effectiveStatus = status ?? error.status ?? undefined;

  // Actor-bound dispatch guard: refused BEFORE any network call (nothing was sent).
  if (error.code === "TKACT0") {
    return new ConsumerMealIdentificationFinalizationActorBindingMismatchError();
  }
  // Not server-authored: transport failure (structured: false => unknown in the recovery policy).
  if (!isTrustedServerErrorCode(error.code)) {
    return new ConsumerMealIdentificationFinalizationTransportFailedError();
  }

  // MI-E-C5-B1: v3 token-specific checks come first — several v3 codes share a SQLSTATE with an
  // existing v1/v2 code (ANALYSIS_ALREADY_FINALIZED and ANALYSIS_ACCESS_DENIED both use 23505/
  // 42501, the same SQLSTATEs as IDEMPOTENCY_KEY_CONFLICT/OWNERSHIP_OR_AUTHORIZATION_REJECTED), so
  // the exact token must be checked before any generic error.code fallback below.
  if (token === "ANALYSIS_NOT_FOUND") {
    return new ConsumerMealIdentificationFinalizationAnalysisNotFoundError();
  }
  if (token === "ANALYSIS_ACCESS_DENIED") {
    return new ConsumerMealIdentificationFinalizationAnalysisAccessDeniedError();
  }
  if (token === "ANALYSIS_NOT_READY") {
    return new ConsumerMealIdentificationFinalizationAnalysisNotReadyError();
  }
  if (token === "ANALYSIS_ALREADY_FINALIZED") {
    return new ConsumerMealIdentificationFinalizationAnalysisAlreadyFinalizedError();
  }
  if (token === "INVALID_CANDIDATE") {
    return new ConsumerMealIdentificationFinalizationInvalidCandidateError();
  }
  if (token === "CORRECTION_VALIDATION_FAILED") {
    return new ConsumerMealIdentificationFinalizationCorrectionValidationFailedError();
  }

  // Consent / eligibility is not a login failure (server token, not SQLSTATE 42501 alone).
  if (token === "CONSUMER_CORE_ELIGIBILITY_REQUIRED") {
    return new ConsumerMealIdentificationFinalizationEligibilityRequiredError();
  }
  if (effectiveStatus === 401 || error.code === "28000" || (typeof error.code === "string" && /^PGRST30[123]$/.test(error.code)) || token === "AUTHENTICATION_REQUIRED") {
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
  // Unrecognised SQLSTATE or no code at all: a safe generic transport failure (the TYPE is unchanged). Whether the
  // answer was structured is carried in `structured` and decides rollback vs unknown in the recovery policy.
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
