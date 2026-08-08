import type { GoalEvidence } from "../goal";
import type { RestrictionEvidence } from "../restriction";
import type { TasteProfileSnapshot } from "../snapshot";
import {
  GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
  roundGoalCompatibilityScore
} from "./policy";
import { orderGoalRestrictionReasonCodes, type GoalRestrictionReasonCode } from "./reasonCodes";
import type {
  GoalCompatibilityNotScoredReason,
  GoalCompatibilityResult,
  GoalRestrictionCompatibilityResult,
  GoalRestrictionConfidenceInputs,
  RestrictionEligibilityResult
} from "./types";

// TS-3D — the pure GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY comparator.
//
// Two people can like exactly the same food and want completely different things from it. Goal is
// not taste, restriction is not taste, and neither reaches the taste comparator or the social
// context comparator — this file imports nothing from either and is imported by neither.
//
// GOAL: coarse label only.
//
// The frozen goal contract carries a free-text `goal_label` plus five SCALAR macro facets. Only the
// label is read. The scalars — calories, protein, carbohydrates, fat, fiber — are
// `sensitive_internal` and are never compared across users, never output, and never turned into a
// numeric "goal distance". A macro target is a private medical-adjacent number, and cross-user macro
// arithmetic would leak it by inference even without printing it. Macro fit belongs to future
// user-to-restaurant logic, not to user-to-user compatibility.
//
// Labels are free text, so comparison is EXACT normalized equality. No semantic grouping is
// invented: this policy does not know that one label resembles another, because the repository has
// no controlled vocabulary saying so.
//
// ELIGIBILITY, NOT SIMILARITY, for restrictions.
//
// The frozen enforcement ladder has exactly two rungs, `soft` and `unclassified`, so nothing in this
// repository can currently express an exclusion. This round does not invent one — no severity
// taxonomy, no hard constraint, no exclusion rule. A soft preference stays a preference. Anything
// whose enforcement could not be classified resolves to `needs_attention`, never to `compatible`:
// "no conflict could be proven" is not the same statement as "there is no conflict", and collapsing
// the two is precisely the failure mode that matters when the subject is what someone can eat.
//
// Restriction eligibility therefore returns a CATEGORICAL verdict and carries no score at all.
//
// Pure by construction: no clock, no randomness, no network, no database, no locale-sensitive
// comparison. Date validity is read from the snapshot's own recorded `generatedAt`, which is data,
// not a clock — and each side is filtered by its own snapshot's date, so symmetry is preserved.

export function compareGoalRestrictionCompatibility(
  snapshotA: TasteProfileSnapshot,
  snapshotB: TasteProfileSnapshot
): GoalRestrictionCompatibilityResult {
  const [left, right] = orderSnapshotPair(snapshotA, snapshotB);

  if (
    snapshotA.schemaVersion !== GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION ||
    snapshotB.schemaVersion !== GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION
  ) {
    return unsupportedSchemaResult();
  }

  const leftFacts = collectGoalRestrictionFacts(left);
  const rightFacts = collectGoalRestrictionFacts(right);
  const reasonCodes = new Set<GoalRestrictionReasonCode>();

  const goalCompatibility = compareGoalLabels(leftFacts.goalLabels, rightFacts.goalLabels);
  if (goalCompatibility.status === "scored") {
    reasonCodes.add(goalCompatibility.score > 0 ? "shared_goal_label" : "different_goal_label");
  } else {
    reasonCodes.add("limited_goal_evidence");
  }

  const sharedSoftRestrictionCount = intersectionSize(leftFacts.softRestrictionLabels, rightFacts.softRestrictionLabels);
  const restrictionEligibility = decideRestrictionEligibility(leftFacts, rightFacts);
  if (sharedSoftRestrictionCount > 0) reasonCodes.add("shared_soft_restriction");
  if (restrictionEligibility.verdict === "needs_attention") reasonCodes.add("restriction_requires_attention");
  if (restrictionEligibility.verdict === "unknown") reasonCodes.add("restriction_evidence_unknown");

  return {
    policyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
    snapshotSchemaVersion: GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
    goalCompatibility,
    restrictionEligibility,
    confidenceInputs: buildConfidenceInputs(leftFacts, rightFacts, goalCompatibility, sharedSoftRestrictionCount),
    explanationReasonCodes: orderGoalRestrictionReasonCodes(reasonCodes)
  };
}

type GoalRestrictionFacts = {
  goalLabels: readonly string[] | null;
  goalLabelEvidenceCount: number;
  hasGoalSource: boolean;
  restrictionEvidenceCount: number;
  unclassifiedRestrictionPresent: boolean;
  softRestrictionLabels: ReadonlySet<string>;
  hasRestrictionSource: boolean;
};

