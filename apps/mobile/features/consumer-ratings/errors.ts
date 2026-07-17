export type ConsumerRatingErrorCode =
  | "rating_authentication_required"
  | "rating_authentication_failed"
  | "rating_read_disabled"
  | "rating_write_disabled"
  | "rating_configuration_invalid"
  | "rating_target_invalid"
  | "rating_value_invalid"
  | "rating_ownership_field_rejected"
  | "rating_permission_denied"
  | "rating_response_malformed"
  | "rating_transport_failed"
  | "rating_database_failed"
  | "rating_read_failed"
  | "rating_write_failed";

export class ConsumerRatingRuntimeError extends Error {
  constructor(
    readonly code: ConsumerRatingErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConsumerRatingAuthenticationRequiredError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating access requires a current authenticated session.") {
    super("rating_authentication_required", message);
  }
}

export class ConsumerRatingAuthenticationFailedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating authentication could not be verified.") {
    super("rating_authentication_failed", message, true);
  }
}

export class ConsumerRatingReadDisabledError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating reads are disabled in this runtime.") {
    super("rating_read_disabled", message);
  }
}

export class ConsumerRatingWriteDisabledError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating writes are disabled in this runtime.") {
    super("rating_write_disabled", message);
  }
}

export class ConsumerRatingConfigurationInvalidError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating runtime configuration is invalid.") {
    super("rating_configuration_invalid", message);
  }
}

export class ConsumerRatingTargetInvalidError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating target is invalid.") {
    super("rating_target_invalid", message);
  }
}

export class ConsumerRatingValueInvalidError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating value must be a finite number from 0 through 5.") {
    super("rating_value_invalid", message);
  }
}

export class ConsumerRatingOwnershipFieldRejectedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating input must not include an ownership field.") {
    super("rating_ownership_field_rejected", message);
  }
}

export class ConsumerRatingPermissionDeniedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating access was denied.") {
    super("rating_permission_denied", message);
  }
}

export class ConsumerRatingResponseMalformedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating response did not match the approved contract.") {
    super("rating_response_malformed", message);
  }
}

export class ConsumerRatingTransportFailedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating transport failed.") {
    super("rating_transport_failed", message, true);
  }
}

export class ConsumerRatingDatabaseFailedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating database operation failed.") {
    super("rating_database_failed", message);
  }
}

export class ConsumerRatingReadFailedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating read failed.") {
    super("rating_read_failed", message, true);
  }
}

export class ConsumerRatingWriteFailedError extends ConsumerRatingRuntimeError {
  constructor(message = "Consumer rating write failed.") {
    super("rating_write_failed", message, true);
  }
}
