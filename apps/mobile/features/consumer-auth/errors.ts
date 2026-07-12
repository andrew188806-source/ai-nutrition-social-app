export type ConsumerAuthErrorCode =
  | "authentication_required"
  | "provider_not_configured"
  | "operation_not_enabled"
  | "email_confirmation_required"
  | "profile_not_found"
  | "profile_write_not_enabled"
  | "profile_mapping_error"
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
