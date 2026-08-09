import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import { TASTE_SIMILARITY_POLICY_VERSION } from "../similarity";
import { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION } from "../compatibility";
import { GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION } from "../goal-restriction";
import { TASTE_COMPARISON_BUNDLE_VERSION, type TasteComparisonBundle } from "../comparison";
import { EVIDENCE_CONFIDENCE_POLICY_VERSION, type EvidenceConfidenceBundle } from "../confidence";
import {
  COLD_START_DEGRADED_SOURCE_BASES,
  COLD_START_LIMITED_COVERAGE_BASIS,
  COLD_START_POLICY_VERSION,
  orderColdStartReasonCodes,
  type ColdStartReasonCodeName
} from "./policy";
import type {
  ColdStartAssessment,
  ColdStartRestrictionState,
  ColdStartSignalFamily,
  ColdStartTasteEvidence
} from "./types";

// TS-5 — cold start evidence assessment.
//
// WHAT THIS PRODUCES: a structural description of how ready the evidence was, and why a comparison
// was limited. Nothing here is a verdict. There is no boolean, no readiness field, no aggregate and
// no recommendation — whether a pair should be shown, hidden, ranked or acted on is consumer policy
// living well above this layer.
//
// WHAT THIS NEVER READS: any `.score`. Two pairs with identical evidence structure and opposite
// similarity must produce byte-identical assessments, and because no score is reachable from here
// that is a property of the file rather than a rule to remember.
//
// WHAT THIS NEVER COMPARES: the frozen evidence-support number. It is carried through untouched on
// the comparable variant and never tested against a constant. Every classification below is derived
// from categorical structure — component status, source reachability, truncation, inherited basis —
// so this policy contains no threshold and no tuned value of any kind.
//
// THE DISTINCTION THAT MATTERS MOST: a source that answered with nothing (`empty`) establishes real
// absence; a source that failed, is disabled, unauthenticated or deferred establishes nothing at all.
// The frozen bundles already collapse those six states into the correct reachability predicate, so
// this file inherits it rather than re-deriving it — and it never infers reachability from a count.

export function assessColdStart(
  comparison: TasteComparisonBundle,
  confidence: EvidenceConfidenceBundle
): ColdStartAssessment {
  const versions = {
    coldStartPolicyVersion: COLD_START_POLICY_VERSION,
    evidenceConfidencePolicyVersion: EVIDENCE_CONFIDENCE_POLICY_VERSION,
    comparisonBundleVersion: TASTE_COMPARISON_BUNDLE_VERSION,
    tastePolicyVersion: TASTE_SIMILARITY_POLICY_VERSION,
    socialContextPolicyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
    goalRestrictionPolicyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
    snapshotSchemaVersion: TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION
  };

  const restrictionState = collectRestrictionState(comparison, confidence);

  // Two independently produced bundles are accepted, so the authorities they overlap on are
  // cross-checked before anything else. A mismatch means the two describe different worlds, and no
  // partial assessment of a mismatched pair could be trusted.
  if (!interpretable(comparison, confidence)) {
    return {
      versions,
      tasteEvidence: { state: "unsupported" },
      availableSignalFamilies: freezeFamilies([]),
      incompleteSignalFamilies: freezeFamilies([]),
      restrictionState,
      reasonCodes: orderColdStartReasonCodes(["unsupported_schema"])
    };
  }

  const availability = comparison.confidenceInputs.sourceAvailability;
  const history = comparison.confidenceInputs.historyCompleteness;
  const dimensions = comparison.confidenceInputs.dimensionAvailability;

  // Ratings are absent from every list below: no frozen scorer reads them, so neither their
  // reachability nor their truncation says anything about evidence readiness.
  const tasteSourcesReachable =
    availability.tasteProfileAvailableForBoth &&
    availability.favoritesAvailableForBoth &&
    availability.mealsAvailableForBoth;
  const tasteHistoryComplete = !history.favoritesTruncatedForEither && !history.mealsTruncatedForEither;
  const tasteSourcesComplete = tasteSourcesReachable && tasteHistoryComplete;

  const tasteEvidence = classifyTasteEvidence(comparison, confidence, tasteSourcesComplete);

  const availableSignalFamilies: ColdStartSignalFamily[] = [];
  if (dimensions.taste === "scored") availableSignalFamilies.push("taste");
  if (dimensions.mealPattern === "scored") availableSignalFamilies.push("meal_pattern");
  if (dimensions.dining === "scored") availableSignalFamilies.push("dining");
  if (dimensions.socialLogistics === "scored") availableSignalFamilies.push("social_logistics");
  if (dimensions.goal === "scored") availableSignalFamilies.push("goal");
  // Restriction always yields a categorical verdict, but `unknown` means the eligibility question
  // could not be answered, so only a determinate verdict counts as usable information.
  if (restrictionState.verdict !== "unknown") availableSignalFamilies.push("restriction");

  // A family belongs here when its supporting sources are degraded — INDEPENDENTLY of whether it
  // produced a result. Overlap with the available list is intentional and meaningful.
  const incompleteSignalFamilies: ColdStartSignalFamily[] = [];
  if (!tasteSourcesComplete) incompleteSignalFamilies.push("taste");
  if (!availability.tasteProfileAvailableForBoth) {
    incompleteSignalFamilies.push("meal_pattern", "dining", "social_logistics");
  }
  if (!availability.nutritionGoalsAvailableForBoth) incompleteSignalFamilies.push("goal");
  if (!availability.dietaryRestrictionsAvailableForBoth) incompleteSignalFamilies.push("restriction");

  return {
    versions,
    tasteEvidence,
    availableSignalFamilies: freezeFamilies(availableSignalFamilies),
    incompleteSignalFamilies: freezeFamilies(incompleteSignalFamilies),
    restrictionState,
    reasonCodes: collectReasonCodes(tasteEvidence, availableSignalFamilies, tasteSourcesReachable, tasteHistoryComplete)
  };
}

