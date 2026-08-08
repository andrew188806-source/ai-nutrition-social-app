import type { PreferenceEvidence } from "../preference";
import type { TasteProfileSnapshot } from "../snapshot";
import {
  SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
  roundSocialContextCompatibilityScore
} from "./policy";
import {
  orderSocialContextCompatibilityReasonCodes,
  type SocialContextCompatibilityReasonCode
} from "./reasonCodes";
import type {
  SocialContextComparisonMode,
  SocialContextCompatibilityDimension,
  SocialContextCompatibilityResult,
  SocialContextConfidenceInputs,
  SocialContextDimensionResult,
  SocialContextNotScoredReason
} from "./types";

// TS-3C — the pure SOCIAL CONTEXT compatibility comparator.
//
// This file is not a taste scorer and shares no state with one. It reads exactly three preference
// scopes — `meal_pattern`, `dining_context`, `social_logistics` — and never `food_taste`. It reads no
// behaviour at all: no meal occurrences, no favorites, no ratings, no `sourceConfidence`. It reads no
// goals and no restrictions. Anything it cannot see, it cannot leak into a taste result.
//
// COMPARISON MODE FOLLOWS THE FROZEN EVIDENCE CARDINALITY, not preference:
//
//   meal_pattern    — sourced from the `preferred_meal_types` ARRAY column, so a user legitimately
//                     carries several values. Compared as a set with the parameter-free Jaccard
//                     index, exactly as the taste policy compares cuisines.
//   dining_context  — sourced from the single nullable `dining_style` scalar, so at most one value
//                     legally exists. Compared as an exact categorical equality: 1 or 0.
//   social_logistics — sourced from the single nullable `payment_preference` scalar. Same.
//
// Inventing multi-select semantics for a scalar, or an ordering over any of these controlled values,
// would be authority this repository has never agreed. There is no hierarchy: no meal type outranks
// another, no dining style is "better", and no payment preference implies spending ability.
//
// The dividing line, inherited deliberately from the taste comparator: MISSING evidence is
// not_scored and leaves the comparison entirely; PRESENT evidence that fails to match is a measured
// 0. Conflating the two is the single most damaging thing a compatibility scorer can do.
//
// Pure by construction: no clock, no randomness, no network, no database, no locale-sensitive
// comparison. Symmetry is structural — the pair is canonically ordered before anything reads it.

export function compareSocialContextCompatibility(
  snapshotA: TasteProfileSnapshot,
  snapshotB: TasteProfileSnapshot
): SocialContextCompatibilityResult {
  const [left, right] = orderSnapshotPair(snapshotA, snapshotB);

  if (
    snapshotA.schemaVersion !== SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||
    snapshotB.schemaVersion !== SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION
  ) {
    return unsupportedSchemaResult();
  }

  const leftFacts = collectContextFacts(left);
  const rightFacts = collectContextFacts(right);
  const reasonCodes = new Set<SocialContextCompatibilityReasonCode>();

  const mealPatternCompatibility = compareSets(
    "meal_pattern",
    leftFacts.mealTypes,
    rightFacts.mealTypes
  );
  if (mealPatternCompatibility.status === "scored" && mealPatternCompatibility.score > 0) {
    reasonCodes.add("shared_meal_type_preference");
  }

  const diningCompatibility = compareCategories(
    "dining_context",
    leftFacts.diningStyle,
    rightFacts.diningStyle
  );
  if (diningCompatibility.status === "scored" && diningCompatibility.score > 0) {
    reasonCodes.add("similar_dining_style");
  }

  const socialLogisticsCompatibility = compareCategories(
    "social_logistics",
    leftFacts.paymentPreference,
    rightFacts.paymentPreference
  );
  if (socialLogisticsCompatibility.status === "scored" && socialLogisticsCompatibility.score > 0) {
    reasonCodes.add("compatible_payment_preference");
  }

  const dimensions = [mealPatternCompatibility, diningCompatibility, socialLogisticsCompatibility];
  const comparableDimensionCount = dimensions.filter((entry) => entry.status === "scored").length;
  if (comparableDimensionCount <= 1) reasonCodes.add("limited_context_evidence");

  return {
    policyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
    snapshotSchemaVersion: SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
    mealPatternCompatibility,
    diningCompatibility,
    socialLogisticsCompatibility,
    confidenceInputs: buildConfidenceInputs(leftFacts, rightFacts, comparableDimensionCount, dimensions.length - comparableDimensionCount),
    explanationReasonCodes: orderSocialContextCompatibilityReasonCodes(reasonCodes)
  };
}

