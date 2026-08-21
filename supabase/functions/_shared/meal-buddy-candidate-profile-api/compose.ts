import { readExposedCandidateInterests } from "../meal-buddy-candidate-api/readCandidateCards.ts";
import { collectProfileInterests } from "../social-interest/aggregate.ts";
import {
  SOCIAL_INTEREST_MAX_FOOD,
  SOCIAL_INTEREST_MAX_GENERAL,
  type SocialInterestRow
} from "../social-interest/types.ts";
import {
  projectPublicSocialProfiles,
  readExposedSocialProfileFacts
} from "../social-profile/index.ts";
import type { SocialRuntimeExecutorTransport } from "../social-runtime-transport/executorTransactionTransport.ts";
import type { SocialExposureResult } from "../social-exposure/types.ts";
import type { MealBuddyCandidateProfileApiResponse } from "./types.ts";

export type MealBuddyCandidateProfileComposition = Readonly<{
  transport: SocialRuntimeExecutorTransport;
  actorUserId: string;
  candidateUserId: string;
}>;

function validInterestRow(row: SocialInterestRow): boolean {
  if (row.exposure_ordinal !== 0 || (row.namespace !== "general" && row.namespace !== "food")) return false;
  if (typeof row.tag_key !== "string" || typeof row.category_key !== "string") return false;
  const tagSegments = row.tag_key.split(".");
  return tagSegments.length >= 3 && tagSegments[0] === row.namespace && tagSegments.slice(1).every(Boolean);
}

// candidateRef was minted only after SR-2B exposure. Opening it establishes that previously exposed
// person for this verified actor; this one-entry structural value does NOT rerank, re-expose or
// invent an entitlement decision. Both frozen projection primitives still re-check the current
// canonical candidate pool, active profile and current interest rows before returning anything.
function referencedExposure(candidateUserId: string): SocialExposureResult {
  return Object.freeze({
    policyVersion: "social-exposure-v1" as const,
    exposed: Object.freeze([Object.freeze({ candidateUserId, rankingState: "not_scored" as const })]),
    truncated: false
  });
}

export async function composeMealBuddyCandidateProfile(
  composition: MealBuddyCandidateProfileComposition
): Promise<MealBuddyCandidateProfileApiResponse | null> {
  const { transport, actorUserId, candidateUserId } = composition;
  if (!actorUserId || !candidateUserId || actorUserId === candidateUserId) return null;

  const exposure = referencedExposure(candidateUserId);
  const profileRows = await readExposedSocialProfileFacts(transport, actorUserId, exposure);
  const projection = projectPublicSocialProfiles(exposure, profileRows);
  if (projection.candidates.length !== 1 || projection.candidates[0]?.exposureIndex !== 0) return null;

  const interestRows = await readExposedCandidateInterests(transport, actorUserId, [candidateUserId]);
  if (!interestRows.every(validInterestRow)) throw new Error("candidate_profile_interest_contract_violated");
  const interests = collectProfileInterests(interestRows);
  if (
    interests.publicInterestTags.length > SOCIAL_INTEREST_MAX_GENERAL ||
    interests.foodInterestTags.length > SOCIAL_INTEREST_MAX_FOOD
  ) throw new Error("candidate_profile_interest_contract_violated");

  const profile = projection.candidates[0];
  if (!profile.mascotAvatarKey) throw new Error("candidate_profile_projection_contract_violated");
  return Object.freeze({
    policyVersion: "meal-buddy-candidate-profile-v1" as const,
    profile: Object.freeze({
      displayName: profile.displayName,
      mascotAvatarKey: profile.mascotAvatarKey,
      publicBio: profile.publicBio,
      willingToChat: profile.willingToChat,
      publicInterestTags: Object.freeze(interests.publicInterestTags.map((tag) => tag.tagKey)),
      foodInterestTags: Object.freeze(interests.foodInterestTags.map((tag) => tag.tagKey))
    })
  });
}
