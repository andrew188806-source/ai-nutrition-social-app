import type { GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION } from "./policy";
import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { GoalRestrictionReasonCode } from "./reasonCodes";

// TS-3D — the goal compatibility and restriction eligibility result contract.

export type GoalCompatibilityNotScoredReason =
  // Neither user has an eligible goal label.
  | "no_comparable_evidence"
  // Exactly one side has one. One-sided evidence can never produce agreement and must not be
  // reported as disagreement either.
  | "insufficient_evidence"
  // The snapshot pair does not carry the schema version this policy understands.
  | "unsupported_snapshot_schema";

type GoalCompatibilityResultBase = {
  // Goal labels are free text produced one per ACTIVE, date-valid nutrition-goal row, so a user can
  // legitimately hold several. They are therefore compared as a set of exact normalized labels.
  comparisonMode: "set_overlap";
};

// `score` exists ONLY on the scored variant, so "not scored" can never be misread as 0 goal
// compatibility.
export type ScoredGoalCompatibilityResult = GoalCompatibilityResultBase & {
  status: "scored";
  score: number;
};

export type NotScoredGoalCompatibilityResult = GoalCompatibilityResultBase & {
  status: "not_scored";
  reason: GoalCompatibilityNotScoredReason;
};

export type GoalCompatibilityResult = ScoredGoalCompatibilityResult | NotScoredGoalCompatibilityResult;

// Restriction eligibility is a CATEGORICAL verdict, never a number.
//
// "How similar are their restrictions" is the wrong question: two people who each avoid one
// different thing are not half-eligible to eat together. The frozen contract also offers no
// enforcement level above `soft`, so nothing here can express an exclusion, and this round does not
// invent one.
export const RESTRICTION_ELIGIBILITY_VERDICTS = ["compatible", "needs_attention", "unknown"] as const;

export type RestrictionEligibilityVerdict = (typeof RESTRICTION_ELIGIBILITY_VERDICTS)[number];

// Why the verdict was reached, as a closed enum rather than prose. Never a label, never a severity.
export type RestrictionEligibilityBasis =
  | "no_restriction_evidence"
  | "soft_preferences_only"
  | "unclassified_enforcement_present"
  | "unsupported_snapshot_schema";

// Deliberately carries NO `score` key of any kind.
export type RestrictionEligibilityResult = {
  verdict: RestrictionEligibilityVerdict;
  basis: RestrictionEligibilityBasis;
  comparableRestrictionEvidence: boolean;
};

// Sparse-evidence inputs. Deliberately NOT a numeric confidence — TS-4 owns that. Counts and
// booleans only, and never a value: `sharedSoftRestrictionCount` is how many soft constraints the
// two share, never which ones.
export type GoalRestrictionConfidenceInputs = {
  goal: {
    eligibleGoalLabelCount: number;
    comparableGoalDimension: boolean;
    goalSourceAvailableForBoth: boolean;
  };
  restriction: {
    restrictionEvidenceCount: number;
    unclassifiedRestrictionPresent: boolean;
    sharedSoftRestrictionCount: number;
    restrictionSourceAvailableForBoth: boolean;
  };
};

// The two results are reported SIDE BY SIDE. There is deliberately no combined score, no overall
// social score and no overall taste score: trading a differing nutrition goal against a shared
// dietary constraint is a product decision no evidence in this repository supports.
export type GoalRestrictionCompatibilityResult = {
  policyVersion: typeof GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  goalCompatibility: GoalCompatibilityResult;
  restrictionEligibility: RestrictionEligibilityResult;
  confidenceInputs: GoalRestrictionConfidenceInputs;
  explanationReasonCodes: readonly GoalRestrictionReasonCode[];
};
