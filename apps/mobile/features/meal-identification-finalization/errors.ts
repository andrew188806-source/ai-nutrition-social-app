export type ConsumerMealIdentificationFinalizationErrorCode =
  | "finalization_disabled"
  | "finalization_authentication_required"
  | "finalization_authentication_failed"
  | "finalization_configuration_invalid"
  | "finalization_invalid_input"
  | "finalization_forbidden_field"
  | "finalization_unsupported_contract_version"
  | "finalization_catalog_identity_rejected"
  | "finalization_identity_invariant_violation"
  | "finalization_analysis_invariant_violation"
  | "finalization_correction_invariant_violation"
  | "finalization_durable_state_inconsistency"
  | "finalization_idempotency_conflict"
  | "finalization_ownership_or_authorization_rejected"
  | "finalization_response_malformed"
  | "finalization_transport_failed"
  // MI-E-C5-B1: v3 (real-AI candidate) contract error codes.
  | "finalization_analysis_not_found"
  | "finalization_analysis_access_denied"
  | "finalization_analysis_not_ready"
  | "finalization_analysis_already_finalized"
  | "finalization_invalid_candidate"
  | "finalization_invalid_manual_draft"
  | "finalization_correction_validation_failed";

export class ConsumerMealIdentificationFinalizationRuntimeError extends Error {
  constructor(
    readonly code: ConsumerMealIdentificationFinalizationErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConsumerMealIdentificationFinalizationDisabledError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Consumer meal identification finalization is disabled in this runtime.") {
    super("finalization_disabled", message);
  }
}

export class ConsumerMealIdentificationFinalizationAuthenticationRequiredError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization requires a current authenticated session.") {
    super("finalization_authentication_required", message);
  }
}

export class ConsumerMealIdentificationFinalizationAuthenticationFailedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization authentication could not be verified.") {
    super("finalization_authentication_failed", message, true);
  }
}

export class ConsumerMealIdentificationFinalizationConfigurationInvalidError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization runtime configuration is invalid.") {
    super("finalization_configuration_invalid", message);
  }
}

export class ConsumerMealIdentificationFinalizationInvalidInputError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization input is invalid.") {
    super("finalization_invalid_input", message);
  }
}

export class ConsumerMealIdentificationFinalizationForbiddenFieldError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization input must not include an ownership field.") {
    super("finalization_forbidden_field", message);
  }
}

export class ConsumerMealIdentificationFinalizationUnsupportedContractVersionError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization contract version is unsupported.") {
    super("finalization_unsupported_contract_version", message);
  }
}

export class ConsumerMealIdentificationFinalizationCatalogIdentityRejectedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization Catalog identity could not be validated.") {
    super("finalization_catalog_identity_rejected", message);
  }
}

export class ConsumerMealIdentificationFinalizationIdentityInvariantViolationError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization identity invariant was violated.") {
    super("finalization_identity_invariant_violation", message);
  }
}

export class ConsumerMealIdentificationFinalizationAnalysisInvariantViolationError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization analysis invariant was violated.") {
    super("finalization_analysis_invariant_violation", message);
  }
}

export class ConsumerMealIdentificationFinalizationCorrectionInvariantViolationError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization correction invariant was violated.") {
    super("finalization_correction_invariant_violation", message);
  }
}

export class ConsumerMealIdentificationFinalizationDurableStateInconsistencyError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization durable state is inconsistent with this replay.") {
    super("finalization_durable_state_inconsistency", message);
  }
}

export class ConsumerMealIdentificationFinalizationIdempotencyConflictError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization idempotency key reused with a different payload.") {
    super("finalization_idempotency_conflict", message);
  }
}

export class ConsumerMealIdentificationFinalizationOwnershipRejectedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization ownership or authorization was rejected.") {
    super("finalization_ownership_or_authorization_rejected", message);
  }
}

export class ConsumerMealIdentificationFinalizationResponseMalformedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization RPC response is malformed.") {
    super("finalization_response_malformed", message);
  }
}

export class ConsumerMealIdentificationFinalizationTransportFailedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Meal identification finalization RPC transport failed.") {
    super("finalization_transport_failed", message, true);
  }
}

// MI-E-C5-B1: v3 (real-AI candidate) contract error classes.

export class ConsumerMealIdentificationFinalizationAnalysisNotFoundError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "The referenced analysis could not be found.") {
    super("finalization_analysis_not_found", message);
  }
}

export class ConsumerMealIdentificationFinalizationAnalysisAccessDeniedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "Access to the referenced analysis was denied.") {
    super("finalization_analysis_access_denied", message);
  }
}

export class ConsumerMealIdentificationFinalizationAnalysisNotReadyError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "The referenced analysis is not ready to be finalized.") {
    super("finalization_analysis_not_ready", message);
  }
}

export class ConsumerMealIdentificationFinalizationAnalysisAlreadyFinalizedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "The referenced analysis has already been finalized into a meal record.") {
    super("finalization_analysis_already_finalized", message);
  }
}

export class ConsumerMealIdentificationFinalizationInvalidCandidateError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "The selected candidate is invalid or not present in the analysis result.") {
    super("finalization_invalid_candidate", message);
  }
}

// Client-side only: raised before the RPC is ever called when a manual-fallback draft is
// incomplete (e.g. no meal name). The RPC itself has no distinct code for this — an incomplete
// manual draft that somehow reached the RPC would surface as
// finalization_correction_validation_failed instead.
export class ConsumerMealIdentificationFinalizationInvalidManualDraftError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "The manual meal draft is incomplete.") {
    super("finalization_invalid_manual_draft", message);
  }
}

export class ConsumerMealIdentificationFinalizationCorrectionValidationFailedError extends ConsumerMealIdentificationFinalizationRuntimeError {
  constructor(message = "The confirmed meal values failed validation.") {
    super("finalization_correction_validation_failed", message);
  }
}
