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
