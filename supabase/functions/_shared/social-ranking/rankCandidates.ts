import {
  SOCIAL_RANKING_POLICY_VERSION,
  socialRankingContractViolation
} from "./policy.ts";
import type {
  SocialRankedCandidate,
  SocialRankingCandidateInput,
  SocialRankingResult,
  SocialRankingState
} from "./types.ts";

type WorkingCandidate = Readonly<{
  candidateUserId: string;
  rankingState: SocialRankingState;
  score: number | null;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSUPPORTED_REASONS = new Set([
  "unsupported_snapshot_schema",
  "policy_version_mismatch"
]);
const NOT_SCORED_REASONS = new Set([
  "no_comparable_evidence",
  "insufficient_evidence",
  "unsupported_snapshot_schema"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Exact frozen repository behavior: deterministic ECMAScript code-unit ordering, never locale
// ordering. The comparator always reaches this tie-break for equal scores and every non-scored row.
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function bucketOrder(state: SocialRankingState): number {
  if (state === "scored") return 0;
  if (state === "not_scored") return 1;
  if (state === "unsupported") return 2;
  return socialRankingContractViolation();
}

function classifyCandidate(value: unknown): WorkingCandidate {
  if (!isRecord(value) || typeof value.candidateUserId !== "string" || !UUID_PATTERN.test(value.candidateUserId)) {
    return socialRankingContractViolation();
  }
  const result = value.result;
  if (!isRecord(result) || !isRecord(result.versions)) return socialRankingContractViolation();

  if (result.status === "unsupported") {
    if (typeof result.reason !== "string" || !UNSUPPORTED_REASONS.has(result.reason)) {
      return socialRankingContractViolation();
    }
    return Object.freeze({ candidateUserId: value.candidateUserId, rankingState: "unsupported", score: null });
  }
  if (result.status !== "adapted" || !isRecord(result.taste) || !isRecord(result.taste.similarity)) {
    return socialRankingContractViolation();
  }

  const similarity = result.taste.similarity;
  if (similarity.status === "not_scored") {
    if (typeof similarity.reason !== "string" || !NOT_SCORED_REASONS.has(similarity.reason)) {
      return socialRankingContractViolation();
    }
    return Object.freeze({ candidateUserId: value.candidateUserId, rankingState: "not_scored", score: null });
  }
  if (
    similarity.status !== "scored" ||
    typeof similarity.score !== "number" ||
    !Number.isFinite(similarity.score) ||
    similarity.score < 0 ||
    similarity.score > 1
  ) {
    return socialRankingContractViolation();
  }
  return Object.freeze({ candidateUserId: value.candidateUserId, rankingState: "scored", score: similarity.score });
}

function compareCandidates(left: WorkingCandidate, right: WorkingCandidate): number {
  const bucketDifference = bucketOrder(left.rankingState) - bucketOrder(right.rankingState);
  if (bucketDifference !== 0) return bucketDifference;
  if (left.rankingState === "scored" && right.rankingState === "scored" && left.score !== right.score) {
    return left.score! > right.score! ? -1 : 1;
  }
  return compareCodeUnits(left.candidateUserId, right.candidateUserId);
}

function projectCandidate(candidate: WorkingCandidate): SocialRankedCandidate {
  return Object.freeze({
    candidateUserId: candidate.candidateUserId,
    rankingState: candidate.rankingState
  });
}

export function rankSocialCandidates(
  candidates: readonly SocialRankingCandidateInput[]
): SocialRankingResult {
  if (!Array.isArray(candidates)) return socialRankingContractViolation();
  const classified = candidates.map(classifyCandidate);
  const candidateIds = classified.map(({ candidateUserId }) => candidateUserId.toLowerCase());
  if (new Set(candidateIds).size !== candidateIds.length) return socialRankingContractViolation();

  return Object.freeze({
    policyVersion: SOCIAL_RANKING_POLICY_VERSION,
    ordered: Object.freeze([...classified].sort(compareCandidates).map(projectCandidate))
  });
}
