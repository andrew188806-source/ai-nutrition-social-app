import { ConsumerAuthOperationNotEnabledError, ConsumerAuthProviderNotConfiguredError } from "../errors";
import type { ConsumerAuthPort, ConsumerAuthStateListener } from "../ports";
import type { ConsumerPasswordResetInput, ConsumerSignInInput, ConsumerSignUpInput } from "../types";
import { err, ok } from "../types";

export class SupabaseDisabledConsumerAuthAdapter implements ConsumerAuthPort {
  readonly source = "supabase-disabled" as const;

  async getCurrentSession() {
    return ok(null);
  }

  observeAuthState(listener: ConsumerAuthStateListener) {
    listener({ status: "signedOut", session: null });
    return () => undefined;
  }

  async signIn(_input: ConsumerSignInInput) {
    return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-in is disabled in Consumer Phase 1A."));
  }

  async signUp(_input: ConsumerSignUpInput) {
    return err(new ConsumerAuthOperationNotEnabledError("Supabase sign-up is disabled in Consumer Phase 1A."));
  }

  async signOut() {
    return ok(undefined);
  }

  async refreshSession() {
    return err(new ConsumerAuthProviderNotConfiguredError("Supabase auth transport is not configured in Consumer Phase 1A."));
  }

  async sendPasswordReset(_input: ConsumerPasswordResetInput) {
    return err(new ConsumerAuthOperationNotEnabledError("Supabase password reset is disabled in Consumer Phase 1A."));
  }

  async restoreSession() {
    return ok(null);
  }
}