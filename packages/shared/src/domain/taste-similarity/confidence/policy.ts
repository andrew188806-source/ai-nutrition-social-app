import type { TasteSimilarityDimension } from "../similarity";

// TS-4 — the EVIDENCE CONFIDENCE policy authority.
//
// Evidence confidence answers exactly one question: how much usable and complete evidence supports
// treating the currently observed result as meaningful? It is an evidence-support index and nothing
// else. It does not express how often the result would turn out correct, it is not a match measure,
// it says nothing about how a recommendation would turn out, and it is not a safety assurance. The
// name says `evidence` on purpose, and so does the version.
//
// Independent version line. It does not bump — and is not bumped by — any of the five frozen
// authorities it reads. A later formula change bumps this one only.
export const EVIDENCE_CONFIDENCE_POLICY_VERSION = "evidence-confidence-v1" as const;

// The taste identity FAMILIES. Seven dimensions exist in the frozen taste contract, but two PAIRS of
// them are mutually exclusive by the frozen favorites-suppression rule: a comparable
// `favorite_restaurant` structurally forbids `repeated_meal_restaurant`, and likewise for menu items.
// So the maximum simultaneously-comparable set is FIVE, not seven, and each identity family must be
// counted once no matter which of its two dimensions carried it.
//
// Using seven would cap a favorites-rich pair at 5/7 despite that pair having MORE evidence, which
// is exactly backwards.
export const TASTE_CONFIDENCE_DIMENSION_FAMILIES: Readonly<Record<TasteSimilarityDimension, string>> =
  Object.freeze({
    cuisine_preference: "cuisine",
    flavor_avoidance: "flavor",
    spice_preference: "spice",
    favorite_restaurant: "restaurant_identity",
    repeated_meal_restaurant: "restaurant_identity",
    favorite_menu_item: "menu_item_identity",
    repeated_meal_menu_item: "menu_item_identity"
  });

// Declared explicitly rather than derived from the dimension array, whose length is seven. The guard
// cross-checks it against the number of DISTINCT families above, so the two can never drift.
export const TASTE_CONFIDENCE_SUPPORTED_DIMENSION_COUNT = 5;

// The sources the frozen taste scorer actually reads. Ratings are excluded because no frozen scorer
// consumes them; goals, restrictions and the context scopes are excluded because they belong to
// other dimensions entirely.
export const TASTE_CONFIDENCE_RELEVANT_SOURCE_COUNT = 3;

// The explicit-preference families, used only to classify the reported basis. Behavioural families
// are the remainder. This never touches the numeric value.
export const TASTE_CONFIDENCE_EXPLICIT_FAMILIES: readonly string[] = Object.freeze([
  "cuisine",
  "flavor",
  "spice"
]);

// A single comparable family is the minimum non-zero coverage. The boundary is not a tuned
// parameter: it mirrors the frozen taste comparator, which already flags `limited_evidence` at
// exactly one comparable dimension.
export const TASTE_CONFIDENCE_LIMITED_COVERAGE_FAMILY_COUNT = 1;

// Deterministic precedence for the reported basis. FIRST MATCH WINS, evaluated in this exact order,
// so overlapping conditions can never produce a non-deterministic label. Declared here rather than
// inline so the ordering is policy, not an implementation accident.
export const EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE = [
  "source_unavailable",
  "incomplete_history",
  "limited_evidence_coverage",
  "strong_explicit_and_behavioral_evidence",
  "explicit_evidence_only",
  "behavioral_evidence_only"
] as const;

// Canonical INTERNAL range for the taste evidence-support index.
export const EVIDENCE_CONFIDENCE_VALUE_MIN = 0;
export const EVIDENCE_CONFIDENCE_VALUE_MAX = 1;

// Deterministic rounding authority, declared locally. The score policies each own a rounding helper
// for a SCORE; importing one here would couple an evidence-support index to a similarity scale and
// make a later score-precision change silently move confidence. Six decimals for the same reason
// they chose it: it keeps small rationals distinguishable while removing binary representation noise.
export const EVIDENCE_CONFIDENCE_VALUE_PRECISION = 6;

export function roundEvidenceConfidenceValue(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Evidence confidence value must be a finite number.");
  }
  const factor = 10 ** EVIDENCE_CONFIDENCE_VALUE_PRECISION;
  const rounded = Math.round(value * factor) / factor;
  // Guard the contract itself rather than trusting callers: an out-of-range value is a defect, not
  // something to silently clamp into looking valid.
  if (rounded < EVIDENCE_CONFIDENCE_VALUE_MIN || rounded > EVIDENCE_CONFIDENCE_VALUE_MAX) {
    throw new RangeError("Evidence confidence value must fall within the canonical 0..1 range.");
  }
  return rounded;
}
