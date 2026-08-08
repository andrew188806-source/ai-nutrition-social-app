import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { TASTE_SIMILARITY_POLICY_VERSION, TasteSimilarityReasonCode, TasteSimilarityResult } from "../similarity";
import type {
  SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  SocialContextCompatibilityReasonCode,
  SocialContextCompatibilityResult
} from "../compatibility";
import type {
  GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  GoalRestrictionCompatibilityResult,
  GoalRestrictionReasonCode,
  RestrictionEligibilityVerdict
} from "../goal-restriction";
import type { TASTE_COMPARISON_BUNDLE_VERSION } from "./policy";

// TS-3E — the canonical comparison bundle contract.
//
// The unified reason-code vocabulary is the UNION of the three frozen vocabularies, not a new one.
// Re-using them rather than restating them is what keeps the bundle from quietly becoming a fourth
// source of meaning: a code can only exist here because a frozen component already defined it.
export type TasteComparisonReasonCode =
  | TasteSimilarityReasonCode
  | SocialContextCompatibilityReasonCode
  | GoalRestrictionReasonCode;

// Every authority that shaped this result, stated explicitly. All five are typed against the frozen
// exported constants, so a component bump changes this type rather than silently passing through.
export type TasteComparisonVersions = {
  bundleVersion: typeof TASTE_COMPARISON_BUNDLE_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  tastePolicyVersion: typeof TASTE_SIMILARITY_POLICY_VERSION;
  socialContextPolicyVersion: typeof SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION;
  goalRestrictionPolicyVersion: typeof GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION;
};

export type TasteComparisonDimensionState = "scored" | "not_scored";

// Unified, still entirely NON-NUMERIC-CONFIDENCE inputs. Counts, booleans and states only — the raw
// material TS-4 will need, with none of the judgement TS-4 owns. There is deliberately no
// `confidence` field and no qualitative high/medium/low band.
export type TasteComparisonConfidenceInputs = {
  evidenceCoverage: {
    totalEvidenceCount: number;
    explicitEvidenceCount: number;
    behavioralEvidenceCount: number;
    comparableDimensionCount: number;
    unknownDimensionCount: number;
  };
  sourceAvailability: {
    tasteProfileAvailableForBoth: boolean;
    nutritionGoalsAvailableForBoth: boolean;
    dietaryRestrictionsAvailableForBoth: boolean;
    mealsAvailableForBoth: boolean;
    favoritesAvailableForBoth: boolean;
    ratingsAvailableForBoth: boolean;
  };
  historyCompleteness: {
    historyScopeBoundedForBoth: boolean;
    mealsTruncatedForEither: boolean;
    favoritesTruncatedForEither: boolean;
    ratingsTruncatedForEither: boolean;
  };
  // Which independent dimensions actually produced a value. Reported side by side and never summed:
  // "taste scored, logistics not scored" is two facts, not a fraction.
  dimensionAvailability: {
    taste: TasteComparisonDimensionState;
    mealPattern: TasteComparisonDimensionState;
    dining: TasteComparisonDimensionState;
    socialLogistics: TasteComparisonDimensionState;
    goal: TasteComparisonDimensionState;
    restrictionVerdict: RestrictionEligibilityVerdict;
    restrictionEvidenceComparable: boolean;
  };
};

// `assembled` versus `unsupported_snapshot_schema` is the bundle-level discriminator. Each component
// already fails closed on its own, but a caller must not have to inspect three sub-results to learn
// that the input was never interpretable in the first place.
export type TasteComparisonBundleStatus = "assembled" | "unsupported_snapshot_schema";

// The three component results are carried VERBATIM. They are not rewritten, re-keyed, normalised or
// combined — there is deliberately no `overallSimilarity`, no `overallCompatibility`, no
// `matchScore`, no `rankScore` and no weighted average of any kind. Deciding what a 0.9 taste score
// and a 0 payment-preference score mean together is consumer policy, and this bundle exists
// precisely so that decision has somewhere honest to start from.
export type TasteComparisonBundle = {
  versions: TasteComparisonVersions;
  status: TasteComparisonBundleStatus;
  taste: TasteSimilarityResult;
  socialContext: SocialContextCompatibilityResult;
  goalRestriction: GoalRestrictionCompatibilityResult;
  confidenceInputs: TasteComparisonConfidenceInputs;
  explanationReasonCodes: readonly TasteComparisonReasonCode[];
};
