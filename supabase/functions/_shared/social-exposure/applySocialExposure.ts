import {
  SOCIAL_EXPOSURE_CAPS,
  SOCIAL_EXPOSURE_POLICY_VERSION,
  socialEntitlementContractViolation
} from "./policy.ts";
import type { SocialEntitlementFact, SocialExposureResult } from "./types.ts";
import type { SocialRankedCandidate, SocialRankingResult } from "../social-ranking/types.ts";

const RANKING_STATES = new Set(["scored", "not_scored", "unsupported"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Structural admission only. A malformed input fails the whole request; no candidate is ever
// dropped, reordered or repaired, so exposure can never silently shrink a valid ranking.
function admitCandidate(value: unknown): SocialRankedCandidate {
  if (
    !isRecord(value) ||
    typeof value.candidateUserId !== "string" ||
    value.candidateUserId.length === 0 ||
    typeof value.rankingState !== "string" ||
    !RANKING_STATES.has(value.rankingState)
  ) {
    return socialEntitlementContractViolation();
  }
  return value as unknown as SocialRankedCandidate;
}

function admitEntitlementCap(entitlement: SocialEntitlementFact): number {
  if (!isRecord(entitlement)) return socialEntitlementContractViolation();
  const cap = SOCIAL_EXPOSURE_CAPS[entitlement.class as keyof typeof SOCIAL_EXPOSURE_CAPS];
  if (typeof cap !== "number") return socialEntitlementContractViolation();
  return cap;
}

// Pure prefix authority. The SR-2A order is immutable input: this never sorts, reranks, filters by
// rankingState, confidence, goal, context or restriction, and never draws from another source.
export function applySocialExposure(
  ranking: SocialRankingResult,
  entitlement: SocialEntitlementFact
): SocialExposureResult {
  if (!isRecord(ranking) || ranking.policyVersion !== "social-ranking-v1" || !Array.isArray(ranking.ordered)) {
    return socialEntitlementContractViolation();
  }
  const admitted = ranking.ordered.map(admitCandidate);
  const cap = admitEntitlementCap(entitlement);

  return Object.freeze({
    policyVersion: SOCIAL_EXPOSURE_POLICY_VERSION,
    exposed: Object.freeze(admitted.slice(0, cap)),
    truncated: admitted.length > cap
  });
}
