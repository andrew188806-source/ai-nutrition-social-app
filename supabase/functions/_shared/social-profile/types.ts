// SR-2C is server-internal. Every candidate here has already passed frozen SR-1D authorization,
// SR-2A ranking and SR-2B entitlement exposure before any profile fact is read.

// The exact row shape the protected projection primitive returns. It carries no user identifier,
// no profile_id, no avatar URL, no verification, no health summary and no private column.
export type SocialProfileFactRow = Readonly<{
  exposure_ordinal: number;
  display_name: string;
  mascot_avatar_key: string | null;
  public_bio: string | null;
  willing_to_chat: boolean;
}>;

// The public-safe projection. `exposureIndex` is a zero-based internal correlation ordinal that
// preserves the SR-2B position; it is not a client-facing identity and never sorting authority.
// The client-facing Social identifier is deliberately deferred to the Real Candidate API phase.
export type SocialPublicProfile = Readonly<{
  exposureIndex: number;
  displayName: string;
  mascotAvatarKey: string | null;
  publicBio: string | null;
  willingToChat: boolean;
}>;

export type SocialProfileProjectionResult = Readonly<{
  policyVersion: "social-profile-projection-v1";
  candidates: readonly SocialPublicProfile[];
}>;
