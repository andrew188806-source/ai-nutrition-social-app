// SR-2E: the client-facing Social candidate contract, shared by Mobile and reusable by tests.
//
// This mirrors the frozen SR-2D public response exactly. It is deliberately the ONLY client-visible
// Social candidate shape: there is no user identifier, no profile identifier, no exposure ordinal,
// no ranking state, no Taste figure, no entitlement or billing fact, and no verification, age,
// location or health field, because none of those exist on this type.
//
// Ordering is server authority. The array arrives already ranked by SR-2A, already truncated to the
// SR-2B entitlement prefix, and already reduced by SR-2C profile projection. A client may render it
// but may never sort, rerank, filter, cap, refill or paginate it.

export const SOCIAL_CANDIDATE_API_POLICY_VERSION = "social-candidate-api-v1" as const;

export const SOCIAL_CANDIDATE_FIELDS = Object.freeze([
  "candidateRef",
  "displayName",
  "mascotAvatarKey",
  "publicBio",
  "willingToChat"
] as const);

export const SOCIAL_CANDIDATE_RESPONSE_FIELDS = Object.freeze([
  "candidates",
  "policyVersion"
] as const);

// `candidateRef` is an opaque, actor-scoped, expiring target reference. It is not an identity, not
// a profile identifier and never authorization to act on the candidate. A client may use it as a
// list key for one response and must never decode, split, persist or compare it across requests.
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