// Reads ONLY goal labels and restriction enforcement. Preferences of every scope, every behaviour
// kind and every goal SCALAR facet are never touched here, which is what makes their exclusion
// structural rather than a downstream filter.
function collectGoalRestrictionFacts(snapshot: TasteProfileSnapshot): GoalRestrictionFacts {
  // The canonical producer already drops inactive and out-of-window goal rows, but the snapshot type
  // admits any goal evidence, so the same frozen rule is applied again here rather than assumed. The
  // as-of date is this snapshot's own recorded generation date, compared as an ISO date string
  // exactly the way the frozen mapper compares it.
  const asOfDate = snapshot.generatedAt.slice(0, 10);
  const goalLabels: string[] = [];
  let goalLabelEvidenceCount = 0;

  for (const goal of snapshot.goals as readonly GoalEvidence[]) {
    if (goal.facet !== "goal_label") continue;
    if (!goal.validity.isActive) continue;
    if (goal.validity.startsOn > asOfDate) continue;
    if (goal.validity.endsOn !== undefined && goal.validity.endsOn < asOfDate) continue;
    goalLabels.push(goal.value);
    goalLabelEvidenceCount += 1;
  }

  const softRestrictionLabels = new Set<string>();
  let restrictionEvidenceCount = 0;
  let unclassifiedRestrictionPresent = false;

  for (const restriction of snapshot.restrictions as readonly RestrictionEvidence[]) {
    restrictionEvidenceCount += 1;
    if (restriction.enforcement === "soft") {
      // Held privately so an exactly shared soft constraint can be COUNTED. The label never leaves
      // this function.
      softRestrictionLabels.add(restriction.label);
      continue;
    }
    unclassifiedRestrictionPresent = true;
  }

  const goalState = snapshot.sourceStates.nutrition_goals.status;
  const restrictionState = snapshot.sourceStates.dietary_restrictions.status;

  return {
    goalLabels: goalLabels.length ? sortUnique(goalLabels) : null,
    goalLabelEvidenceCount,
    hasGoalSource: goalState === "available" || goalState === "empty",
    restrictionEvidenceCount,
    unclassifiedRestrictionPresent,
    softRestrictionLabels,
    hasRestrictionSource: restrictionState === "available" || restrictionState === "empty"
  };
}

// Set of exact normalized labels, compared with the parameter-free Jaccard index. Both sides present
// and sharing nothing is a measured 0 — a real observation. Either side absent is not comparable.
function compareGoalLabels(
  left: readonly string[] | null,
  right: readonly string[] | null
): GoalCompatibilityResult {
  const missing = missingEvidenceReason(left === null, right === null);
  if (missing !== null) return { comparisonMode: "set_overlap", status: "not_scored", reason: missing };
  const leftLabels = left as readonly string[];
  const rightLabels = right as readonly string[];
  const shared = intersectionSize(new Set(leftLabels), rightLabels);
  const unionSize = new Set([...leftLabels, ...rightLabels]).size;
  if (unionSize === 0) {
    return { comparisonMode: "set_overlap", status: "not_scored", reason: "no_comparable_evidence" };
  }
  return { comparisonMode: "set_overlap", status: "scored", score: roundGoalCompatibilityScore(shared / unionSize) };
}

// Categorical verdict. Order matters: an unclassifiable constraint outranks everything else, because
// resolving it to `compatible` would turn "we could not tell" into a reassurance.
function decideRestrictionEligibility(
  leftFacts: GoalRestrictionFacts,
  rightFacts: GoalRestrictionFacts
): RestrictionEligibilityResult {
  const comparableRestrictionEvidence =
    leftFacts.restrictionEvidenceCount > 0 && rightFacts.restrictionEvidenceCount > 0;
  if (leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent) {
    return { verdict: "needs_attention", basis: "unclassified_enforcement_present", comparableRestrictionEvidence };
  }
  if (leftFacts.restrictionEvidenceCount === 0 && rightFacts.restrictionEvidenceCount === 0) {
    return { verdict: "compatible", basis: "no_restriction_evidence", comparableRestrictionEvidence };
  }
  // Everything present is a soft preference. Differing soft preferences are not an incompatibility:
  // the frozen contract has no enforcement level that could make them one.
  return { verdict: "compatible", basis: "soft_preferences_only", comparableRestrictionEvidence };
}

function missingEvidenceReason(leftMissing: boolean, rightMissing: boolean): GoalCompatibilityNotScoredReason | null {
  if (leftMissing && rightMissing) return "no_comparable_evidence";
  if (leftMissing || rightMissing) return "insufficient_evidence";
  return null;
}

function unsupportedSchemaResult(): GoalRestrictionCompatibilityResult {
  return {
    policyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
    snapshotSchemaVersion: GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
    goalCompatibility: { comparisonMode: "set_overlap", status: "not_scored", reason: "unsupported_snapshot_schema" },
    restrictionEligibility: {
      verdict: "unknown",
      basis: "unsupported_snapshot_schema",
      comparableRestrictionEvidence: false
    },
    confidenceInputs: {
      goal: { eligibleGoalLabelCount: 0, comparableGoalDimension: false, goalSourceAvailableForBoth: false },
      restriction: {
        restrictionEvidenceCount: 0,
        unclassifiedRestrictionPresent: false,
        sharedSoftRestrictionCount: 0,
        restrictionSourceAvailableForBoth: false
      }
    },
    explanationReasonCodes: orderGoalRestrictionReasonCodes(["limited_goal_evidence", "restriction_evidence_unknown"])
  };
}

function buildConfidenceInputs(
  leftFacts: GoalRestrictionFacts,
  rightFacts: GoalRestrictionFacts,
  goalCompatibility: GoalCompatibilityResult,
  sharedSoftRestrictionCount: number
): GoalRestrictionConfidenceInputs {
  return {
    goal: {
      eligibleGoalLabelCount: leftFacts.goalLabelEvidenceCount + rightFacts.goalLabelEvidenceCount,
      comparableGoalDimension: goalCompatibility.status === "scored",
      goalSourceAvailableForBoth: leftFacts.hasGoalSource && rightFacts.hasGoalSource
    },
    restriction: {
      restrictionEvidenceCount: leftFacts.restrictionEvidenceCount + rightFacts.restrictionEvidenceCount,
      unclassifiedRestrictionPresent:
        leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent,
      sharedSoftRestrictionCount,
      restrictionSourceAvailableForBoth: leftFacts.hasRestrictionSource && rightFacts.hasRestrictionSource
    }
  };
}

function intersectionSize(left: ReadonlySet<string>, right: Iterable<string>): number {
  let size = 0;
  for (const value of right) {
    if (left.has(value)) size += 1;
  }
  return size;
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
