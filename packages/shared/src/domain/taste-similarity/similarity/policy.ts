import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";

// TS-3A — the versioned scoring policy authority.
//
// A similarity result is only interpretable against the PAIR (policy version, snapshot schema
// version). Weight or semantic changes in a later policy must never silently reinterpret a result
// produced by this one, so both versions are stamped onto every result — including results that
// were not scored.
export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1" as const;

// The only snapshot schema this policy is allowed to read. Anything else fails closed as
// `unsupported_snapshot_schema` rather than being scored on assumptions about its shape.
export const TASTE_SIMILARITY_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;

// Canonical INTERNAL range. 0..1 composes without rescaling and matches the existing 0..1
// convention already used by sourceConfidence. Converting to a 0..100 display value is a UI
// concern and deliberately does not exist in this domain.
export const TASTE_SIMILARITY_SCORE_MIN = 0;
export const TASTE_SIMILARITY_SCORE_MAX = 1;

// Deterministic rounding authority.
//
// Floating point addition/division is order sensitive, so "same input, same policy, same score"
// only holds if the final value is quantised. Six decimals is the smallest precision that keeps the
// small rationals this policy actually produces (halves, thirds, quarters, fifths) distinguishable
// while removing binary representation noise. It is part of the frozen policy: changing it changes
// results and therefore requires a new policy version.
export const TASTE_SIMILARITY_SCORE_PRECISION = 6;

export function roundTasteSimilarityScore(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Taste similarity score must be a finite number.");
  }
  const factor = 10 ** TASTE_SIMILARITY_SCORE_PRECISION;
  const rounded = Math.round(value * factor) / factor;
  // Guard the contract itself rather than trusting callers: an out-of-range score is a defect, not
  // something to silently clamp into looking valid.
  if (rounded < TASTE_SIMILARITY_SCORE_MIN || rounded > TASTE_SIMILARITY_SCORE_MAX) {
    throw new RangeError("Taste similarity score must fall within the canonical 0..1 range.");
  }
  return rounded;
}
