import { ConsumerAuthError, ConsumerAuthOperationNotEnabledError, ConsumerEmailConfirmationRequiredError } from "../errors";
import type { ConsumerAuthPort, ConsumerAuthStateListener } from "../ports";
import type { ConsumerPasswordResetInput, ConsumerSignInInput, ConsumerSignUpInput } from "../types";
import { err, ok } from "../types";
import type { SupabaseAuthClientLike } from "../supabaseAuthContracts";
import { mapSupabaseAuthError, mapSupabaseAuthEvent, mapSupabaseSessionToConsumerAuthSession } from "../supabaseAuthMappers";

export type SupabaseConsumerAuthAdapterOptions = {
  authClient: SupabaseAuthClientLike;
  transportEnabled: boolean;
  emailRedirectTo?: string | null;
  signupAdmission?: () => Promise<boolean>;
};

export class SupabaseConsumerAuthAdapter implements ConsumerAuthPort {
  readonly source: "supabase-disabled" | "supabase-live";
  private readonly authClient: SupabaseAuthClientLike;
  private readonly transportEnabled: boolean;

  constructor(private readonly options: SupabaseConsumerAuthAdapterOptions) {
    this.authClient = options.authClient;
    this.transportEnabled = options.transportEnabled;
    this.source = options.transportEnabled ? "supabase-live" : "supabase-disabled";
  }

  async getCurrentSession() {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase Auth transport is disabled."));
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
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-in is disabled."));
    if (!input.email || !input.password) return err(new ConsumerAuthOperationNotEnabledError("Email/password are required by this transport."));
    const response = await this.authClient.signInWithPassword({ email: input.email, password: input.password });
    if (response.error) return err(mapSupabaseAuthError(response.error));
    const session = mapSupabaseSessionToConsumerAuthSession(response.data?.session);
    return session ? ok(session) : err(new ConsumerAuthOperationNotEnabledError("Provider did not return a session."));
  }

  async signUp(input: ConsumerSignUpInput) {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-up is disabled."));
    if (!input.email || !input.password) return err(new ConsumerAuthOperationNotEnabledError("Email/password are required by this transport."));
    if (!this.options.emailRedirectTo || !this.options.signupAdmission || !(await this.options.signupAdmission())) return err(new ConsumerAuthOperationNotEnabledError("Canonical signup documents or configured callback unavailable."));
    const response = await this.authClient.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: this.options.emailRedirectTo } });
    if (response.error) return err(mapSupabaseAuthError(response.error));
    const session = mapSupabaseSessionToConsumerAuthSession(response.data?.session);
    return session ? ok(session) : err(new ConsumerEmailConfirmationRequiredError());
  }


  private otpError(error: { code?: string | null; status?: number | null } | null | undefined) {
    const code = error?.code;
    if (error?.status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit")
      return new ConsumerAuthError("email_otp_rate_limited", "Email verification is rate limited.");
    if (code === "otp_expired")
      return new ConsumerAuthError("email_otp_invalid_or_expired", "Email code is invalid, expired, or already used.");
    return new ConsumerAuthError("email_otp_send_failed", "Email verification request failed.");
  }

  async sendEmailCode(input: { email: string; purpose: "login" | "signup" }) {
    if (!this.transportEnabled || !this.authClient.signInWithOtp)
      return err(new ConsumerAuthOperationNotEnabledError("Email OTP transport is unavailable."));
    // Account creation retains canonical document admission. Login never creates an account.
    if (input.purpose === "signup" && (!this.options.signupAdmission || !(await this.options.signupAdmission())))
      return err(new ConsumerAuthOperationNotEnabledError("Canonical signup documents unavailable."));
    const response = await this.authClient.signInWithOtp({ email: input.email, options: { shouldCreateUser: input.purpose === "signup" } });
    return response.error ? err(this.otpError(response.error)) : ok(undefined);
  }

  async verifyEmailCode(input: { email: string; token: string }) {
    if (!this.transportEnabled || !this.authClient.verifyOtp)
      return err(new ConsumerAuthOperationNotEnabledError("Email OTP transport is unavailable."));
    // Installed auth-js documents 'email' for signup and signin; signup/magiclink are deprecated.
    const response = await this.authClient.verifyOtp({ email: input.email, token: input.token, type: "email" });
    if (response.error) return err(this.otpError(response.error));
    if (response.data?.session?.user?.email?.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
      await this.authClient.signOut({ scope: "local" });
      return err(new ConsumerAuthError("email_otp_identity_mismatch", "Verified email identity mismatch."));
    }
    const session = mapSupabaseSessionToConsumerAuthSession(response.data?.session);
    return session ? ok(session) : err(new ConsumerEmailConfirmationRequiredError());
  }

  async completeEmailConfirmation(code: string) {
    if (!this.transportEnabled || !this.authClient.exchangeCodeForSession || !code) return err(new ConsumerAuthOperationNotEnabledError("Configured confirmation transport unavailable."));
    const response = await this.authClient.exchangeCodeForSession(code);
    if (response.error) return err(mapSupabaseAuthError(response.error));
    const session = mapSupabaseSessionToConsumerAuthSession(response.data?.session);
    return session ? ok(session) : err(new ConsumerEmailConfirmationRequiredError());
  }

  async signOut() {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-out is disabled."));
    const response = await this.authClient.signOut();
    if (response.error) return err(mapSupabaseAuthError(response.error));
    return ok(undefined);
  }

  async refreshSession() {
    if (!this.transportEnabled) return err(new ConsumerAuthOperationNotEnabledError("Supabase session refresh is disabled."));
    const response = await this.authClient.refreshSession();
    if (response.error) return err(mapSupabaseAuthError(response.error));
    return ok(mapSupabaseSessionToConsumerAuthSession(response.data?.session));
  }

  async sendPasswordReset(input: ConsumerPasswordResetInput) {
    void input;
    return err(new ConsumerAuthOperationNotEnabledError("Supabase password reset is not enabled in Consumer Phase 1C."));
  }

  async restoreSession() {
    return this.getCurrentSession();
  }
}