type ContextFacts = {
  mealTypes: readonly string[] | null;
  diningStyle: string | null;
  paymentPreference: string | null;
  mealTypeEvidenceCount: number;
  diningStyleEvidenceCount: number;
  paymentPreferenceEvidenceCount: number;
  explicitEvidenceCount: number;
  hasTasteProfileSource: boolean;
};

// Reads ONLY the three non-food preference scopes. `food_taste` preferences, every behaviour kind,
// goals and restrictions are never touched here, which is what makes their exclusion structural
// rather than a downstream filter.
function collectContextFacts(snapshot: TasteProfileSnapshot): ContextFacts {
  const mealTypes: string[] = [];
  let diningStyle: string | null = null;
  let paymentPreference: string | null = null;
  let mealTypeEvidenceCount = 0;
  let diningStyleEvidenceCount = 0;
  let paymentPreferenceEvidenceCount = 0;

  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {
    // Polarity is deliberately not compared. The frozen shape declares `positive | unclassified` for
    // meal types and `neutral | unclassified` for the two scalars; both members are equally legal, so
    // treating `unclassified` as anything other than "this is the value" — least of all as a
    // conflict — would invent polarity semantics the contract does not carry.
    if (preference.scope === "meal_pattern" && preference.facet === "meal_type") {
      mealTypes.push(preference.value);
      mealTypeEvidenceCount += 1;
    } else if (preference.scope === "dining_context" && preference.facet === "dining_style") {
      // A taste profile row is unique per user and `dining_style` is a single nullable column, so at
      // most one value can legally exist. Snapshot preferences are sorted by evidenceId upstream, so
      // taking the first keeps the read deterministic even if that ever changes.
      if (diningStyle === null) diningStyle = preference.value;
      diningStyleEvidenceCount += 1;
    } else if (preference.scope === "social_logistics" && preference.facet === "payment_preference") {
      if (paymentPreference === null) paymentPreference = preference.value;
      paymentPreferenceEvidenceCount += 1;
    }
  }

  const tasteProfileState = snapshot.sourceStates.taste_profile.status;

  return {
    mealTypes: mealTypes.length ? sortUnique(mealTypes) : null,
    diningStyle,
    paymentPreference,
    mealTypeEvidenceCount,
    diningStyleEvidenceCount,
    paymentPreferenceEvidenceCount,
    explicitEvidenceCount: mealTypeEvidenceCount + diningStyleEvidenceCount + paymentPreferenceEvidenceCount,
    hasTasteProfileSource: tasteProfileState === "available" || tasteProfileState === "empty"
  };
}

// Set-valued dimension. Returns a measured 0 when both sides supplied values and share none — that
// is a real observation, not an absence.
function compareSets(
  dimension: SocialContextCompatibilityDimension,
  left: readonly string[] | null,
  right: readonly string[] | null
): SocialContextDimensionResult {
  const missing = missingEvidenceReason(left === null, right === null);
  if (missing !== null) return notScored(dimension, "set_overlap", missing);
  const leftValues = left as readonly string[];
  const rightValues = right as readonly string[];
  const rightSet = new Set(rightValues);
  let intersectionSize = 0;
  for (const value of leftValues) {
    if (rightSet.has(value)) intersectionSize += 1;
  }
  const unionSize = new Set([...leftValues, ...rightValues]).size;
  if (unionSize === 0) return notScored(dimension, "set_overlap", "no_comparable_evidence");
  return scored(dimension, "set_overlap", intersectionSize / unionSize);
}

