export type RecommendationCompositionPolicy = Readonly<{
  policyId: string;
  policyVersion: number;
  strategy: "alternating_dual_lane";
  laneA: Readonly<{
    strategy: "nutrition_primary_tolerance_band";
    nutritionTolerance: number;
    tasteApplication: "eligible_taste_slots_only";
  }>;
  laneB: Readonly<{
    strategy: "taste_forward_rank_composite";
    tasteRankWeight: number;
    nutritionRankWeight: number;
    rankUtility: "linear_zero_based";
  }>;
  interleave: "odd_a_even_b";
  dedupeKey: "candidateId";
  laneFallback: "other_lane_then_nutrition_baseline";
  clippingOrder: "after_interleave";
}>;

export const DEFAULT_RECOMMENDATION_COMPOSITION_POLICY_ID =
  "tastkind.recommendation.dual_lane_interleave" as const;
export const DEFAULT_RECOMMENDATION_COMPOSITION_POLICY_VERSION = 1 as const;

export const DEFAULT_RECOMMENDATION_COMPOSITION_POLICY: RecommendationCompositionPolicy = Object.freeze({
  policyId: DEFAULT_RECOMMENDATION_COMPOSITION_POLICY_ID,
  policyVersion: DEFAULT_RECOMMENDATION_COMPOSITION_POLICY_VERSION,
  strategy: "alternating_dual_lane",
  laneA: Object.freeze({
    strategy: "nutrition_primary_tolerance_band",
    nutritionTolerance: 0.02,
    tasteApplication: "eligible_taste_slots_only"
  }),
  laneB: Object.freeze({
    strategy: "taste_forward_rank_composite",
    tasteRankWeight: 0.60,
    nutritionRankWeight: 0.40,
    rankUtility: "linear_zero_based"
  }),
  interleave: "odd_a_even_b",
  dedupeKey: "candidateId",
  laneFallback: "other_lane_then_nutrition_baseline",
  clippingOrder: "after_interleave"
});

export interface RecommendationCompositionPolicyProvider {
  getActiveRecommendationCompositionPolicy(): RecommendationCompositionPolicy;
}

export function createDefaultRecommendationCompositionPolicyProvider(): RecommendationCompositionPolicyProvider {
  return Object.freeze({
    getActiveRecommendationCompositionPolicy: () => DEFAULT_RECOMMENDATION_COMPOSITION_POLICY
  });
}

export function isRecommendationCompositionPolicy(value: unknown): value is RecommendationCompositionPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Partial<RecommendationCompositionPolicy>;
  return typeof policy.policyId === "string" && policy.policyId.length > 0
    && Number.isInteger(policy.policyVersion) && Number(policy.policyVersion) >= 1
    && policy.strategy === "alternating_dual_lane"
    && policy.laneA?.strategy === "nutrition_primary_tolerance_band"
    && policy.laneA.nutritionTolerance === 0.02
    && policy.laneA.tasteApplication === "eligible_taste_slots_only"
    && policy.laneB?.strategy === "taste_forward_rank_composite"
    && policy.laneB.tasteRankWeight === 0.60
    && policy.laneB.nutritionRankWeight === 0.40
    && policy.laneB.rankUtility === "linear_zero_based"
    && policy.interleave === "odd_a_even_b"
    && policy.dedupeKey === "candidateId"
    && policy.laneFallback === "other_lane_then_nutrition_baseline"
    && policy.clippingOrder === "after_interleave";
}
