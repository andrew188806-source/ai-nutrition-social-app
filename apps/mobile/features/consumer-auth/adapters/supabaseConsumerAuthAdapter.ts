import { ConsumerAuthError, ConsumerAuthOperationNotEnabledError, ConsumerEmailConfirmationRequiredError } from "../errors";
import type { ConsumerAuthPort, ConsumerAuthStateListener } from "../ports";
import type { ConsumerPasswordResetInput, ConsumerSignInInput, ConsumerSignUpInput } from "../types";
import { err, ok } from "../types";
import type { SupabaseAuthClientLike } from "../supabaseAuthContracts";
import { mapSupabaseAuthError, mapSupabaseAuthEvent, mapSupabaseSessionToConsumerAuthSession } from "../supabaseAuthMappers";

// Consumer password recovery is for consumers only. Admin/staff accounts follow the dedicated admin recovery SOP, so the consumer path
// refuses them. The decision comes from the database authority the admin console itself uses (the two SECURITY DEFINER context RPCs,
// which key on the verified JWT subject and read admin_internal tables), never from the client, an email address or user_metadata.
// "restricted" and "unknown" are deliberately indistinguishable to the caller: refusal first, and no admin-status disclosure.
export type PasswordRecoveryDecision = "eligible" | "restricted" | "unknown";
export type PasswordRecoveryGuard = () => Promise<PasswordRecoveryDecision>;
const RECOVERY_AUTHORITY_RPCS = ["platform_admin_current_context_v1", "staff_current_context_v1"] as const;

export function createPasswordRecoveryGuard(client: { rpc(name: string): PromiseLike<{ data?: unknown; error?: unknown }> }, timeoutMs = 8000): PasswordRecoveryGuard {
  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const results = await Promise.race([
        Promise.all(RECOVERY_AUTHORITY_RPCS.map((name) => client.rpc(name))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("RECOVERY_GUARD_TIMEOUT")), timeoutMs); })
      ]);
      let unknown = false;
      for (const result of results) {
        if (result.error || !Array.isArray(result.data)) unknown = true;
        else if (result.data.length > 0) return "restricted";
      }
      return unknown ? "unknown" : "eligible";
    } catch { return "unknown"; } finally { if (timer !== undefined) clearTimeout(timer); }
  };
}

