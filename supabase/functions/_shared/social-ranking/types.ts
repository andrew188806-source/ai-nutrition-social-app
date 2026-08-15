import type { SharedTasteAdapterResult } from "../../../../packages/shared/src/domain/taste-similarity/shared-adapter/types.ts";

// SR-2A is server-internal. The candidate identity and comparison result have already passed through
// the frozen SR-1D authorization and Taste pipeline before entering this pure ranking authority.
export type SocialRankingCandidateInput = Readonly<{
  candidateUserId: string;
  result: SharedTasteAdapterResult;
}>;

export type SocialRankingState = "scored" | "not_scored" | "unsupported";

export type SocialRankedCandidate = Readonly<{
  candidateUserId: string;
  rankingState: SocialRankingState;
}>;

export type SocialRankingResult = Readonly<{
  policyVersion: "social-ranking-v1";
  ordered: readonly SocialRankedCandidate[];
}>;
