import type { TasteProfileSnapshot } from "../snapshot";
import { TASTE_SIMILARITY_POLICY_VERSION, compareTasteSimilarity } from "../similarity";
import { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION, compareSocialContextCompatibility } from "../compatibility";
import { GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION, compareGoalRestrictionCompatibility } from "../goal-restriction";
import { TASTE_COMPARISON_BUNDLE_VERSION, TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION } from "./policy";
import type {
  TasteComparisonBundle,
  TasteComparisonConfidenceInputs,
  TasteComparisonReasonCode
} from "./types";

// TS-3E — canonical comparison bundle assembly.
//
// COMPOSITION ONLY. This file computes nothing. It calls the three frozen comparators, carries their
// results verbatim, unifies the metadata they and the snapshot already expose, and merges their
// already-ordered reason codes. There is no Jaccard here, no cuisine rule, no favorite rule, no
// repeated-meal rule, no dining equality, no goal-label rule and no restriction classification —
// every one of those lives in exactly one frozen module and is reached only by calling it.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//
//   * No aggregate. `taste = 0.9` and `payment = 0` stay two facts. Nothing here decides they average
//     to 0.45, because no evidence in this repository says how to trade one against the other.
//   * No numeric confidence, and no qualitative band standing in for one. TS-4 owns that.
//   * No cold-start fallback, no ranking, no threshold, no gating. A sparse bundle is reported as
//     sparse and handed on intact.
//   * No penalty. `restrictionEligibility.verdict === "needs_attention"` stays a separate safety
//     signal and never touches a score.
//
// PARTIAL AVAILABILITY IS NORMAL. One component being unscorable never invalidates the others — only
// an uninterpretable snapshot schema fails the bundle, and it does so explicitly at bundle level.
//
// SYMMETRY IS STRUCTURAL. Each frozen comparator is already symmetric, and every value this file
// derives itself is combined with a COMMUTATIVE operator (`+`, `&&`, `||`), so argument order cannot
// reach the output. No pair ordering is needed, and no subject id is read or exposed.

export function compareTasteProfiles(
  snapshotA: TasteProfileSnapshot,
  snapshotB: TasteProfileSnapshot
): TasteComparisonBundle {
  const taste = compareTasteSimilarity(snapshotA, snapshotB);
  const socialContext = compareSocialContextCompatibility(snapshotA, snapshotB);
  const goalRestriction = compareGoalRestrictionCompatibility(snapshotA, snapshotB);

  const schemaSupported =
    snapshotA.schemaVersion === TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION &&
    snapshotB.schemaVersion === TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION;

  return {
    versions: {
      bundleVersion: TASTE_COMPARISON_BUNDLE_VERSION,
      snapshotSchemaVersion: TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
      tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
      socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
      goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION
    },
    status: schemaSupported ? "assembled" : "unsupported_snapshot_schema",
    taste,
    socialContext,
    goalRestriction,
    confidenceInputs: assembleConfidenceInputs(snapshotA, snapshotB, taste, socialContext, goalRestriction),
    explanationReasonCodes: assembleReasonCodes(taste, socialContext, goalRestriction)
  };
}

// Merge order is the fixed component order: taste, then social context, then goal and restriction.
// Within each component the frozen ordering authority has ALREADY applied that component's own
// declaration rank, so no sort is applied here — sorting would destroy the ordering each component
// deliberately chose. Deduplication is structural via a Set, which also preserves first-seen order.
function assembleReasonCodes(
  taste: TasteComparisonComponentWithReasons,
  socialContext: TasteComparisonComponentWithReasons,
  goalRestriction: TasteComparisonComponentWithReasons
): readonly TasteComparisonReasonCode[] {
  const merged: TasteComparisonReasonCode[] = [
    ...taste.explanationReasonCodes,
    ...socialContext.explanationReasonCodes,
    ...goalRestriction.explanationReasonCodes
  ];
  return Object.freeze([...new Set(merged)]);
}

type TasteComparisonComponentWithReasons = {
  explanationReasonCodes: readonly TasteComparisonReasonCode[];
};