export type SupabaseConsumerAuthAdapterOptions = {
  authClient: SupabaseAuthClientLike;
  transportEnabled: boolean;
  emailRedirectTo?: string | null;
  signupAdmission?: () => Promise<boolean>;
  passwordRecoveryGuard?: PasswordRecoveryGuard;
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
    if (response.error?.code === "invalid_credentials")
      return err(new ConsumerAuthError("authentication_required", "Email/password credentials were rejected."));
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

  async setOwnPassword(input: { expectedUserId: string; password: string }) {
    if (!this.transportEnabled || !this.authClient.getUser || !this.authClient.updateUser)
      return err(new ConsumerAuthOperationNotEnabledError("Password settings transport is unavailable."));
    if (!input.expectedUserId || input.password.length < 8)
      return err(new ConsumerAuthError("password_invalid", "Password does not meet the minimum length."));
    const verified = await this.authClient.getUser();
    const user = verified.data?.user;
    if (verified.error || !user || user.id !== input.expectedUserId || !user.email_confirmed_at || user.is_anonymous)
      return err(new ConsumerAuthError("password_reauthentication_required", "Verify your own email again."));
    const current = await this.authClient.getSession();
    if (current.error || current.data?.session?.user?.id !== user.id)
      return err(new ConsumerAuthError("password_reauthentication_required", "Account changed before password settings."));
    // Admin/staff accounts (and any account whose status cannot be established) never change their password through this consumer path.
    if (!(await this.recoveryAllowed()))
      return err(new ConsumerAuthError("password_recovery_unavailable", "Password settings are not available for this account here."));
    // An account with a verified second factor needs an AAL2 session to change its password. Check before sending, so a
    // known-refused request is not made; the server answer below stays the final authority.
    const assurance = await this.authClient.mfa?.getAuthenticatorAssuranceLevel();
    if (assurance && !assurance.error && assurance.data?.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2")
      return err(new ConsumerAuthError("password_mfa_required", "A second-factor check is required before the password can change."));
    const response = await this.authClient.updateUser({ password: input.password });
    input.password = "";
    if (response.error) {
      const code = response.error.code;
      return err(new ConsumerAuthError(code === "weak_password" ? "password_weak" : code === "same_password" ? "password_unchanged" : code === "reauthentication_needed" ? "password_reauthentication_required" : code === "insufficient_aal" ? "password_mfa_required" : "password_update_failed", "Password settings were not completed."));
    }
    if (response.data?.user?.id !== user.id)
      return err(new ConsumerAuthError("password_reauthentication_required", "Password update identity could not be verified."));
    return ok(undefined);
  }

  private async recoveryAllowed() {
    const guard = this.options.passwordRecoveryGuard;
    if (!guard) return false; // no authority wired: refuse
    try { return (await guard()) === "eligible"; } catch { return false; }
  }

  // Early, user-facing form of the same decision (the checks inside setOwnPassword / verifyTotpStepUp stay as the enforcing ones).
  // The guard reads the CURRENT session's subject, so the session must still be the verified account first.
  async checkPasswordRecoveryEligibility(input: { expectedUserId: string }) {
    const refused = () => err<void>(new ConsumerAuthError("password_recovery_unavailable", "Password settings are not available for this account here."));
    if (!this.transportEnabled || !this.authClient.getUser || !input.expectedUserId) return refused();
    const verified = await this.authClient.getUser();
    const user = verified.data?.user;
    if (verified.error || !user || user.id !== input.expectedUserId || user.is_anonymous) return err<void>(new ConsumerAuthError("password_reauthentication_required", "Verify your own email again."));
    const current = await this.authClient.getSession();
    if (current.error || current.data?.session?.user?.id !== user.id) return err<void>(new ConsumerAuthError("password_reauthentication_required", "Account changed before password settings."));
    return (await this.recoveryAllowed()) ? ok(undefined) : refused();
  }

  // Whether the current email-verified session must be raised to AAL2 (verified TOTP factor, AAL1 session) before the password may change.
  async getPasswordStepUpState() {
    const mfa = this.authClient.mfa;
    if (!this.transportEnabled || !mfa) return err(new ConsumerAuthError("totp_unavailable", "Second-factor transport is unavailable."));
    const response = await mfa.getAuthenticatorAssuranceLevel();
    if (response.error || !response.data) return err(new ConsumerAuthError("totp_unavailable", "Authenticator assurance level could not be read."));
    return ok({ totpRequired: response.data.nextLevel === "aal2" && response.data.currentLevel !== "aal2" });
  }

  // Raises the current session to AAL2 with the account's own TOTP factor. Nothing is changed unless the identity matches before and after.
  async verifyTotpStepUp(input: { expectedUserId: string; code: string }) {
    const mfa = this.authClient.mfa;
    if (!this.transportEnabled || !mfa || !this.authClient.getUser)
      return err(new ConsumerAuthError("totp_unavailable", "Second-factor transport is unavailable."));
    if (!input.expectedUserId || !/^\d{6}$/.test(input.code))
      return err(new ConsumerAuthError("totp_invalid_code", "The authenticator code must be 6 digits."));
    const sameIdentity = async () => {
      const verified = await this.authClient.getUser?.();
      const user = verified?.data?.user;
      if (verified?.error || !user || user.id !== input.expectedUserId || !user.email_confirmed_at || user.is_anonymous) return false;
      const current = await this.authClient.getSession();
      return !current.error && current.data?.session?.user?.id === user.id;
    };
    if (!(await sameIdentity())) return err(new ConsumerAuthError("password_reauthentication_required", "Account changed before the second-factor check."));
    if (!(await this.recoveryAllowed()))
      return err(new ConsumerAuthError("password_recovery_unavailable", "Password settings are not available for this account here."));
    const listed = await mfa.listFactors();
    const factors = listed.data?.totp?.filter((factor) => factor.status === "verified") ?? [];
    if (listed.error || factors.length === 0) return err(new ConsumerAuthError("totp_unavailable", "No verified authenticator factor is available."));
    let verifiedOne = false;
    const totpCode = input.code;
    input.code = "";
    for (const factor of factors) {
      const challenge = await mfa.challenge({ factorId: factor.id });
      if (challenge.error || !challenge.data?.id) return err(new ConsumerAuthError("totp_unavailable", "Second-factor challenge could not be created."));
      const response = await mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: totpCode });
      if (!response.error) { verifiedOne = true; break; }
      const code = response.error.code;
      if (code !== "mfa_verification_failed" && code !== "mfa_challenge_expired")
        return err(new ConsumerAuthError("totp_unavailable", "Second-factor verification could not be completed."));
    }
    if (!verifiedOne) return err(new ConsumerAuthError("totp_invalid_code", "The authenticator code was not accepted."));
    const assurance = await mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data?.currentLevel !== "aal2" || !(await sameIdentity()))
      return err(new ConsumerAuthError("password_reauthentication_required", "Second-factor result could not be tied to the same account."));
    return ok(undefined);
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
