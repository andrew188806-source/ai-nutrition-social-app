import type { ConsumerAuthError } from "./errors";

export type ConsumerAuthProvider = "mock" | "supabase";
export type ConsumerAuthSource = "mock" | "supabase-disabled" | "supabase-live";
export type ConsumerProfileSource = "mock" | "supabase-disabled" | "supabase-live";

export type ConsumerAccountLifecycleStatus = "active" | "disabled" | "deletion_requested" | "anonymizing" | "anonymized" | "deleted";
export type ConsumerAuthStateStatus = "initializing" | "signedOut" | "signedIn" | "disabled" | "error";

export type ConsumerAuthUser = {
  userId: string;
  provider: ConsumerAuthProvider;
  isAnonymous: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastSignedInAt?: string;
};

export type ConsumerAuthSession = {
  user: ConsumerAuthUser;
  provider: ConsumerAuthProvider;
  issuedAt: string;
  expiresAt?: string;
};

export type ConsumerAuthState = {
  status: ConsumerAuthStateStatus;
  session: ConsumerAuthSession | null;
  error?: ConsumerAuthError;
};

export type ConsumerAuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ConsumerAuthError };

export type ConsumerSignInInput = {
  email?: string;
  password?: string;
  mockUserId?: string;
};

export type ConsumerSignUpInput = {
  email?: string;
  password?: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
};

export type ConsumerPasswordResetInput = {
  email: string;
};

export type ConsumerProfile = {
  userId: string;
  profileId: string;
  displayName: string;
  nickname?: string;
  avatarUrl?: string | null;
  locale: string;
  timezone: string;
  energyUnit: "kcal";
  weightUnit: "kg";
  lifecycleStatus: ConsumerAccountLifecycleStatus;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerPrivateProfile = {
  userId: string;
  profileId: string;
  privateProfileReady: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerProfileBootstrapInput = {
  userId: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
  requestId?: string;
};

export type ConsumerProfileBootstrapResult = {
  profile: ConsumerProfile;
  created: boolean;
  requestId?: string;
};

export type ConsumerProfileUpdateInput = {
  displayName?: string;
  nickname?: string;
  avatarUrl?: string | null;
  locale?: string;
  timezone?: string;
};

export type ConsumerRuntimeFlags = {
  authSource: ConsumerAuthSource;
  profileSource: ConsumerProfileSource;
  supabaseAuthEnabled: boolean;
  supabaseWritesEnabled: boolean;
  issues: string[];
};

export type ConsumerAuthUnsubscribe = () => void;

export function ok<T>(value: T): ConsumerAuthResult<T> {
  return { ok: true, value };
}

export function err<T = never>(error: ConsumerAuthError): ConsumerAuthResult<T> {
  return { ok: false, error };
}