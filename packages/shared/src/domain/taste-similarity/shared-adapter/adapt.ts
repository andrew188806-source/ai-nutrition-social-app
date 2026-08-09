import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import { TASTE_SIMILARITY_POLICY_VERSION, type TasteSimilarityResult } from "../similarity";
import { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION, type SocialContextDimensionResult } from "../compatibility";
import { GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION, type GoalCompatibilityResult } from "../goal-restriction";
import { TASTE_COMPARISON_BUNDLE_VERSION, type TasteComparisonBundle } from "../comparison";
import { EVIDENCE_CONFIDENCE_POLICY_VERSION, type EvidenceConfidenceBundle } from "../confidence";
import { COLD_START_POLICY_VERSION, type ColdStartAssessment } from "../cold-start";
import { SHARED_TASTE_ADAPTER_POLICY_VERSION, type SharedTasteAdapterUnsupportedReason } from "./policy";
import type {
  ProjectedEvidenceConfidence,
  ProjectedScoreResult,
  SharedTasteAdapterResult,
  SharedTasteAdapterVersions
} from "./types";

// TS-6 — shared taste comparison adapter.
//
// PROJECTION ONLY. Nothing in this file computes. There is no set similarity here, no mean, no
// coverage figure, no evidence-support arithmetic, no evidence-readiness classification and no
// eligibility verdict — every value it emits was produced by a frozen layer and is copied through
// byte-for-byte. No rounding, no normalisation, no clamping, no conversion to a display scale.
//
// PROJECTION, NOT PASS-THROUGH. The three frozen bundles are already privacy-safe, but returning
// them verbatim would make every downstream consumer depend on the foundation's internal layout.
// This layer exists so they do not: it publishes a minimal shape and leaves the internals — the
// comparator's own confidence inputs, its dimension arrays, its structural metadata — behind.
//
// CONSUMER-NEUTRAL. It answers "what safe derived facts are available", never "what should be done
// about them". There is no readiness field, no ordering field, no gate and no aggregate, because a
// caller who found one would reasonably treat it as an answer to a question this layer cannot
// answer. Restriction attention and limited evidence are projected as facts, never converted into an
// adjustment.
//
// FAIL CLOSED. Three independently produced inputs are accepted, so every authority they share is
// cross-checked first. Inputs that disagree describe different worlds, and the failure carries no
// component data at all rather than a partially populated payload someone could read past.

export function adaptSharedTasteComparison(
  comparison: TasteComparisonBundle,
  confidence: EvidenceConfidenceBundle,
  coldStart: ColdStartAssessment
): SharedTasteAdapterResult {
  const versions: SharedTasteAdapterVersions = {
    sharedAdapterPolicyVersion: SHARED_TASTE_ADAPTER_POLICY_VERSION,
    coldStartPolicyVersion: COLD_START_POLICY_VERSION,
    evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION,
    comparisonBundleVersion: TASTE_COMPARISON_BUNDLE_VERSION,
    tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
    socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
    goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
    snapshotSchemaVersion: TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION
  };

  const blocking = findBlockingReason(comparison, confidence, coldStart);
  if (blocking !== null) {
    return Object.freeze({ versions: Object.freeze(versions), status: "unsupported", reason: blocking });
  }

  return Object.freeze({
    versions: Object.freeze(versions),
    status: "adapted",
    taste: Object.freeze({
      similarity: projectTasteSimilarity(comparison.taste),
      evidenceConfidence: projectEvidenceConfidence(confidence),
      evidenceState: coldStart.tasteEvidence.state
    }),
    context: Object.freeze({
      mealPattern: projectDimension(comparison.socialContext.mealPatternCompatibility),
      dining: projectDimension(comparison.socialContext.diningCompatibility),
      socialLogistics: projectDimension(comparison.socialContext.socialLogisticsCompatibility)
    }),
    goal: projectGoal(comparison.goalRestriction.goalCompatibility),
    restriction: Object.freeze({
      verdict: comparison.goalRestriction.restrictionEligibility.verdict,
      basis: comparison.goalRestriction.restrictionEligibility.basis,
      evidencePresentForBoth: coldStart.restrictionState.evidencePresentForBoth,
      unclassifiedPresent: coldStart.restrictionState.unclassifiedPresent,
      sourceReachableForBoth: coldStart.restrictionState.sourceReachableForBoth
    }),
    signals: Object.freeze({
      // Copied, then frozen. Downstream never receives a reference that could mutate an upstream
      // array, and mutating the projection cannot reach back into the foundation.
      availableFamilies: Object.freeze([...coldStart.availableSignalFamilies]),
      incompleteFamilies: Object.freeze([...coldStart.incompleteSignalFamilies])
    }),
    reasons: Object.freeze({
      // Two channels, each preserving its own authority's order. No merge, no re-sort, no invented
      // entry: a code can only appear here because a frozen layer already emitted it.
      comparison: Object.freeze([...comparison.explanationReasonCodes]),
      evidence: Object.freeze([...coldStart.reasonCodes])
    })
  });
}