// Both bundles must report an interpretable snapshot AND agree on every authority they share. The
// confidence bundle additionally reports its own view of the taste component, so an incoherent pair
// — a scored comparison against an unavailable confidence — is treated as uninterpretable too.
function interpretable(comparison: TasteComparisonBundle, confidence: EvidenceConfidenceBundle): boolean {
  if (comparison.status !== "assembled") return false;
  const shared =
    comparison.versions.snapshotSchemaVersion === confidence.versions.snapshotSchemaVersion &&
    comparison.versions.tastePolicyVersion === confidence.versions.tastePolicyVersion &&
    comparison.versions.socialContextPolicyVersion === confidence.versions.socialContextPolicyVersion &&
    comparison.versions.goalRestrictionPolicyVersion === confidence.versions.goalRestrictionPolicyVersion &&
    comparison.versions.bundleVersion === confidence.versions.comparisonBundleVersion;
  if (!shared) return false;
  // Named for the component STATUS rather than anything score-shaped: nothing in this file reads or
  // holds a score, and the identifier should not suggest otherwise.
  const tasteComponentComparable = comparison.confidenceInputs.dimensionAvailability.taste === "scored";
  return tasteComponentComparable === (confidence.taste.status === "available");
}

// A scored taste component stays `comparable` even when its sources are patchy — the degradation is
// reported through the family lists and the inherited basis, not by discarding the result.
function classifyTasteEvidence(
  comparison: TasteComparisonBundle,
  confidence: EvidenceConfidenceBundle,
  tasteSourcesComplete: boolean
): ColdStartTasteEvidence {
  if (comparison.confidenceInputs.dimensionAvailability.taste === "scored") {
    if (confidence.taste.status !== "available") return { state: "sources_incomplete" };
    return { state: "comparable", basis: confidence.taste.basis, value: confidence.taste.value };
  }
  // Taste produced nothing. Whether that is a real absence or an unknown depends entirely on whether
  // the sources were in a position to tell us.
  return { state: tasteSourcesComplete ? "no_comparable_evidence" : "sources_incomplete" };
}

// Structural descriptions only. Every code below is derived from a status, a reachability boolean, a
// truncation boolean or a basis inherited from the frozen confidence layer.
function collectReasonCodes(
  tasteEvidence: ColdStartTasteEvidence,
  availableSignalFamilies: readonly ColdStartSignalFamily[],
  tasteSourcesReachable: boolean,
  tasteHistoryComplete: boolean
): readonly ColdStartReasonCodeName[] {
  const codes = new Set<ColdStartReasonCodeName>();

  if (tasteEvidence.state === "no_comparable_evidence") codes.add("no_comparable_taste_evidence");
  if (tasteEvidence.state === "sources_incomplete") codes.add("incomplete_taste_sources");
  if (tasteEvidence.state === "comparable") {
    if (tasteEvidence.basis === COLD_START_LIMITED_COVERAGE_BASIS) codes.add("limited_taste_evidence");
    if (COLD_START_DEGRADED_SOURCE_BASES.includes(tasteEvidence.basis)) codes.add("incomplete_taste_sources");
  }
  if (!tasteSourcesReachable) codes.add("incomplete_taste_sources");
  if (!tasteHistoryComplete) codes.add("incomplete_history");

  const tasteAvailable = availableSignalFamilies.includes("taste");
  const contextAvailable =
    availableSignalFamilies.includes("meal_pattern") ||
    availableSignalFamilies.includes("dining") ||
    availableSignalFamilies.includes("social_logistics");
  const goalAvailable = availableSignalFamilies.includes("goal");

  // Descriptions of what remains, never instructions to use it in place of taste.
  if (!tasteAvailable && contextAvailable) codes.add("context_only_evidence");
  if (!tasteAvailable && !contextAvailable && goalAvailable) codes.add("goal_only_evidence");
  // Restriction is excluded from this test on purpose: an eligibility verdict is not a comparison,
  // and letting one exist would silence a genuine "nothing comparable anywhere".
  if (!tasteAvailable && !contextAvailable && !goalAvailable) codes.add("no_comparable_evidence");

  return orderColdStartReasonCodes(codes);
}

// Carried through untouched from the frozen layers. Nothing here recomputes, softens, defaults or
// quantifies a restriction.
function collectRestrictionState(
  comparison: TasteComparisonBundle,
  confidence: EvidenceConfidenceBundle
): ColdStartRestrictionState {
  return Object.freeze({
    verdict: comparison.goalRestriction.restrictionEligibility.verdict,
    evidencePresentForBoth: confidence.restrictionEvidence.evidencePresentForBoth,
    unclassifiedPresent: confidence.restrictionEvidence.unclassifiedPresent,
    sourceReachableForBoth: confidence.restrictionEvidence.sourceReachableForBoth
  });
}

function freezeFamilies(values: readonly ColdStartSignalFamily[]): readonly ColdStartSignalFamily[] {
  return Object.freeze([...new Set(values)]);
}
