import {
  CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS,
  type ConsumerNextMealNutritionDimension,
  type NutritionRankingDimensionPolicy,
  type NutritionRankingPolicy
} from "./types";

/**
 * REC-A nutrition ranking policy boundary.
 *
 * WHY THIS EXISTS. Equal contribution across five nutrients is DEFAULT POLICY V1, not product law.
 * The ranker consumes a policy contract rather than embedding a formula, so a later TastKind
 * backend or admin surface can select or version policies — and qualified nutritionists can manage
 * them — without changing Mobile code. Mobile owns no canonical formula authority: it owns only the
 * fallback used when no policy has been supplied.
 *
 * WHAT IS DELIBERATELY NOT HERE. No admin UI, no policy store, no multi-tenant resolution and no
 * remote fetch. Those belong to the future backend that attaches to this seam. This round ships the
 * contract, one default policy, and validation strict enough that an unusable supplied policy can
 * never silently corrupt ranking.
 */
export const DEFAULT_NUTRITION_RANKING_POLICY_ID = "tastkind.nutrition.balanced_gap" as const;
export const DEFAULT_NUTRITION_RANKING_POLICY_VERSION = 1 as const;

export const DEFAULT_NUTRITION_RANKING_POLICY: NutritionRankingPolicy = Object.freeze({
  policyId: DEFAULT_NUTRITION_RANKING_POLICY_ID,
  policyVersion: DEFAULT_NUTRITION_RANKING_POLICY_VERSION,
  // The only strategy implemented this round: score against the remaining daily gap. A future
  // policy may allocate a per-meal share of the daily target instead; the field exists so that
  // change is a policy value rather than a Mobile code change.
  targetStrategy: "remaining_daily_gap",
  dimensions: Object.freeze(
    CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS.map((dimension) =>
      Object.freeze({ dimension, weight: 1, overagePenaltyWeight: 1 })
    )
  )
});

export interface NutritionRankingPolicyProvider {
  getActiveNutritionRankingPolicy(): NutritionRankingPolicy;
}

/**
 * The attachment point for a future backend-supplied policy. Today it answers with the default;
 * swapping in a remote-backed provider changes no ranker and no adapter code.
 */
export function createDefaultNutritionRankingPolicyProvider(): NutritionRankingPolicyProvider {
  return Object.freeze({
    getActiveNutritionRankingPolicy: () => DEFAULT_NUTRITION_RANKING_POLICY
  });
}

/**
 * A policy that arrives from outside this module is untrusted input. A weight that is negative,
 * non-finite or zero across the board would silently produce meaningless ordering, so an invalid
 * policy is rejected here rather than half-applied downstream.
 */
export function isNutritionRankingPolicy(value: unknown): value is NutritionRankingPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Partial<NutritionRankingPolicy>;
  if (typeof policy.policyId !== "string" || policy.policyId.length === 0) return false;
  if (!Number.isInteger(policy.policyVersion) || (policy.policyVersion as number) < 1) return false;
  if (policy.targetStrategy !== "remaining_daily_gap") return false;
  if (!Array.isArray(policy.dimensions) || policy.dimensions.length === 0) return false;

  const seen = new Set<string>();
  for (const entry of policy.dimensions as readonly NutritionRankingDimensionPolicy[]) {
    if (!entry || typeof entry !== "object") return false;
    if (!CONSUMER_NEXT_MEAL_NUTRITION_DIMENSIONS.includes(
      entry.dimension as ConsumerNextMealNutritionDimension
    )) return false;
    if (seen.has(entry.dimension)) return false;
    seen.add(entry.dimension);
    if (typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight <= 0) return false;
    if (typeof entry.overagePenaltyWeight !== "number"
      || !Number.isFinite(entry.overagePenaltyWeight) || entry.overagePenaltyWeight < 0) return false;
  }
  return true;
}

/**
 * Resolves the policy actually applied to a ranking pass. An absent or invalid candidate degrades to
 * the default rather than disabling ranking, so a bad policy can never make the product less useful
 * than it is today.
 */
export function resolveNutritionRankingPolicy(candidate: unknown): NutritionRankingPolicy {
  return isNutritionRankingPolicy(candidate) ? candidate : DEFAULT_NUTRITION_RANKING_POLICY;
}
