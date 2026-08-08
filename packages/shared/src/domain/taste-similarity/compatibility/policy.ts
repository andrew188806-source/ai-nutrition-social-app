import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";

// TS-3C — the SOCIAL CONTEXT COMPATIBILITY policy authority.
//
// Deliberately its own version line, separate from `taste-similarity-v1.1`. Food-taste semantics did
// not change in this round, so bumping the taste version would falsely signal that they had, and
// would invalidate every taste result for a reason that has nothing to do with taste. Two questions
// — "do these two people like the same food" and "do these two people eat compatibly" — deserve two
// independently versionable answers.
export const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v1" as const;

// The only snapshot schema this policy reads. Anything else fails closed on every dimension rather
// than being scored on assumptions about its shape.
export const SOCIAL_CONTEXT_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;

// Canonical INTERNAL range, per dimension. There is deliberately NO aggregate: the three dimensions
// are reported side by side and never collapsed into one number here, because how to trade a
// payment-preference mismatch against a shared meal type is a product decision that belongs to
// whatever consumes this, not to the comparator.
export const SOCIAL_CONTEXT_SCORE_MIN = 0;
export const SOCIAL_CONTEXT_SCORE_MAX = 1;

// Deterministic rounding authority. Six decimals matches the precision the taste policy settled on
// for the same reason — it keeps the small rationals a Jaccard index actually produces
// distinguishable while removing binary representation noise. It is declared here rather than
// imported so the two policies can diverge in a later round without one silently dragging the other.
export const SOCIAL_CONTEXT_SCORE_PRECISION = 6;

export function roundSocialContextCompatibilityScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Social context compatibility score must be a finite number.");
  }
  const factor = 10 ** SOCIAL_CONTEXT_SCORE_PRECISION;
  const rounded = Math.round(value * factor) / factor;
  // Guard the contract itself rather than trusting callers: an out-of-range score is a defect, not
  // something to silently clamp into looking valid.
  if (rounded < SOCIAL_CONTEXT_SCORE_MIN || rounded > SOCIAL_CONTEXT_SCORE_MAX) {
    throw new RangeError("Social context compatibility score must fall within the canonical 0..1 range.");
  }
  return rounded;
}
