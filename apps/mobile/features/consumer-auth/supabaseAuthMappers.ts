import { ConsumerAuthConfigurationError, ConsumerAuthOperationNotEnabledError, ConsumerProfileMappingError, ConsumerSessionExpiredError } from "./errors";
import type { ConsumerAuthError } from "./errors";
import type { ConsumerAuthSession, ConsumerAuthUser } from "./types";
import type { SupabaseAuthErrorLike, SupabaseAuthEventLike, SupabaseAuthProviderName, SupabaseAuthUserLike, SupabaseMappedAuthEvent, SupabaseSessionLike } from "./supabaseAuthContracts";

export function mapSupabaseProvider(value: string | null | undefined): SupabaseAuthProviderName {
  if (!value) return "unknown";
  if (value === "email" || value === "phone" || value === "anonymous" || value === "apple" || value === "google") return value;
  return "unknown";
}

export function mapSupabaseUserToConsumerAuthUser(user: SupabaseAuthUserLike | null | undefined): ConsumerAuthUser {
  if (!user?.id) throw new ConsumerProfileMappingError("Supabase auth user is missing id.");
  const provider = mapSupabaseProvider(user.app_metadata?.provider);
  if (provider === "unknown") throw new ConsumerProfileMappingError("Supabase auth user provider is unsupported or missing.");
  const createdAt = normalizeIsoTimestamp(user.created_at, "created_at");
  return {
    userId: user.id,
    provider: "supabase",
    isAnonymous: Boolean(user.is_anonymous),
    emailVerified: Boolean(user.email_confirmed_at),
    createdAt,
    lastSignedInAt: user.last_sign_in_at ? normalizeIsoTimestamp(user.last_sign_in_at, "last_sign_in_at") : undefined
  };
}

export function mapSupabaseSessionToConsumerAuthSession(session: SupabaseSessionLike | null | undefined): ConsumerAuthSession | null {
  if (!session) return null;
  if (!session.user) throw new ConsumerProfileMappingError("Supabase session is missing user.");
  const user = mapSupabaseUserToConsumerAuthUser(session.user);
  const expiresAt = normalizeExpiresAt(session);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new ConsumerSessionExpiredError();
  return {
    user,
    provider: "supabase",
    issuedAt: new Date().toISOString(),
    expiresAt
  };
}

export function mapSupabaseAuthEvent(event: SupabaseAuthEventLike, session: SupabaseSessionLike | null): SupabaseMappedAuthEvent {
  const mappedSession = mapSupabaseSessionToConsumerAuthSession(session);
  switch (event) {
    case "INITIAL_SESSION":
      return { type: "initialSession", session: mappedSession };
    case "SIGNED_IN":
      return { type: "signedIn", session: mappedSession };
    case "SIGNED_OUT":
      return { type: "signedOut", session: null };
    case "TOKEN_REFRESHED":
      return { type: "tokenRefreshed", session: mappedSession };
    case "USER_UPDATED":
      return { type: "userUpdated", session: mappedSession };
    case "PASSWORD_RECOVERY":
      return { type: "passwordRecovery", session: mappedSession };
    default:
      throw new ConsumerAuthConfigurationError("Unknown Supabase auth event.");
  }
}

export function mapSupabaseAuthError(error: SupabaseAuthErrorLike | null | undefined): ConsumerAuthError {
  const code = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (code.includes("invalid") || code.includes("credential")) return new ConsumerAuthOperationNotEnabledError("Auth credentials were rejected by the provider.");
  if (code.includes("not confirmed") || code.includes("confirm")) return new ConsumerAuthOperationNotEnabledError("Email confirmation is required before sign-in.");
  if (code.includes("already") || code.includes("registered")) return new ConsumerAuthOperationNotEnabledError("User is already registered.");
  if (code.includes("weak") || code.includes("password")) return new ConsumerAuthOperationNotEnabledError("Password does not satisfy provider requirements.");
  if (code.includes("rate") || error?.status === 429) return new ConsumerAuthOperationNotEnabledError("Auth provider rate limit reached.");
  if (code.includes("expired")) return new ConsumerSessionExpiredError();
  if (code.includes("network") || code.includes("fetch")) return new ConsumerAuthConfigurationError("Auth provider is unavailable.");
  return new ConsumerAuthConfigurationError("Auth provider returned an unmapped error.");
}

function normalizeIsoTimestamp(value: string | null | undefined, field: string) {
  if (!value || Number.isNaN(Date.parse(value))) throw new ConsumerProfileMappingError(`Supabase auth user has malformed ${field}.`);
  return new Date(value).toISOString();
}

function normalizeExpiresAt(session: SupabaseSessionLike) {
  if (typeof session.expires_at === "number") return new Date(session.expires_at * 1000).toISOString();
  if (typeof session.expires_in === "number") return new Date(Date.now() + session.expires_in * 1000).toISOString();
  return undefined;
}