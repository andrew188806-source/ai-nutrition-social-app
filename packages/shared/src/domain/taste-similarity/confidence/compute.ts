import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import { TASTE_SIMILARITY_POLICY_VERSION, type TasteSimilarityDimension } from "../similarity";
import { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION } from "../compatibility";
import { GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION } from "../goal-restriction";
import { TASTE_COMPARISON_BUNDLE_VERSION, type TasteComparisonBundle } from "../comparison";
import {
  EVIDENCE_CONFIDENCE_POLICY_VERSION,
  TASTE_CONFIDENCE_DIMENSION_FAMILIES,
  TASTE_CONFIDENCE_EXPLICIT_FAMILIES,
  TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT,
  TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT,
  TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT,
  roundEvidenceConfidenceValue
} from "./policy";
import type {
  EvidenceConfidenceBasis,
  EvidenceConfidenceBundle,
  EvidenceConfidenceUnavailableReason,
  EvidenceStateResult,
  RestrictionEvidenceState,
  TasteEvidenceConfidenceResult,
  TasteEvidenceSupportInputs
} from "./types";

// TS-4 — evidence confidence computation.
//
// WHAT THIS MEASURES: how much usable and complete evidence supports treating the observed result as
// meaningful. Not how often it would turn out correct. Not a match figure. Not a safety assurance.
//
// THE ONE INVARIANT THAT MATTERS MOST: this file never reads a `.score`. Support and agreement are
// different questions, and two pairs with identical evidence structure must receive identical
// confidence whether they agreed completely or not at all. Because no score is reachable from here,
// that is not a rule to remember — it is a rule that cannot be broken without changing this file.
//
// INPUT DISCIPLINE: the only input is the frozen `taste-comparison-bundle-v1`. TS-3E is the canonical
// assembly boundary, so nothing here recomputes a comparator, reaches past the bundle into a
// snapshot, or inspects a single evidence value. Only structural metadata is read: dimension
// identifiers, statuses, source-reachability booleans and truncation booleans.
//
// THE FORMULA, in full:
//
//   dimensionCoverage  = comparableTasteFamilyCount / 5
//   sourceCompleteness = completeRelevantSourceCount / 3
//   value              = round6((dimensionCoverage + sourceCompleteness) / 2)
//
// Both denominators are structural counts derived from frozen contracts, not tuned parameters, and
// the unweighted mean is the same neutrality argument the score policies already froze. There is no
// raw evidence count anywhere: counting FAMILIES rather than items is what makes saturation
// structural — twenty visits to one restaurant is still one comparable family — so no threshold,
// cap, log or decay constant is needed or present.
//
// DELIBERATELY ABSENT: source-recognition quality, any timestamp, any freshness or decay term, any
// evidence-strength weight, any rescaling of the reachable floor, and any aggregate across
// dimensions.

export function calculateEvidenceConfidence(bundle: TasteComparisonBundle): EvidenceConfidenceBundle {
  const schemaSupported = bundle.status === "assembled";

  return {
    versions: {
      evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION,
      snapshotSchemaVersion: TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION,
      tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
      socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
      goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
      comparisonBundleVersion: TASTE_COMPARISON_BUNDLE_VERSION
    },
    taste: computeTasteEvidenceConfidence(bundle, schemaSupported),
    mealPattern: mapEvidenceState(bundle.socialContext.mealPatternCompatibility.status, schemaSupported),
    dining: mapEvidenceState(bundle.socialContext.diningCompatibility.status, schemaSupported),
    socialLogistics: mapEvidenceState(bundle.socialContext.socialLogisticsCompatibility.status, schemaSupported),
    goal: mapEvidenceState(bundle.goalRestriction.goalCompatibility.status, schemaSupported),
    restrictionEvidence: collectRestrictionEvidenceState(bundle)
  };
}

function computeTasteEvidenceConfidence(
  bundle: TasteComparisonBundle,
  schemaSupported: boolean
): TasteEvidenceConfidenceResult {
  if (!schemaSupported) return { status: "not_available", reason: "unsupported_snapshot_schema" };
  // Numeric evidence confidence exists only where there is a comparable result to support. An
  // unscored component reports a STATUS, never the number zero.
  if (bundle.taste.status !== "scored") return { status: "not_available", reason: "component_not_scored" };

  const families = collectComparableFamilies(bundle.taste.comparableDimensions);
  const relevantSources = collectRelevantSourceCompleteness(bundle);
  const inputs: TasteEvidenceSupportInputs = {
    comparableFamilyCount: families.size,
    supportedFamilyCount: TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT,
    completeRelevantSourceCount: relevantSources.completeCount,
    relevantSourceCount: TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT
  };

  const dimensionCoverage = inputs.comparableFamilyCount / inputs.supportedFamilyCount;
  const sourceCompleteness = inputs.completeRelevantSourceCount / inputs.relevantSourceCount;
  const value = roundEvidenceConfidenceValue((dimensionCoverage + sourceCompleteness) / 2);

  return { status: "available", value, basis: selectBasis(families, relevantSources), inputs };
}

