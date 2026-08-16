// GENERATED - DO NOT EDIT.
//
// Source authority remains canonical packages/shared/src/domain/taste-similarity/**.
// Regenerate with: node scripts/build-social-taste-types-bridge.mjs
//
// Flattened, types-only Edge deployability bridge for SharedTasteAdapterResult. Contains no import
// statement, no runtime statement and no business algorithm: the Supabase Edge bundler resolves
// specifiers literally, so removing the module-resolution surface entirely is what makes the SR-2D
// Edge function deployable without altering any canonical Taste or Social implementation byte.
//
// Canonical source closure:
//   packages/shared/src/domain/taste-similarity/cold-start/policy.ts
//   packages/shared/src/domain/taste-similarity/cold-start/types.ts
//   packages/shared/src/domain/taste-similarity/comparison/policy.ts
//   packages/shared/src/domain/taste-similarity/comparison/types.ts
//   packages/shared/src/domain/taste-similarity/compatibility/policy.ts
//   packages/shared/src/domain/taste-similarity/compatibility/reasonCodes.ts
//   packages/shared/src/domain/taste-similarity/compatibility/types.ts
//   packages/shared/src/domain/taste-similarity/confidence/policy.ts
//   packages/shared/src/domain/taste-similarity/confidence/types.ts
//   packages/shared/src/domain/taste-similarity/goal-restriction/policy.ts
//   packages/shared/src/domain/taste-similarity/goal-restriction/reasonCodes.ts
//   packages/shared/src/domain/taste-similarity/goal-restriction/types.ts
//   packages/shared/src/domain/taste-similarity/shared-adapter/policy.ts
//   packages/shared/src/domain/taste-similarity/shared-adapter/types.ts
//   packages/shared/src/domain/taste-similarity/similarity/policy.ts
//   packages/shared/src/domain/taste-similarity/similarity/reasonCodes.ts
//   packages/shared/src/domain/taste-similarity/similarity/types.ts
//   packages/shared/src/domain/taste-similarity/snapshot.ts

declare const COLD_START_POLICY_VERSION: "cold-start-policy-v1";
declare const COLD_START_REASON_CODES: readonly ["no_comparable_taste_evidence", "limited_taste_evidence", "incomplete_taste_sources", "incomplete_history", "context_only_evidence", "goal_only_evidence", "no_comparable_evidence", "unsupported_schema"];
declare const COLD_START_SIGNAL_FAMILIES: readonly ["taste", "meal_pattern", "dining", "social_logistics", "goal", "restriction"];
declare const EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE: readonly ["source_unavailable", "incomplete_history", "limited_evidence_coverage", "strong_explicit_and_behavioral_evidence", "explicit_evidence_only", "behavioral_evidence_only"];
declare const EVIDENCE_CONFIDENCE_POLICY_VERSION: "evidence-confidence-v1";
declare const GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION: "goal-restriction-compatibility-v1";
declare const GOAL_RESTRICTION_REASON_CODES: readonly ["shared_goal_label", "different_goal_label", "limited_goal_evidence", "shared_soft_restriction", "restriction_requires_attention", "restriction_evidence_unknown"];
declare const RESTRICTION_ELIGIBILITY_VERDICTS: readonly ["compatible", "needs_attention", "unknown"];
declare const SHARED_TASTE_ADAPTER_POLICY_VERSION: "shared-taste-adapter-v1";
declare const SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS: readonly ["unsupported_snapshot_schema", "policy_version_mismatch"];
declare const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION: "social-context-compatibility-v1";
declare const SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES: readonly ["shared_meal_type_preference", "similar_dining_style", "compatible_payment_preference", "limited_context_evidence"];
declare const TASTE_COMPARISON_BUNDLE_VERSION: "taste-comparison-bundle-v1";
declare const TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION: "taste-profile-snapshot-v1";
declare const TASTE_SIMILARITY_POLICY_VERSION: "taste-similarity-v1.1";
declare const TASTE_SIMILARITY_REASON_CODES: readonly ["shared_cuisine_preference", "shared_flavor_avoidance", "shared_spice_preference", "shared_favorite_restaurant", "shared_favorite_menu_item", "shared_repeated_restaurant_consumption", "shared_repeated_menu_item_consumption", "limited_evidence"];

export type AdaptedSharedTasteResult = {
  readonly versions: SharedTasteAdapterVersions;
  readonly status: "adapted";
  readonly taste: ProjectedTaste;
  readonly context: ProjectedContext;
  readonly goal: ProjectedScoreResult;
  readonly restriction: ProjectedRestriction;
  readonly signals: ProjectedSignalFamilies;
  readonly reasons: ProjectedReasons;
};

export type ColdStartReasonCode = ColdStartReasonCodeName;

export type ColdStartReasonCodeName = (typeof COLD_START_REASON_CODES)[number];

export type ColdStartSignalFamily = (typeof COLD_START_SIGNAL_FAMILIES)[number];

export type ColdStartTasteEvidenceState =
  | "comparable"
  | "no_comparable_evidence"
  | "sources_incomplete"
  | "unsupported";

export type EvidenceConfidenceBasis = (typeof EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE)[number];

