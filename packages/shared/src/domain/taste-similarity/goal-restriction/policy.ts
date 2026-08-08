import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";

// TS-3D — the GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY policy authority.
//
// A third independent version line. Neither `taste-similarity-v1.1` nor
// `social-context-compatibility-v1` changes in this round, and bumping either would falsely signal
// that its semantics had moved. Three questions — "do they like the same food", "do they eat
// compatibly", "do their nutrition goals and dietary constraints line up" — get three independently
// versionable answers.
export const GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION = "goal-restriction-compatibility-v1" as const;

// The only snapshot schema this policy reads. Anything else fails closed: goal compatibility is not
// scored and restriction eligibility returns the explicitly unknowable verdict.
export const GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;

// Canonical INTERNAL range for GOAL compatibility only. Restriction eligibility is deliberately
// NOT a number — see `types.ts`. There is no aggregate across the two, and no aggregate with taste
// or social context.
export const GOAL_COMPATIBILITY_SCORE_MIN = 0;
export const GOAL_COMPATIBILITY_SCORE_MAX = 1;

// Deterministic rounding authority, declared locally so this policy can diverge from its siblings in
// a later round without one silently dragging the other. Six decimals for the same reason the other
// policies chose it: it keeps the small rationals a Jaccard index produces distinguishable while
// removing binary representation noise.
export const GOAL_COMPATIBILITY_SCORE_PRECISION = 6;

export function roundGoalCompatibilityScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Goal compatibility score must be a finite number.");
  }
  const factor = 10 ** GOAL_COMPATIBILITY_SCORE_PRECISION;
  const rounded = Math.round(value * factor) / factor;
  // Guard the contract itself rather than trusting callers: an out-of-range score is a defect, not
  // something to silently clamp into looking valid.
  if (rounded < GOAL_COMPATIBILITY_SCORE_MIN || rounded > GOAL_COMPATIBILITY_SCORE_MAX) {
    throw new RangeError("Goal compatibility score must fall within the canonical 0..1 range.");
  }
  return rounded;
}
