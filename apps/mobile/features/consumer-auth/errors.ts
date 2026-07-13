export type ConsumerAuthErrorCode =
  | "authentication_required"
  | "provider_not_configured"
  | "operation_not_enabled"
  | "email_confirmation_required"
  | "profile_session_missing"
  | "profile_session_expired"
  | "profile_unauthorized"
  | "profile_not_found"
  | "profile_write_not_enabled"
  | "profile_mapping_error"
  | "profile_mapping_failed"
  | "profile_transport_failed"
  | "profile_configuration_invalid"
  | "profile_source_unavailable"
  | "meal_source_configuration_invalid"
  | "meal_session_missing"
  | "meal_session_expired"
  | "meal_unauthorized"
  | "meal_not_found"
  | "meal_read_invalid_range"
  | "meal_record_mapping_failed"
  | "meal_item_mapping_failed"
  | "meal_transport_failed"
  | "meal_source_unavailable"
  | "meal_write_disabled"
  | "meal_write_phase_not_enabled"
  | "meal_write_authentication_required"
  | "meal_write_invalid_input"
  | "meal_write_invalid_date"
  | "meal_write_invalid_nutrition"
  | "meal_write_invalid_items"
  | "meal_write_payload_too_large"
  | "meal_write_ownership_field_rejected"
  | "meal_write_configuration_invalid"
  | "meal_write_transport_failed"
  | "meal_write_mapping_failed"
  | "meal_write_atomicity_not_supported"
  | "meal_write_partial_write_prevented"
  | "session_expired"
  | "account_disabled"
  | "configuration_error";

export class ConsumerAuthError extends Error {
  readonly code: ConsumerAuthErrorCode;
  readonly recoverable: boolean;

  constructor(code: ConsumerAuthErrorCode, message: string, recoverable = true) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.recoverable = recoverable;
  }
}

export class ConsumerAuthenticationRequiredError extends ConsumerAuthError {
  constructor(message = "Consumer authentication is required.") {
    super("authentication_required", message);
  }
}

export class ConsumerAuthProviderNotConfiguredError extends ConsumerAuthError {
  constructor(message = "Consumer auth provider is not configured.") {
    super("provider_not_configured", message);
  }
}

export class ConsumerAuthOperationNotEnabledError extends ConsumerAuthError {
  constructor(message = "Consumer auth operation is not enabled in this phase.") {
    super("operation_not_enabled", message);
  }
}

export class ConsumerEmailConfirmationRequiredError extends ConsumerAuthError {
  constructor(message = "Email confirmation is required before a session is available.") {
    super("email_confirmation_required", message);
  }
}

export class ConsumerProfileNotFoundError extends ConsumerAuthError {
  constructor(message = "Consumer profile was not found.") {
    super("profile_not_found", message);
  }
}

export class ConsumerProfileSessionMissingError extends ConsumerAuthError {
  constructor(message = "Consumer profile read requires an authenticated session.") {
    super("profile_session_missing", message);
  }
}

export class ConsumerProfileSessionExpiredError extends ConsumerAuthError {
  constructor(message = "Consumer profile read requires a current authenticated session.") {
    super("profile_session_expired", message);
  }
}

export class ConsumerProfileUnauthorizedError extends ConsumerAuthError {
  constructor(message = "Consumer profile read was not authorized.") {
    super("profile_unauthorized", message);
  }
}

export class ConsumerProfileWriteNotEnabledError extends ConsumerAuthError {
  constructor(message = "Consumer profile writes are not enabled in this phase.") {
    super("profile_write_not_enabled", message);
  }
}

export class ConsumerProfileMappingError extends ConsumerAuthError {
  constructor(message = "Consumer profile response could not be mapped.") {
    super("profile_mapping_error", message);
  }
}

export class ConsumerProfileMappingFailedError extends ConsumerAuthError {
  constructor(message = "Consumer profile response could not be mapped.") {
    super("profile_mapping_failed", message);
  }
}

export class ConsumerProfileTransportFailedError extends ConsumerAuthError {
  constructor(message = "Consumer profile transport failed.") {
    super("profile_transport_failed", message);
  }
}

export class ConsumerProfileConfigurationInvalidError extends ConsumerAuthError {
  constructor(message = "Consumer profile runtime configuration is invalid.") {
    super("profile_configuration_invalid", message, false);
  }
}

export class ConsumerProfileSourceUnavailableError extends ConsumerAuthError {
  constructor(message = "Consumer profile source is unavailable in this runtime.") {
    super("profile_source_unavailable", message);
  }
}

export class ConsumerMealSourceConfigurationInvalidError extends ConsumerAuthError {
  constructor(message = "Consumer meal runtime configuration is invalid.") {
    super("meal_source_configuration_invalid", message, false);
  }
}

export class ConsumerMealSessionMissingError extends ConsumerAuthError {
  constructor(message = "Consumer meal read requires an authenticated session.") {
    super("meal_session_missing", message);
  }
}

export class ConsumerMealSessionExpiredError extends ConsumerAuthError {
  constructor(message = "Consumer meal read requires a current authenticated session.") {
    super("meal_session_expired", message);
  }
}

