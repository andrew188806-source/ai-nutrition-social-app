import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";

// TS-3A — the versioned scoring policy authority.
//
// A similarity result is only interpretable against the PAIR (policy version, snapshot schema
// version). Weight or semantic changes in a later policy must never silently reinterpret a result
// produced by this one, so both versions are stamped onto every result — including results that
// were not scored.
//
// TS-3B-R1 bumped this from `taste-similarity-v1` to `taste-similarity-v1.1`. The bump is MANDATORY,
// not cosmetic: R1 adds two behavioural fallback dimensions, so the same snapshot pair can now
// produce a different score than v1 produced. A minor successor is the accurate signal — the
// comparable EVIDENCE surface changed while the mathematical model (unweighted mean of 0..1
// agreements, Jaccard set agreement, 6-decimal rounding, unknown excluded from the denominator) did
// not. A major bump would falsely imply the model itself was replaced.
export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1.1" as const;

// Ordered version history. Kept so a result stamped with a superseded version stays unambiguous
// rather than being silently reinterpretable as the current policy. There is no durable score
// persistence in this system today, so no migration or backfill accompanies the bump — but the
// history must exist BEFORE persistence does, not after.
export const TASTE_SIMILARITY_POLICY_VERSION_HISTORY = [
  "taste-similarity-v1",
  "taste-similarity-v1.1"
] as const;

export type TasteSimilarityPolicyVersion = (typeof TASTE_SIMILARITY_POLICY_VERSION_HISTORY)[number];

// TS-3B-R1 repetition authority.
//
// A canonical target counts as REPEATEDLY consumed once it is observed in at least this many
// DISTINCT meal-occurrence evidence records inside the bounded snapshot. Two is the minimal semantic
// distinction between "consumed once" and "consumed again" — it is a definition boundary, not a
// tunable similarity weight. Crossing it is binary: 2, 3, 5 and 20 qualifying occurrences all mean
// exactly `repeated evidence exists`, and none of them means "more affinity" than another.
// Occurrence multipliers, logarithmic frequency scaling, streak rewards, crowd-size uplift and
// threshold tiers are all deliberately absent, and the guard enforces their absence.
export const MIN_REPEATED_MEAL_OCCURRENCES = 2;

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
