export type ConsumerRecommendationFeedbackErrorCode =
  | "feedback_disabled"
  | "feedback_authentication_required"
  | "feedback_authentication_failed"
  | "feedback_configuration_invalid"
  | "feedback_target_invalid"
  | "feedback_action_invalid"
  | "feedback_session_not_found"
  | "feedback_session_invalid"
  | "feedback_ownership_field_rejected"
  | "feedback_write_failed"
  | "feedback_idempotency_conflict"
  | "feedback_permission_denied"
  | "feedback_response_malformed"
  | "feedback_database_failed"
  | "feedback_transport_failed";

export class ConsumerRecommendationFeedbackRuntimeError extends Error {
  constructor(
    readonly code: ConsumerRecommendationFeedbackErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConsumerRecommendationFeedbackDisabledError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Consumer recommendation feedback is disabled in this runtime.") {
    super("feedback_disabled", message);
  }
}

export class ConsumerRecommendationFeedbackAuthenticationRequiredError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback access requires a current authenticated session.") {
    super("feedback_authentication_required", message);
  }
}

export class ConsumerRecommendationFeedbackAuthenticationFailedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback authentication could not be verified.") {
    super("feedback_authentication_failed", message, true);
  }
}

export class ConsumerRecommendationFeedbackConfigurationInvalidError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback runtime configuration is invalid.") {
    super("feedback_configuration_invalid", message);
  }
}

export class ConsumerRecommendationFeedbackTargetInvalidError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback target is invalid.") {
    super("feedback_target_invalid", message);
  }
}

export class ConsumerRecommendationFeedbackActionInvalidError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback action is invalid.") {
    super("feedback_action_invalid", message);
  }
}

export class ConsumerRecommendationFeedbackSessionNotFoundError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation session was not found or is not owned by the current user.") {
    super("feedback_session_not_found", message);
  }
}

export class ConsumerRecommendationFeedbackSessionInvalidError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation session is in an invalid state for this operation.") {
    super("feedback_session_invalid", message);
  }
}

export class ConsumerRecommendationFeedbackOwnershipFieldRejectedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback input must not include an ownership field.") {
    super("feedback_ownership_field_rejected", message);
  }
}

export class ConsumerRecommendationFeedbackWriteFailedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback write failed.") {
    super("feedback_write_failed", message, true);
  }
}

export class ConsumerRecommendationFeedbackIdempotencyConflictError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback idempotency key reused with a different payload.") {
    super("feedback_idempotency_conflict", message);
  }
}

export class ConsumerRecommendationFeedbackPermissionDeniedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback permission denied.") {
    super("feedback_permission_denied", message);
  }
}

export class ConsumerRecommendationFeedbackResponseMalformedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback RPC response is malformed.") {
    super("feedback_response_malformed", message);
  }
}

export class ConsumerRecommendationFeedbackDatabaseFailedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback database operation failed.") {
    super("feedback_database_failed", message, true);
  }
}

export class ConsumerRecommendationFeedbackTransportFailedError extends ConsumerRecommendationFeedbackRuntimeError {
  constructor(message = "Recommendation feedback RPC transport failed.") {
    super("feedback_transport_failed", message, true);
  }
}
