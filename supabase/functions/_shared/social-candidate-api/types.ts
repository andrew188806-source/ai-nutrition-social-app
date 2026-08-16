import type { SOCIAL_CANDIDATE_API_POLICY_VERSION } from "./policy.ts";

// The exact client-facing candidate. `candidateRef` is an opaque, actor-scoped, expiring target
// reference — not an identity, and never authorization to act on the candidate. There is
// deliberately no user identifier, no profile identifier, no exposure ordinal, no ranking state,
// no Taste figure, no entitlement fact and no verification or location field.
export type SocialCandidateDto = Readonly<{
  candidateRef: string;
  displayName: string;
  mascotAvatarKey: string;
  publicBio: string | null;
  willingToChat: boolean;
}>;

export type SocialCandidateApiResponse = Readonly<{
  policyVersion: typeof SOCIAL_CANDIDATE_API_POLICY_VERSION;
  candidates: readonly SocialCandidateDto[];
}>;

// One already-authorized candidate as the canonical SQL primitive returns it. `sources` stays
// `unknown` so no private Taste row can be read by this layer; it is handed straight to the frozen
// SR-1A adapter.
export type SocialCandidateTasteSubject = Readonly<{
  userId: string;
  sources: unknown;
}>;

export type SocialCandidateTasteSources = Readonly<{
  actor: SocialCandidateTasteSubject | null;
  authorizedCandidateUserIds: readonly string[];
  candidates: readonly SocialCandidateTasteSubject[];
}>;

// The narrow row source the frozen SR-2B entitlement resolver needs. Declared structurally so this
// module carries no Supabase client dependency; the authenticated user-scoped client satisfies it.
export type SocialCandidateEntitlementRowSource = Readonly<{
  from(table: "subscription_entitlements"): Readonly<{
    select(columns: string): Readonly<{
      eq(column: "user_id", value: string): PromiseLike<Readonly<{ data: unknown; error: unknown }>>;
    }>;
  }>;
}>;
