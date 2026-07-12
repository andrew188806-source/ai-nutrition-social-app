import type {
  ConsumerAuthResult,
  ConsumerAuthSession,
  ConsumerAuthState,
  ConsumerAuthUnsubscribe,
  ConsumerPasswordResetInput,
  ConsumerPrivateProfile,
  ConsumerProfile,
  ConsumerProfileBootstrapInput,
  ConsumerProfileBootstrapResult,
  ConsumerProfileUpdateInput,
  ConsumerSignInInput,
  ConsumerSignUpInput,
  ConsumerAccountLifecycleStatus
} from "./types";

export type ConsumerAuthStateListener = (state: ConsumerAuthState) => void;

export interface ConsumerAuthPort {
  readonly source: "mock" | "supabase-disabled" | "supabase-live";
  getCurrentSession(): Promise<ConsumerAuthResult<ConsumerAuthSession | null>>;
  observeAuthState(listener: ConsumerAuthStateListener): ConsumerAuthUnsubscribe;
  signIn(input: ConsumerSignInInput): Promise<ConsumerAuthResult<ConsumerAuthSession>>;
  signUp(input: ConsumerSignUpInput): Promise<ConsumerAuthResult<ConsumerAuthSession>>;
  signOut(): Promise<ConsumerAuthResult<void>>;
  refreshSession(): Promise<ConsumerAuthResult<ConsumerAuthSession | null>>;
  sendPasswordReset(input: ConsumerPasswordResetInput): Promise<ConsumerAuthResult<void>>;
  restoreSession(): Promise<ConsumerAuthResult<ConsumerAuthSession | null>>;
}

export interface ConsumerProfileRepository {
  readonly source: "mock" | "supabase-disabled" | "supabase-live";
  getProfile(userId: string): Promise<ConsumerAuthResult<ConsumerProfile | null>>;
  getPrivateProfile(userId: string): Promise<ConsumerAuthResult<ConsumerPrivateProfile | null>>;
  bootstrapProfile(input: ConsumerProfileBootstrapInput): Promise<ConsumerAuthResult<ConsumerProfileBootstrapResult>>;
  updateProfile(userId: string, input: ConsumerProfileUpdateInput): Promise<ConsumerAuthResult<ConsumerProfile>>;
  markOnboardingComplete(userId: string): Promise<ConsumerAuthResult<ConsumerProfile>>;
  getAccountLifecycleStatus(userId: string): Promise<ConsumerAuthResult<ConsumerAccountLifecycleStatus>>;
}