import type { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION } from "./policy";
import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { SocialContextCompatibilityReasonCode } from "./reasonCodes";

// TS-3C — the social context compatibility result contract.
//
// The three dimensions map ONE-TO-ONE onto the three non-food preference scopes TS-1 defines. The
// mapping is total and exclusive: `meal_pattern` reaches only `mealPatternCompatibility`,
// `dining_context` only `diningCompatibility`, `social_logistics` only `socialLogisticsCompatibility`,
// and `food_taste` reaches none of them.
export const SOCIAL_CONTEXT_COMPATIBILITY_DIMENSIONS = [
  "meal_pattern",
  "dining_context",
  "social_logistics"
] as const;

export type SocialContextCompatibilityDimension =
  (typeof SOCIAL_CONTEXT_COMPATIBILITY_DIMENSIONS)[number];

export type SocialContextNotScoredReason =
  // Neither user supplied evidence for this dimension.
  | "no_comparable_evidence"
  // Exactly one side supplied evidence. One-sided evidence can never produce agreement and must not
  // be reported as disagreement either.
  | "insufficient_evidence"
  // The snapshot pair does not carry the schema version this policy understands.
  | "unsupported_snapshot_schema";

// How the dimension was compared. Determined by the FROZEN evidence cardinality, not by preference:
// `preferred_meal_types` is an array column and therefore a set, while `dining_style` and
// `payment_preference` are single nullable scalars and therefore singleton categories.
export type SocialContextComparisonMode = "set_overlap" | "categorical_equality";

type SocialContextDimensionResultBase = {
  dimension: SocialContextCompatibilityDimension;
  comparisonMode: SocialContextComparisonMode;
};

// `score` exists ONLY on the scored variant. It is not optional-and-undefined on a shared shape, so
// "not scored" can never be misread as 0 compatibility.
export type ScoredSocialContextDimensionResult = SocialContextDimensionResultBase & {
  status: "scored";
  score: number;
};

export type NotScoredSocialContextDimensionResult = SocialContextDimensionResultBase & {
  status: "not_scored";
  reason: SocialContextNotScoredReason;
};

export type SocialContextDimensionResult =
  | ScoredSocialContextDimensionResult
  | NotScoredSocialContextDimensionResult;

// Sparse-evidence inputs. Deliberately NOT a numeric confidence — TS-4 owns that. These are raw
// counts and availability facts a later policy can turn into a confidence value without this
// contract having pre-judged how.
export type SocialContextConfidenceInputs = {
  comparableDimensionCount: number;
  unknownDimensionCount: number;
  explicitEvidenceCount: number;
  evidenceCountsByDimension: {
    meal_pattern: number;
    dining_context: number;
    social_logistics: number;
  };
  sourceAvailability: {
    tasteProfileAvailableForBoth: boolean;
  };
};

// The three dimensions are reported SIDE BY SIDE. There is deliberately no `overallSocialCompatibility`
// and no aggregate of any kind: collapsing them would bake a trade-off between "we eat at the same
// times" and "we split the bill the same way" into the domain, and that trade-off is a product
// decision no evidence in this repository supports.
export type SocialContextCompatibilityResult = {
  policyVersion: typeof SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  mealPatternCompatibility: SocialContextDimensionResult;
  diningCompatibility: SocialContextDimensionResult;
  socialLogisticsCompatibility: SocialContextDimensionResult;
  confidenceInputs: SocialContextConfidenceInputs;
  explanationReasonCodes: readonly SocialContextCompatibilityReasonCode[];
};