export class ConsumerMealUnauthorizedError extends ConsumerAuthError {
  constructor(message = "Consumer meal read was not authorized.") {
    super("meal_unauthorized", message);
  }
}

export class ConsumerMealNotFoundError extends ConsumerAuthError {
  constructor(message = "Consumer meal records were not found.") {
    super("meal_not_found", message);
  }
}

export class ConsumerMealReadInvalidRangeError extends ConsumerAuthError {
  constructor(message = "Consumer meal read range is invalid.") {
    super("meal_read_invalid_range", message, false);
  }
}

export class ConsumerMealRecordMappingFailedError extends ConsumerAuthError {
  constructor(message = "Consumer meal record response could not be mapped.") {
    super("meal_record_mapping_failed", message);
  }
}

export class ConsumerMealItemMappingFailedError extends ConsumerAuthError {
  constructor(message = "Consumer meal item response could not be mapped.") {
    super("meal_item_mapping_failed", message);
  }
}

export class ConsumerMealTransportFailedError extends ConsumerAuthError {
  constructor(message = "Consumer meal read transport failed.") {
    super("meal_transport_failed", message);
  }
}

export class ConsumerMealSourceUnavailableError extends ConsumerAuthError {
  constructor(message = "Consumer meal source is unavailable in this runtime.") {
    super("meal_source_unavailable", message);
  }
}

export class ConsumerMealWriteDisabledError extends ConsumerAuthError {
  constructor(message = "Consumer meal writes are disabled in this runtime.") {
    super("meal_write_disabled", message);
  }
}

export class ConsumerMealWritePhaseNotEnabledError extends ConsumerAuthError {
  constructor(message = "Consumer meal live writes are not enabled in this phase.") {
    super("meal_write_phase_not_enabled", message, false);
  }
}

export class ConsumerMealWriteAuthenticationRequiredError extends ConsumerAuthError {
  constructor(message = "Consumer meal write requires an authenticated session.") {
    super("meal_write_authentication_required", message);
  }
}

export class ConsumerMealWriteInvalidInputError extends ConsumerAuthError {
  constructor(message = "Consumer meal write input is invalid.") {
    super("meal_write_invalid_input", message, false);
  }
}

export class ConsumerMealWriteInvalidDateError extends ConsumerAuthError {
  constructor(message = "Consumer meal write date is invalid.") {
    super("meal_write_invalid_date", message, false);
  }
}

export class ConsumerMealWriteInvalidNutritionError extends ConsumerAuthError {
  constructor(message = "Consumer meal write nutrition value is invalid.") {
    super("meal_write_invalid_nutrition", message, false);
  }
}

export class ConsumerMealWriteInvalidItemsError extends ConsumerAuthError {
  constructor(message = "Consumer meal write items are invalid.") {
    super("meal_write_invalid_items", message, false);
  }
}

export class ConsumerMealWritePayloadTooLargeError extends ConsumerAuthError {
  constructor(message = "Consumer meal write payload is too large.") {
    super("meal_write_payload_too_large", message, false);
  }
}

export class ConsumerMealWriteOwnershipFieldRejectedError extends ConsumerAuthError {
  constructor(message = "Consumer meal write input must not include ownership fields.") {
    super("meal_write_ownership_field_rejected", message, false);
  }
}

export class ConsumerMealWriteConfigurationInvalidError extends ConsumerAuthError {
  constructor(message = "Consumer meal write runtime configuration is invalid.") {
    super("meal_write_configuration_invalid", message, false);
  }
}

export class ConsumerMealWriteTransportFailedError extends ConsumerAuthError {
  constructor(message = "Consumer meal write transport failed.") {
    super("meal_write_transport_failed", message);
  }
}

export class ConsumerMealWriteMappingFailedError extends ConsumerAuthError {
  constructor(message = "Consumer meal write response could not be mapped.") {
    super("meal_write_mapping_failed", message);
  }
}

export class ConsumerMealWriteAtomicityNotSupportedError extends ConsumerAuthError {
  constructor(message = "Consumer meal write requires an atomic parent-and-items write path before live activation.") {
    super("meal_write_atomicity_not_supported", message, false);
  }
}

export class ConsumerMealWritePartialWritePreventedError extends ConsumerAuthError {
  constructor(message = "Consumer meal write was prevented to avoid partial data.") {
    super("meal_write_partial_write_prevented", message, false);
  }
}

export class ConsumerSessionExpiredError extends ConsumerAuthError {
  constructor(message = "Consumer auth session expired.") {
    super("session_expired", message);
  }
}

export class ConsumerAccountDisabledError extends ConsumerAuthError {
  constructor(message = "Consumer account is disabled.") {
    super("account_disabled", message, false);
  }
}

export class ConsumerAuthConfigurationError extends ConsumerAuthError {
  constructor(message = "Consumer auth configuration is invalid.") {
    super("configuration_error", message, false);
  }
}

export function toConsumerAuthError(error: unknown, fallbackMessage: string): ConsumerAuthError {
  if (error instanceof ConsumerAuthError) return error;
  return new ConsumerAuthConfigurationError(fallbackMessage);
}