// Every authority the three inputs share is compared. A mismatch anywhere means they did not come
// from one coherent evaluation, and no part of the projection would be trustworthy.
function findBlockingReason(
  comparison: TasteComparisonBundle,
  confidence: EvidenceConfidenceBundle,
  coldStart: ColdStartAssessment
): SharedTasteAdapterUnsupportedReason | null {
  if (comparison.status !== "assembled") return "unsupported_snapshot_schema";
  if (coldStart.tasteEvidence.state === "unsupported") return "unsupported_snapshot_schema";

  const coherent =
    comparison.versions.snapshotSchemaVersion === confidence.versions.snapshotSchemaVersion &&
    comparison.versions.snapshotSchemaVersion === coldStart.versions.snapshotSchemaVersion &&
    comparison.versions.tastePolicyVersion === confidence.versions.tastePolicyVersion &&
    comparison.versions.tastePolicyVersion === coldStart.versions.tastePolicyVersion &&
    comparison.versions.socialContextPolicyVersion === confidence.versions.socialContextPolicyVersion &&
    comparison.versions.socialContextPolicyVersion === coldStart.versions.socialContextPolicyVersion &&
    comparison.versions.goalRestrictionPolicyVersion === confidence.versions.goalRestrictionPolicyVersion &&
    comparison.versions.goalRestrictionPolicyVersion === coldStart.versions.goalRestrictionPolicyVersion &&
    comparison.versions.bundleVersion === confidence.versions.comparisonBundleVersion &&
    comparison.versions.bundleVersion === coldStart.versions.comparisonBundleVersion &&
    confidence.versions.evidenceConfidencePolicyVersion === coldStart.versions.evidenceConfidencePolicyVersion;
  return coherent ? null : "policy_version_mismatch";
}

// The frozen taste result carries dimension arrays, overlap lists and its own confidence inputs.
// None of that crosses this boundary: the projection is the status, and the score exactly as it was.
function projectTasteSimilarity(taste: TasteSimilarityResult): ProjectedScoreResult {
  if (taste.status === "scored") return Object.freeze({ status: "scored", score: taste.score });
  return Object.freeze({ status: "not_scored", reason: taste.reason });
}

function projectDimension(dimension: SocialContextDimensionResult): ProjectedScoreResult {
  if (dimension.status === "scored") return Object.freeze({ status: "scored", score: dimension.score });
  return Object.freeze({ status: "not_scored", reason: dimension.reason });
}

// Goal labels and every macro target stay behind this boundary. Only the comparability outcome and
// its exact value cross it.
function projectGoal(goal: GoalCompatibilityResult): ProjectedScoreResult {
  if (goal.status === "scored") return Object.freeze({ status: "scored", score: goal.score });
  return Object.freeze({ status: "not_scored", reason: goal.reason });
}

function projectEvidenceConfidence(confidence: EvidenceConfidenceBundle): ProjectedEvidenceConfidence {
  const taste = confidence.taste;
  if (taste.status === "available") {
    return Object.freeze({ status: "available", value: taste.value, basis: taste.basis });
  }
  return Object.freeze({ status: "not_available", reason: taste.reason });
}
