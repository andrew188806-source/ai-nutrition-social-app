export const SOCIAL_RANKING_POLICY_VERSION = "social-ranking-v1" as const;

export const SOCIAL_RANKING_STATES = Object.freeze([
  "scored",
  "not_scored",
  "unsupported"
] as const);

export const SOCIAL_RANKING_CONTRACT_ERROR = "social_ranking_contract_violated" as const;

export function socialRankingContractViolation(): never {
  throw new Error(SOCIAL_RANKING_CONTRACT_ERROR);
}