// Unifies metadata the components and the snapshot already publish. Nothing here is derived from raw
// evidence: every input is a count, a boolean or a state that some frozen authority already decided.
function assembleConfidenceInputs(
  snapshotA: TasteProfileSnapshot,
  snapshotB: TasteProfileSnapshot,
  taste: ReturnType<typeof compareTasteSimilarity>,
  socialContext: ReturnType<typeof compareSocialContextCompatibility>,
  goalRestriction: ReturnType<typeof compareGoalRestrictionCompatibility>
): TasteComparisonConfidenceInputs {
  const sourceAvailableForBoth = (name: TasteProfileSourceKey): boolean =>
    isReachable(snapshotA, name) && isReachable(snapshotB, name);
  const truncatedForEither = (name: "meals" | "favorites" | "ratings"): boolean =>
    snapshotA.evidenceWindow[name].truncation !== "not_truncated" ||
    snapshotB.evidenceWindow[name].truncation !== "not_truncated";

  const contextComparableCount = [
    socialContext.mealPatternCompatibility,
    socialContext.diningCompatibility,
    socialContext.socialLogisticsCompatibility
  ].filter((entry) => entry.status === "scored").length;
  const goalComparableCount = goalRestriction.goalCompatibility.status === "scored" ? 1 : 0;

  return {
    evidenceCoverage: {
      totalEvidenceCount:
        snapshotA.confidenceMetadata.evidenceCounts.total + snapshotB.confidenceMetadata.evidenceCounts.total,
      explicitEvidenceCount:
        taste.confidenceInputs.explicitEvidenceCount + socialContext.confidenceInputs.explicitEvidenceCount,
      behavioralEvidenceCount: taste.confidenceInputs.behavioralEvidenceCount,
      comparableDimensionCount:
        taste.confidenceInputs.comparableDimensionCount + contextComparableCount + goalComparableCount,
      unknownDimensionCount:
        taste.confidenceInputs.unknownDimensionCount +
        socialContext.confidenceInputs.unknownDimensionCount +
        (goalComparableCount === 0 ? 1 : 0)
    },
    sourceAvailability: {
      tasteProfileAvailableForBoth: sourceAvailableForBoth("taste_profile"),
      nutritionGoalsAvailableForBoth: sourceAvailableForBoth("nutrition_goals"),
      dietaryRestrictionsAvailableForBoth: sourceAvailableForBoth("dietary_restrictions"),
      mealsAvailableForBoth: sourceAvailableForBoth("meals"),
      favoritesAvailableForBoth: sourceAvailableForBoth("favorites"),
      ratingsAvailableForBoth: sourceAvailableForBoth("ratings")
    },
    historyCompleteness: {
      historyScopeBoundedForBoth:
        snapshotA.evidenceWindow.historyScope === "bounded" && snapshotB.evidenceWindow.historyScope === "bounded",
      mealsTruncatedForEither: truncatedForEither("meals"),
      favoritesTruncatedForEither: truncatedForEither("favorites"),
      ratingsTruncatedForEither: truncatedForEither("ratings")
    },
    dimensionAvailability: {
      taste: taste.status === "scored" ? "scored" : "not_scored",
      mealPattern: socialContext.mealPatternCompatibility.status === "scored" ? "scored" : "not_scored",
      dining: socialContext.diningCompatibility.status === "scored" ? "scored" : "not_scored",
      socialLogistics: socialContext.socialLogisticsCompatibility.status === "scored" ? "scored" : "not_scored",
      goal: goalRestriction.goalCompatibility.status === "scored" ? "scored" : "not_scored",
      restrictionVerdict: goalRestriction.restrictionEligibility.verdict,
      restrictionEvidenceComparable: goalRestriction.restrictionEligibility.comparableRestrictionEvidence
    }
  };
}

type TasteProfileSourceKey = keyof TasteProfileSnapshot["sourceStates"];

// "Reachable" means the source answered — with rows or with nothing. A disabled, unauthenticated,
// failed or deferred source did not, and that difference is exactly what a later confidence policy
// needs to see.
function isReachable(snapshot: TasteProfileSnapshot, name: TasteProfileSourceKey): boolean {
  const status = snapshot.sourceStates[name].status;
  return status === "available" || status === "empty";
}