// Maps each comparable dimension onto its identity FAMILY and counts the distinct families. A
// comparable favorite and its suppressed repeated-meal counterpart are the same family and are
// counted once — the frozen suppression rule already makes them mutually exclusive, and this keeps
// that true by construction rather than by coincidence.
function collectComparableFamilies(
  comparableDimensions: readonly TasteSimilarityDimension[]
): ReadonlySet<string> {
  const families = new Set<string>();
  for (const dimension of comparableDimensions) {
    const family = TASTE_CONFIDENCE_DIMENSION_FAMILIES[dimension];
    if (family !== undefined) families.add(family);
  }
  return families;
}

type RelevantSourceCompleteness = {
  completeCount: number;
  anySourceUnreachable: boolean;
  anyRelevantWindowTruncated: boolean;
};

// A relevant source is COMPLETE when it is reachable for both users and, if it carries an evidence
// window, that window is not truncated.
//
// Reachability keys on the source STATE, never on an evidence count: `empty` means the source
// answered and the user genuinely has nothing, which is complete knowledge, while `failed` means we
// do not know what exists — and a failed source can still carry partial rows, so counting rows would
// silently turn "unknown" into "complete".
//
// `taste_profile` has no evidence window, so reachability is the whole test for it. Ratings are
// absent entirely: no frozen scorer reads them, so an incomplete ratings window says nothing about
// support for a taste result.
function collectRelevantSourceCompleteness(bundle: TasteComparisonBundle): RelevantSourceCompleteness {
  const availability = bundle.confidenceInputs.sourceAvailability;
  const history = bundle.confidenceInputs.historyCompleteness;

  const sources = [
    { reachable: availability.tasteProfileAvailableForBoth, truncated: false },
    { reachable: availability.favoritesAvailableForBoth, truncated: history.favoritesTruncatedForEither },
    { reachable: availability.mealsAvailableForBoth, truncated: history.mealsTruncatedForEither }
  ];

  let completeCount = 0;
  let anySourceUnreachable = false;
  let anyRelevantWindowTruncated = false;
  for (const source of sources) {
    if (!source.reachable) {
      anySourceUnreachable = true;
      continue;
    }
    if (source.truncated) {
      anyRelevantWindowTruncated = true;
      continue;
    }
    completeCount += 1;
  }
  return { completeCount, anySourceUnreachable, anyRelevantWindowTruncated };
}

// Explanatory only. Evaluated in the policy's fixed precedence order, first match wins, and it never
// touches the value — the value is already computed before this runs.
function selectBasis(
  families: ReadonlySet<string>,
  relevantSources: RelevantSourceCompleteness
): EvidenceConfidenceBasis {
  if (relevantSources.anySourceUnreachable) return "source_unavailable";
  if (relevantSources.anyRelevantWindowTruncated) return "incomplete_history";
  if (families.size <= TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT) return "limited_evidence_coverage";
  const explicit = [...families].some((family) => TASTE_CONFIDENCE_EXPLICIT_FAMILIES.includes(family));
  const behavioral = [...families].some((family) => !TASTE_CONFIDENCE_EXPLICIT_FAMILIES.includes(family));
  if (explicit && behavioral) return "strong_explicit_and_behavioral_evidence";
  if (explicit) return "explicit_evidence_only";
  return "behavioral_evidence_only";
}

// Non-numeric state for the four single-facet dimensions. A scored component means both users
// supplied the only evidence that can exist for it, which is reported as a status and a basis and
// deliberately not as a number.
function mapEvidenceState(componentStatus: string, schemaSupported: boolean): EvidenceStateResult {
  if (!schemaSupported) return { status: "not_available", reason: "unsupported_snapshot_schema" };
  if (componentStatus !== "scored") return { status: "not_available", reason: mapUnavailableReason() };
  return { status: "available", basis: "explicit_evidence_only" };
}

function mapUnavailableReason(): EvidenceConfidenceUnavailableReason {
  return "component_not_scored";
}

// Built only from the safe structural metadata the frozen bundle already publishes. No restriction
// row, label, type or severity is ever reached, and no numeric field is produced.
function collectRestrictionEvidenceState(bundle: TasteComparisonBundle): RestrictionEvidenceState {
  return {
    evidencePresentForBoth: bundle.confidenceInputs.dimensionAvailability.restrictionEvidenceComparable,
    unclassifiedPresent: bundle.goalRestriction.confidenceInputs.restriction.unclassifiedRestrictionPresent,
    sourceReachableForBoth: bundle.confidenceInputs.sourceAvailability.dietaryRestrictionsAvailableForBoth
  };
}
