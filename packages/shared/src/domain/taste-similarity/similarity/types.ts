import type { TASTE_SIMILARITY_POLICY_VERSION } from "./policy";
import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { TasteSimilarityReasonCode } from "./reasonCodes";

// TS-3A — the versioned taste similarity result contract.
//
// The v1 comparable dimensions. Each is a FOOD-OBJECT dimension: meal_pattern, dining_context and
// social_logistics preferences exist in the snapshot but are deliberately absent from this union,
// so "logistics leaked into taste" is not a bug that can be introduced without changing this type.
export const TASTE_SIMILARITY_DIMENSIONS = [
  "cuisine_preference",
  "flavor_avoidance",
  "spice_preference",
  "favorite_restaurant",
  "favorite_menu_item",
  // TS-3B-R1 behavioural FALLBACK dimensions. Repeated observed consumption of a canonical target is
  // weaker evidence than an explicit favorite, so each one only becomes comparable when the favorite
  // dimension of the SAME identity family is not comparable. They are named for what they are —
  // repeated consumption — so no caller can read them as an explicit liking.
  "repeated_meal_restaurant",
  "repeated_meal_menu_item"
] as const;

export type TasteSimilarityDimension = (typeof TASTE_SIMILARITY_DIMENSIONS)[number];

export type TasteSimilarityNotScoredReason =
  // Neither user contributed evidence to any v1 dimension, so there is nothing to compare.
  | "no_comparable_evidence"
  // At least one side has no v1 food-taste evidence at all: a one-sided profile can never produce
  // agreement, and must not be reported as disagreement either.
  | "insufficient_evidence"
  // The snapshot pair does not carry the schema version this policy understands.
  | "unsupported_snapshot_schema";

// Per-dimension classification. `unknown` is a first-class outcome and is NOT a zero: an unknown
// dimension is excluded from both the numerator and the denominator.
export type TasteSimilarityDimensionOutcome = {
  dimension: TasteSimilarityDimension;
  agreement: number;
};

// Sparse-evidence inputs. Deliberately NOT a numeric confidence — TS-4 owns that. These are raw
// counts and availability facts a later policy can turn into a confidence value without this
// contract having pre-judged how.
export type TasteSimilarityConfidenceInputs = {
  comparableDimensionCount: number;
  unknownDimensionCount: number;
  evidenceCount: number;
  explicitEvidenceCount: number;
  behavioralEvidenceCount: number;
  sourceAvailability: {
    tasteProfileAvailableForBoth: boolean;
    favoritesAvailableForBoth: boolean;
    // TS-3B-R1. Meal availability is reported so a caller can tell "no repeated signal because the
    // source was unavailable" apart from "no repeated signal because nothing repeated".
    mealsAvailableForBoth: boolean;
  };
  truncation: {
    favoritesTruncatedForEither: boolean;
    // TS-3B-R1. A truncated meal window can only ever UNDER-report repetition. Exposing it keeps
    // that visible without letting any policy convert a short window into a negative assertion.
    mealsTruncatedForEither: boolean;
  };
  // TS-3B-R1. Non-numeric repeated-consumption facts. Counts of qualifying canonical TARGETS, never
  // visit counts, never a confidence value, and never an identity — TS-4 owns numeric confidence.
  repeatedMealEvidence: {
    qualifyingRestaurantTargets: number;
    qualifyingMenuItemTargets: number;
    // True when the favorite dimension of the same identity family was comparable, so the weaker
    // repeated-consumption fallback was deliberately not activated. This is what proves the two are
    // never counted as independent votes for the same behavioural family.
    restaurantSuppressedByFavorites: boolean;
    menuItemSuppressedByFavorites: boolean;
  };
};

type TasteSimilarityResultBase = {
  policyVersion: typeof TASTE_SIMILARITY_POLICY_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  comparableDimensions: readonly TasteSimilarityDimension[];
  // Shared POSITIVE preference / shared positive action.
  overlaps: readonly TasteSimilarityDimension[];
  // Shared NEGATIVE preference. Structurally separate from `overlaps` so a future policy can weight
  // it differently and so no caller can render an avoidance as a liking.
  sharedAvoidances: readonly TasteSimilarityDimension[];
  // Not comparable: one or both sides lack usable evidence for the dimension.
  unknowns: readonly TasteSimilarityDimension[];
  // Reserved for forward compatibility. TS-1 currently provides no positive/negative pair on any
  // single facet, so a v1 result always carries an empty conflict list rather than a fabricated one.
  conflicts: readonly TasteSimilarityDimension[];
  confidenceInputs: TasteSimilarityConfidenceInputs;
  explanationReasonCodes: readonly TasteSimilarityReasonCode[];
};

// `score` exists ONLY on the scored variant. It is not optional-and-undefined on a shared shape:
// a not-scored result has no `score` key at all, so "not scored" can never be read as 0.
export type ScoredTasteSimilarityResult = TasteSimilarityResultBase & {
  status: "scored";
  score: number;
};

export type NotScoredTasteSimilarityResult = TasteSimilarityResultBase & {
  status: "not_scored";
  reason: TasteSimilarityNotScoredReason;
};

export type TasteSimilarityResult = ScoredTasteSimilarityResult | NotScoredTasteSimilarityResult;
