export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export class SupabaseAuthenticationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAuthenticationRequiredError";
  }
}

export class SupabaseQueryError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "SupabaseQueryError";
  }
}

export class SupabaseHttpError extends Error {
  constructor(message: string, public readonly status: number, public readonly resource?: string) {
    super(message);
    this.name = "SupabaseHttpError";
  }
}

export class SupabaseMappingError extends Error {
  constructor(message: string, public readonly entity?: string, public readonly field?: string) {
    super(message);
    this.name = "SupabaseMappingError";
  }
}

export class SupabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseUnavailableError";
  }
}

export class SupabaseRequestTimeoutError extends Error {
  constructor(message: string, public readonly resource?: string) {
    super(message);
    this.name = "SupabaseRequestTimeoutError";
  }
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSchemaVersionError";
  }
}