// Singleton dimension. Exact equality on the normalized canonical value: 1 or 0, with no partial
// credit and no ordering between controlled values.
function compareCategories(
  dimension: SocialContextCompatibilityDimension,
  left: string | null,
  right: string | null
): SocialContextDimensionResult {
  const missing = missingEvidenceReason(left === null, right === null);
  if (missing !== null) return notScored(dimension, "categorical_equality", missing);
  return scored(dimension, "categorical_equality", left === right ? 1 : 0);
}

// Distinguishes "neither side said anything" from "one side said nothing". Both are unscorable, but
// they are different product situations and a caller may treat them differently.
function missingEvidenceReason(leftMissing: boolean, rightMissing: boolean): SocialContextNotScoredReason | null {
  if (leftMissing && rightMissing) return "no_comparable_evidence";
  if (leftMissing || rightMissing) return "insufficient_evidence";
  return null;
}

function scored(
  dimension: SocialContextCompatibilityDimension,
  comparisonMode: SocialContextComparisonMode,
  value: number
): SocialContextDimensionResult {
  return { dimension, comparisonMode, status: "scored", score: roundSocialContextCompatibilityScore(value) };
}

function notScored(
  dimension: SocialContextCompatibilityDimension,
  comparisonMode: SocialContextComparisonMode,
  reason: SocialContextNotScoredReason
): SocialContextDimensionResult {
  return { dimension, comparisonMode, status: "not_scored", reason };
}

function unsupportedSchemaResult(): SocialContextCompatibilityResult {
  const failClosed = (
    dimension: SocialContextCompatibilityDimension,
    comparisonMode: SocialContextComparisonMode
  ) => notScored(dimension, comparisonMode, "unsupported_snapshot_schema");
  return {
    policyVersion: SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
    snapshotSchemaVersion: SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
    mealPatternCompatibility: failClosed("meal_pattern", "set_overlap"),
    diningCompatibility: failClosed("dining_context", "categorical_equality"),
    socialLogisticsCompatibility: failClosed("social_logistics", "categorical_equality"),
    confidenceInputs: {
      comparableDimensionCount: 0,
      unknownDimensionCount: 3,
      explicitEvidenceCount: 0,
      evidenceCountsByDimension: { meal_pattern: 0, dining_context: 0, social_logistics: 0 },
      sourceAvailability: { tasteProfileAvailableForBoth: false }
    },
    explanationReasonCodes: orderSocialContextCompatibilityReasonCodes(["limited_context_evidence"])
  };
}

function buildConfidenceInputs(
  leftFacts: ContextFacts,
  rightFacts: ContextFacts,
  comparableDimensionCount: number,
  unknownDimensionCount: number
): SocialContextConfidenceInputs {
  return {
    comparableDimensionCount,
    unknownDimensionCount,
    explicitEvidenceCount: leftFacts.explicitEvidenceCount + rightFacts.explicitEvidenceCount,
    evidenceCountsByDimension: {
      meal_pattern: leftFacts.mealTypeEvidenceCount + rightFacts.mealTypeEvidenceCount,
      dining_context: leftFacts.diningStyleEvidenceCount + rightFacts.diningStyleEvidenceCount,
      social_logistics: leftFacts.paymentPreferenceEvidenceCount + rightFacts.paymentPreferenceEvidenceCount
    },
    sourceAvailability: {
      tasteProfileAvailableForBoth: leftFacts.hasTasteProfileSource && rightFacts.hasTasteProfileSource
    }
  };
}

// Canonical pair ordering. `subjectUserId` is an opaque normalized id, compared by code unit so the
// result never depends on host locale.
function orderSnapshotPair(
  first: TasteProfileSnapshot,
  second: TasteProfileSnapshot
): readonly [TasteProfileSnapshot, TasteProfileSnapshot] {
  return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];
}

function sortUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareCodeUnits));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