export type EvidenceConfidenceUnavailableReason =
  // The frozen component this confidence describes produced no comparable result, so there is
  // nothing for evidence support to be support FOR.
  | "component_not_scored"
  // The snapshot pair was never interpretable.
  | "unsupported_snapshot_schema";

export type GoalCompatibilityNotScoredReason =
  // Neither user has an eligible goal label.
  | "no_comparable_evidence"
  // Exactly one side has one. One-sided evidence can never produce agreement and must not be
  // reported as disagreement either.
  | "insufficient_evidence"
  // The snapshot pair does not carry the schema version this policy understands.
  | "unsupported_snapshot_schema";

export type GoalRestrictionReasonCode = (typeof GOAL_RESTRICTION_REASON_CODES)[number];

export type ProjectedContext = {
  readonly mealPattern: ProjectedScoreResult;
  readonly dining: ProjectedScoreResult;
  readonly socialLogistics: ProjectedScoreResult;
};

export type ProjectedEvidenceConfidence =
  | { readonly status: "available"; readonly value: number; readonly basis: EvidenceConfidenceBasis }
  | { readonly status: "not_available"; readonly reason: EvidenceConfidenceUnavailableReason };

export type ProjectedNotScoredReason =
  | TasteSimilarityNotScoredReason
  | SocialContextNotScoredReason
  | GoalCompatibilityNotScoredReason;

export type ProjectedReasons = {
  readonly comparison: readonly TasteComparisonReasonCode[];
  readonly evidence: readonly ColdStartReasonCode[];
};

export type ProjectedRestriction = {
  readonly verdict: RestrictionEligibilityVerdict;
  readonly basis: RestrictionEligibilityBasis;
  readonly evidencePresentForBoth: boolean;
  readonly unclassifiedPresent: boolean;
  readonly sourceReachableForBoth: boolean;
};

export type ProjectedScoreResult =
  | { readonly status: "scored"; readonly score: number }
  | { readonly status: "not_scored"; readonly reason: ProjectedNotScoredReason };

export type ProjectedSignalFamilies = {
  readonly availableFamilies: readonly ColdStartSignalFamily[];
  readonly incompleteFamilies: readonly ColdStartSignalFamily[];
};

export type ProjectedTaste = {
  readonly similarity: ProjectedScoreResult;
  readonly evidenceConfidence: ProjectedEvidenceConfidence;
  readonly evidenceState: ColdStartTasteEvidenceState;
};

export type RestrictionEligibilityBasis =
  | "no_restriction_evidence"
  | "soft_preferences_only"
  | "unclassified_enforcement_present"
  | "unsupported_snapshot_schema";

export type RestrictionEligibilityVerdict = (typeof RESTRICTION_ELIGIBILITY_VERDICTS)[number];

export type SharedTasteAdapterResult = AdaptedSharedTasteResult | UnsupportedSharedTasteResult;

export type SharedTasteAdapterUnsupportedReason = (typeof SHARED_TASTE_ADAPTER_UNSUPPORTED_REASONS)[number];

export type SharedTasteAdapterVersions = {
  sharedAdapterPolicyVersion: typeof SHARED_TASTE_ADAPTER_POLICY_VERSION;
  coldStartPolicyVersion: typeof COLD_START_POLICY_VERSION;
  evidenceConfidencePolicyVersion: typeof EVIDENCE_CONFIDENCE_POLICY_VERSION;
  comparisonBundleVersion: typeof TASTE_COMPARISON_BUNDLE_VERSION;
  tastePolicyVersion: typeof TASTE_SIMILARITY_POLICY_VERSION;
  socialContextPolicyVersion: typeof SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION;
  goalRestrictionPolicyVersion: typeof GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
};

export type SocialContextCompatibilityReasonCode =
  (typeof SOCIAL_CONTEXT_COMPATIBILITY_REASON_CODES)[number];

export type SocialContextNotScoredReason =
  // Neither user supplied evidence for this dimension.
  | "no_comparable_evidence"
  // Exactly one side supplied evidence. One-sided evidence can never produce agreement and must not
  // be reported as disagreement either.
  | "insufficient_evidence"
  // The snapshot pair does not carry the schema version this policy understands.
  | "unsupported_snapshot_schema";

export type TasteComparisonReasonCode =
  | TasteSimilarityReasonCode
  | SocialContextCompatibilityReasonCode
  | GoalRestrictionReasonCode;

export type TasteSimilarityNotScoredReason =
  // Neither user contributed evidence to any v1 dimension, so there is nothing to compare.
  | "no_comparable_evidence"
  // At least one side has no v1 food-taste evidence at all: a one-sided profile can never produce
  // agreement, and must not be reported as disagreement either.
  | "insufficient_evidence"
  // The snapshot pair does not carry the schema version this policy understands.
  | "unsupported_snapshot_schema";

export type TasteSimilarityReasonCode = (typeof TASTE_SIMILARITY_REASON_CODES)[number];

export type UnsupportedSharedTasteResult = {
  readonly versions: SharedTasteAdapterVersions;
  readonly status: "unsupported";
  readonly reason: SharedTasteAdapterUnsupportedReason;
};
