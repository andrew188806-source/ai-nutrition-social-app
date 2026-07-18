export type ConsumerFavoriteErrorCode =
  | "favorite_authentication_required"
  | "favorite_authentication_failed"
  | "favorite_read_disabled"
  | "favorite_write_disabled"
  | "favorite_configuration_invalid"
  | "favorite_target_invalid"
  | "favorite_pagination_invalid"
  | "favorite_read_failed"
  | "favorite_write_failed";

export class ConsumerFavoriteRuntimeError extends Error {
  constructor(readonly code: ConsumerFavoriteErrorCode, message: string, readonly retryable = false) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConsumerFavoriteAuthenticationRequiredError extends ConsumerFavoriteRuntimeError {
  constructor() { super("favorite_authentication_required", "Favorite access requires a current authenticated session."); }
}

export class ConsumerFavoriteAuthenticationFailedError extends ConsumerFavoriteRuntimeError {
  constructor() { super("favorite_authentication_failed", "Favorite authentication could not be verified.", true); }
}

export class ConsumerFavoriteReadDisabledError extends ConsumerFavoriteRuntimeError {
  constructor() { super("favorite_read_disabled", "Favorite reads are disabled in this runtime."); }
}

export class ConsumerFavoriteWriteDisabledError extends ConsumerFavoriteRuntimeError {
  constructor() { super("favorite_write_disabled", "Favorite writes are disabled in this runtime."); }
}

export class ConsumerFavoriteConfigurationInvalidError extends ConsumerFavoriteRuntimeError {
  constructor(message = "Favorite runtime configuration is invalid.") { super("favorite_configuration_invalid", message); }
}

export class ConsumerFavoriteTargetInvalidError extends ConsumerFavoriteRuntimeError {
  constructor() { super("favorite_target_invalid", "Favorite target is invalid or unsupported."); }
}

export class ConsumerFavoritePaginationInvalidError extends ConsumerFavoriteRuntimeError {
  constructor() { super("favorite_pagination_invalid", "Favorite list pagination is invalid."); }
}

export class ConsumerFavoriteReadFailedError extends ConsumerFavoriteRuntimeError {
  constructor(message = "Favorite read failed.") { super("favorite_read_failed", message, true); }
}

export class ConsumerFavoriteWriteFailedError extends ConsumerFavoriteRuntimeError {
  constructor(message = "Favorite write failed.") { super("favorite_write_failed", message, true); }
}
