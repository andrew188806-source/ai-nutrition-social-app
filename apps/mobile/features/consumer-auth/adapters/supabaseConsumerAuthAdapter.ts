import { ConsumerAuthOperationNotEnabledError } from "../errors";
import type { ConsumerAuthPort, ConsumerAuthStateListener } from "../ports";
import type { ConsumerPasswordResetInput, ConsumerSignInInput, ConsumerSignUpInput } from "../types";
import { err, ok } from "../types";
import type { SupabaseAuthClientLike } from "../supabaseAuthContracts";
import { mapSupabaseAuthError, mapSupabaseAuthEvent, mapSupabaseSessionToConsumerAuthSession } from "../supabaseAuthMappers";

export type SupabaseConsumerAuthAdapterOptions = {
  authClient: SupabaseAuthClientLike;
  transportEnabled: boolean;
};

export class SupabaseConsumerAuthAdapter implements ConsumerAuthPort {
  readonly source = "supabase-disabled" as const;
  private readonly authClient: SupabaseAuthClientLike;
  private readonly transportEnabled: boolean;

  constructor(options: SupabaseConsumerAuthAdapterOptions) {
    this.authClient = options.authClient;
    this.transportEnabled = options.transportEnabled;
  }

  async getCurrentSession() {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase Auth transport is disabled in Phase 1B."));
    const response = await this.authClient.getSession();
    if (response.error) return err(mapSupabaseAuthError(response.error));
    return ok(mapSupabaseSessionToConsumerAuthSession(response.data?.session));
  }

  observeAuthState(listener: ConsumerAuthStateListener) {
    if (!this.transportEnabled) {
      listener({ status: "signedOut", session: null });
      return () => undefined;
    }
    const result = this.authClient.onAuthStateChange((event, session) => {
      try {
        const mapped = mapSupabaseAuthEvent(event, session);
        if (mapped.type === "signedOut") listener({ status: "signedOut", session: null });
        else listener(mapped.session ? { status: "signedIn", session: mapped.session } : { status: "signedOut", session: null });
      } catch (error) {
        listener({ status: "error", session: null, error: error instanceof Error ? mapSupabaseAuthError({ message: error.message }) : mapSupabaseAuthError(null) });
      }
    });
    return () => result.data?.subscription?.unsubscribe();
  }

  async signIn(input: ConsumerSignInInput) {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-in is disabled in Phase 1B."));
    if (!input.email || !input.password) return err(new ConsumerAuthOperationNotEnabledError("Email/password are required by this transport."));
    const response = await this.authClient.signInWithPassword({ email: input.email, password: input.password });
    if (response.error) return err(mapSupabaseAuthError(response.error));
    const session = mapSupabaseSessionToConsumerAuthSession(response.data?.session);
    return session ? ok(session) : err(new ConsumerAuthOperationNotEnabledError("Provider did not return a session."));
  }

  async signUp(input: ConsumerSignUpInput) {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-up is disabled in Phase 1B."));
    if (!input.email || !input.password) return err(new ConsumerAuthOperationNotEnabledError("Email/password are required by this transport."));
    const response = await this.authClient.signUp({ email: input.email, password: input.password, options: { data: { displayName: input.displayName, locale: input.locale, timezone: input.timezone } } });
    if (response.error) return err(mapSupabaseAuthError(response.error));
    const session = mapSupabaseSessionToConsumerAuthSession(response.data?.session);
    return session ? ok(session) : err(new ConsumerAuthOperationNotEnabledError("Provider did not return a session."));
  }

  async signOut() {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-out is disabled in Phase 1B."));
    const response = await this.authClient.signOut();
    if (response.error) return err(mapSupabaseAuthError(response.error));
    return ok(undefined);
  }

  async refreshSession() {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase session refresh is disabled in Phase 1B."));
    const response = await this.authClient.refreshSession();
    if (response.error) return err(mapSupabaseAuthError(response.error));
    return ok(mapSupabaseSessionToConsumerAuthSession(response.data?.session));
  }

  async sendPasswordReset(input: ConsumerPasswordResetInput) {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase password reset is disabled in Phase 1B."));
    const response = await this.authClient.resetPasswordForEmail(input.email);
    if (response.error) return err(mapSupabaseAuthError(response.error));
    return ok(undefined);
  }

  async restoreSession() {
    return this.getCurrentSession();
  }
}