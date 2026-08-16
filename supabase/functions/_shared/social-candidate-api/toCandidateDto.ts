import {
  SOCIAL_CANDIDATE_API_MAXIMUM_CANDIDATES,
  SOCIAL_CANDIDATE_API_POLICY_VERSION,
  socialCandidateApiContractViolation
} from "./policy.ts";
import type { SocialCandidateApiResponse, SocialCandidateDto } from "./types.ts";
import type { SocialExposureResult } from "../social-exposure/types.ts";
import type { SocialProfileProjectionResult } from "../social-profile/types.ts";
import type { SocialCandidateRefCipher } from "../social-candidate-ref/types.ts";

// Joins the frozen SR-2B exposure to the frozen SR-2C projection using `exposureIndex` strictly as
// an internal coordinate, and emits the exact five-field client DTO.
//
// SR-2C omits any exposed candidate lacking an active public profile, so the projection is a
// subsequence of the exposure. Survivors keep their relative exposure order: the projection is
// consumed in the order SR-2C produced it and is never sorted, reversed or reranked here, and an
// omitted position is never refilled by shifting a later candidate into it.
//
// The verified actor is an explicit parameter. It is never derived from the exposure, the
// projection or any client-supplied value, and no actor state is held at module scope — an Edge
// isolate serves concurrent requests, so shared mutable actor state could bleed across them.
export async function toSocialCandidateApiResponse(
  actorUserId: string,
  exposure: SocialExposureResult,
  projection: SocialProfileProjectionResult,
  cipher: SocialCandidateRefCipher,
  requestInstant: Date
): Promise<SocialCandidateApiResponse> {
  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return socialCandidateApiContractViolation();
  }
  if (
    typeof exposure !== "object" ||
    exposure === null ||
    exposure.policyVersion !== "social-exposure-v1" ||
    !Array.isArray(exposure.exposed)
  ) {
    return socialCandidateApiContractViolation();
  }
  if (
    typeof projection !== "object" ||
    projection === null ||
    projection.policyVersion !== "social-profile-projection-v1" ||
    !Array.isArray(projection.candidates)
  ) {
    return socialCandidateApiContractViolation();
  }
  // The exposure cap is the only bound; a projection can never exceed the exposure it came from.
  if (
    exposure.exposed.length > SOCIAL_CANDIDATE_API_MAXIMUM_CANDIDATES ||
    projection.candidates.length > exposure.exposed.length
  ) {
    return socialCandidateApiContractViolation();
  }

  const seen = new Set<number>();
  const candidates: SocialCandidateDto[] = [];
  for (const profile of projection.candidates) {
    const ordinal = profile.exposureIndex;
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= exposure.exposed.length) {
      return socialCandidateApiContractViolation();
    }
    if (seen.has(ordinal)) return socialCandidateApiContractViolation();
    seen.add(ordinal);

    const exposed = exposure.exposed[ordinal];
    if (
      typeof exposed !== "object" ||
      exposed === null ||
      typeof exposed.candidateUserId !== "string" ||
      exposed.candidateUserId.length === 0
    ) {
      return socialCandidateApiContractViolation();
    }
    if (typeof profile.displayName !== "string" || profile.displayName.length === 0) {
      return socialCandidateApiContractViolation();
    }
    // consumer_profiles.mascot_avatar_key is NOT NULL, so a null here is a broken invariant rather
    // than an optional field, and the request fails closed instead of emitting a degraded card.
    if (typeof profile.mascotAvatarKey !== "string" || profile.mascotAvatarKey.length === 0) {
      return socialCandidateApiContractViolation();
    }
    if (profile.publicBio !== null && typeof profile.publicBio !== "string") {
      return socialCandidateApiContractViolation();
    }
    // Presentation only. A candidate unwilling to chat stays in the result; this is never a filter.
    if (typeof profile.willingToChat !== "boolean") {
      return socialCandidateApiContractViolation();
    }

    const candidateRef = await cipher.seal(actorUserId, exposed.candidateUserId, requestInstant);
    if (typeof candidateRef !== "string" || candidateRef.length === 0) {
      return socialCandidateApiContractViolation();
    }
    candidates.push(Object.freeze({
      candidateRef,
      displayName: profile.displayName,
      mascotAvatarKey: profile.mascotAvatarKey,
      publicBio: profile.publicBio,
      willingToChat: profile.willingToChat
    }));
  }

  return Object.freeze({
    policyVersion: SOCIAL_CANDIDATE_API_POLICY_VERSION,
    candidates: Object.freeze(candidates)
  });
}
