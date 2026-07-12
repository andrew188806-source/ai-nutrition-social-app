import type { ConsumerAuthSession } from "./types";

export type SupabaseAuthProviderName = "email" | "phone" | "anonymous" | "apple" | "google" | "unknown";

export type SupabaseAuthUserLike = {
  id?: string | null;
  app_metadata?: { provider?: string | null } | null;
  is_anonymous?: boolean | null;
  email_confirmed_at?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

export type SupabaseSessionLike = {
  user?: SupabaseAuthUserLike | null;
  expires_at?: number | null;
  expires_in?: number | null;
};

export type SupabaseAuthErrorLike = {
  name?: string | null;
  message?: string | null;
  status?: number | null;
  code?: string | null;
};

export type SupabaseAuthResponseLike<T> = {
  data?: T | null;
  error?: SupabaseAuthErrorLike | null;
};

export type SupabaseAuthEventLike = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | "PASSWORD_RECOVERY" | string;

export type SupabaseAuthSubscriptionLike = {
  unsubscribe(): void;
};

export type SupabaseAuthStateChangeResultLike = {
  data?: { subscription?: SupabaseAuthSubscriptionLike | null } | null;
};

export type SupabaseAuthClientLike = {
  getSession(): Promise<SupabaseAuthResponseLike<{ session: SupabaseSessionLike | null }>>;
  signInWithPassword(input: { email: string; password: string }): Promise<SupabaseAuthResponseLike<{ session: SupabaseSessionLike | null }>>;
  signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<SupabaseAuthResponseLike<{ session: SupabaseSessionLike | null }>>;
  signOut(): Promise<SupabaseAuthResponseLike<Record<string, never>>>;
  refreshSession(): Promise<SupabaseAuthResponseLike<{ session: SupabaseSessionLike | null }>>;
  resetPasswordForEmail(email: string): Promise<SupabaseAuthResponseLike<Record<string, never>>>;
  onAuthStateChange(callback: (event: SupabaseAuthEventLike, session: SupabaseSessionLike | null) => void): SupabaseAuthStateChangeResultLike;
  startAutoRefresh?(): void;
  stopAutoRefresh?(): void;
};

export type SupabaseConsumerClientLike = {
  auth: SupabaseAuthClientLike;
};

export type SupabaseConsumerClientOptions = {
  url: string;
  publishableKey: string;
  auth: {
    persistSession: true;
    autoRefreshToken: true;
    detectSessionInUrl: false;
    storage: unknown;
  };
};

export type SupabaseConsumerClientFactoryResult = {
  client: SupabaseConsumerClientLike;
  options: SupabaseConsumerClientOptions;
};

export type SupabaseMappedAuthEvent = {
  type: "initialSession" | "signedIn" | "signedOut" | "tokenRefreshed" | "userUpdated" | "passwordRecovery";
  session: ConsumerAuthSession | null;
};