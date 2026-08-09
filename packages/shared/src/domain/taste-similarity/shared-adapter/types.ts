import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { TASTE_SIMILARITY_POLICY_VERSION, TasteSimilarityNotScoredReason } from "../similarity";
import type {
  SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION,
  SocialContextNotScoredReason
} from "../compatibility";
import type {
  GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  GoalCompatibilityNotScoredReason,
  RestrictionEligibilityBasis,
  RestrictionEligibilityVerdict
} from "../goal-restriction";
import type { TASTE_COMPARISON_BUNDLE_VERSION, TasteComparisonReasonCode } from "../comparison";
import type {
  EVIDENCE_CONFIDENCE_POLICY_VERSION,
  EvidenceConfidenceBasis,
  EvidenceConfidenceUnavailableReason
} from "../confidence";
import type {
  COLD_START_POLICY_VERSION,
  ColdStartReasonCode,
  ColdStartSignalFamily,
  ColdStartTasteEvidenceState
} from "../cold-start";
import type {
  SHARED_TASTE_ADAPTER_POLICY_VERSION,
  SharedTasteAdapterUnsupportedReason
} from "./policy";

// TS-6 — the shared taste adapter contract.
//
// Every authority that shaped the projection, typed against the frozen exported constants.
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

// The three frozen not-scored vocabularies coincide exactly, so one projected union covers taste,
// each context dimension and goal without widening any of them.
export type ProjectedNotScoredReason =
  | TasteSimilarityNotScoredReason
  | SocialContextNotScoredReason
  | GoalCompatibilityNotScoredReason;

// The minimal score projection. `score` exists only on the scored variant, exactly as every frozen
// layer declares it, so an unscored dimension can never be read as zero.
export type ProjectedScoreResult =
  | { readonly status: "scored"; readonly score: number }
  | { readonly status: "not_scored"; readonly reason: ProjectedNotScoredReason };

// The evidence-support projection, carried through from the frozen confidence layer untouched. It is
// an evidence-support index, never a statement about how the pair would turn out.
export type ProjectedEvidenceConfidence =
  | { readonly status: "available"; readonly value: number; readonly basis: EvidenceConfidenceBasis }
  | { readonly status: "not_available"; readonly reason: EvidenceConfidenceUnavailableReason };

// Three independent facts about taste, kept apart on purpose: how similar the comparable evidence
// was, how much evidence supported that answer, and whether a comparison was possible at all.
// Collapsing any two of them is exactly the confusion the frozen layers were built to prevent.
export type ProjectedTaste = {
  readonly similarity: ProjectedScoreResult;
  readonly evidenceConfidence: ProjectedEvidenceConfidence;
  readonly evidenceState: ColdStartTasteEvidenceState;
};

// Reported side by side. There is no aggregate context figure and no numeric confidence for these
// dimensions — neither exists upstream, and inventing one here would be computing.
export type ProjectedContext = {
  readonly mealPattern: ProjectedScoreResult;
  readonly dining: ProjectedScoreResult;
  readonly socialLogistics: ProjectedScoreResult;
};

// Categorical throughout, carried verbatim, readonly, and carrying no numeric field of any kind. A
// `needs_attention` verdict survives this layer exactly as the frozen layer produced it.
export type ProjectedRestriction = {
  readonly verdict: RestrictionEligibilityVerdict;
  readonly basis: RestrictionEligibilityBasis;
  readonly evidencePresentForBoth: boolean;
  readonly unclassifiedPresent: boolean;
  readonly sourceReachableForBoth: boolean;
};

// Which families carry usable information and which rest on degraded sources. Projected unchanged —
// not reinterpreted as preferred, fallback or ordering families. The two lists may overlap.
export type ProjectedSignalFamilies = {
  readonly availableFamilies: readonly ColdStartSignalFamily[];
  readonly incompleteFamilies: readonly ColdStartSignalFamily[];
};

// Two distinct semantic channels, deliberately not flattened: "why the comparison came out as it
// did" and "why the evidence was as ready as it was" are different questions, and merging them would
// destroy the provenance a consumer needs. Restriction safety is in neither — it keeps its own field.
export type ProjectedReasons = {
  readonly comparison: readonly TasteComparisonReasonCode[];
  readonly evidence: readonly ColdStartReasonCode[];
};

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

// A discriminated failure carrying NO component data at all. If the three inputs did not cohere,
// nothing derived from them can be trusted, and a partially populated failure is precisely the shape
// a caller would end up reading past.
export type UnsupportedSharedTasteResult = {
  readonly versions: SharedTasteAdapterVersions;
  readonly status: "unsupported";
  readonly reason: SharedTasteAdapterUnsupportedReason;
};

// There is deliberately no aggregate score, no global confidence, no readiness or proceed verdict,
// no ordering field, and no embedded upstream bundle. Downstream consumers depend on this shape, not
// on the internal layout of the foundation beneath it.
export type SharedTasteAdapterResult = AdaptedSharedTasteResult | UnsupportedSharedTasteResult;
