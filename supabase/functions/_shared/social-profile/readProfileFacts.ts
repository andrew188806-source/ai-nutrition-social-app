import {
  SOCIAL_PROFILE_MAXIMUM_CANDIDATES,
  socialProfileContractViolation
} from "./policy.ts";
import type { SocialProfileFactRow } from "./types.ts";
import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialExposureResult } from "../social-exposure/types.ts";

// The protected primitive is the only statement this module may issue. It names five explicit
// public-safe columns; no `select *` and no private column can reach the transport.
const PROJECT_EXPOSED_SOCIAL_PROFILES = defineSocialRuntimeExecutorStatement<SocialProfileFactRow>`
  select exposure_ordinal, display_name, mascot_avatar_key, public_bio, willing_to_chat
  from social_internal.project_exposed_social_profiles($1::uuid, $2::uuid[])
`;

// The candidate set is taken from the frozen SR-2B exposure result itself rather than a bare UUID
// array, so an arbitrary caller-chosen target is not expressible at this boundary.
export async function readExposedSocialProfileFacts(
  transport: SocialRuntimeExecutorTransport,
  actorUserId: string,
  exposure: SocialExposureResult
): Promise<readonly SocialProfileFactRow[]> {
  if (typeof actorUserId !== "string" || actorUserId.length === 0) {
    return socialProfileContractViolation();
  }
  if (
    typeof exposure !== "object" ||
    exposure === null ||
    exposure.policyVersion !== "social-exposure-v1" ||
    !Array.isArray(exposure.exposed)
  ) {
    return socialProfileContractViolation();
  }
  if (exposure.exposed.length > SOCIAL_PROFILE_MAXIMUM_CANDIDATES) {
    return socialProfileContractViolation();
  }

  const candidateUserIds = exposure.exposed.map((candidate) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.candidateUserId !== "string" ||
      candidate.candidateUserId.length === 0
    ) {
      return socialProfileContractViolation();
    }
    return candidate.candidateUserId;
  });
  if (new Set(candidateUserIds.map((entry) => entry.toLowerCase())).size !== candidateUserIds.length) {
    return socialProfileContractViolation();
  }

  const rows = await transport.withTransaction((transaction) =>
    transaction.query(PROJECT_EXPOSED_SOCIAL_PROFILES, [actorUserId, candidateUserIds])
  );
  return rows;
}
