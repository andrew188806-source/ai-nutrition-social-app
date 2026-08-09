import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { TASTE_SIMILARITY_POLICY_VERSION } from "../similarity";
import type { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION } from "../compatibility";
import type { GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION } from "../goal-restriction";
import type { TASTE_COMPARISON_BUNDLE_VERSION } from "../comparison";
import type { EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE, EVIDENCE_CONFIDENCE_POLICY_VERSION } from "./policy";

// TS-4 — the evidence confidence result contract.
//
// Every authority that shaped this result, stated explicitly and typed against the frozen exported
// constants so a component bump changes this type rather than passing through unnoticed.
export type EvidenceConfidenceVersions = {
  evidenceConfidencePolicyVersion: typeof EVIDENCE_CONFIDENCE_POLICY_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
  tastePolicyVersion: typeof TASTE_SIMILARITY_POLICY_VERSION;
  socialContextPolicyVersion: typeof SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION;
  goalRestrictionPolicyVersion: typeof GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION;
  comparisonBundleVersion: typeof TASTE_COMPARISON_BUNDLE_VERSION;
};

// Closed explanatory vocabulary, ordered by the policy's precedence list. Explanatory only: the basis
// never participates in computing the value.
export type EvidenceConfidenceBasis = (typeof EVIDENCE_CONFIDENCE_BASIS_PRECEDENCE)[number];

export type EvidenceConfidenceUnavailableReason =
  // The frozen component this confidence describes produced no comparable result, so there is
  // nothing for evidence support to be support FOR.
  | "component_not_scored"
  // The snapshot pair was never interpretable.
  | "unsupported_snapshot_schema";

// The two parameter-free ratios behind the value, reported so a caller can see WHY it is what it is.
// Counts of families and sources — never evidence items, never an evidence value.
export type TasteEvidenceSupportInputs = {
  comparableFamilyCount: number;
  supportedFamilyCount: number;
  completeRelevantSourceCount: number;
  relevantSourceCount: number;
};

// `value` exists ONLY on the available variant. It is not optional-and-undefined on a shared shape,
// so an unavailable result can never be misread as zero support — and "no evidence at all" is
// reported as a STATUS rather than as the number 0, which would read as "we are confident there is
// no similarity".
export type AvailableTasteEvidenceConfidenceResult = {
  status: "available";
  value: number;
  basis: EvidenceConfidenceBasis;
  inputs: TasteEvidenceSupportInputs;
};

export type NotAvailableEvidenceConfidenceResult = {
  status: "not_available";
  reason: EvidenceConfidenceUnavailableReason;
};

export type TasteEvidenceConfidenceResult =
  | AvailableTasteEvidenceConfidenceResult
  | NotAvailableEvidenceConfidenceResult;

// Non-numeric evidence state for the four single-facet dimensions.
//
// These carry NO value on purpose. Each draws on one facet from one source, so whenever they are
// scored both users supplied the only evidence that can exist and every parameter-free measure
// evaluates to exactly 1. A number that is always 1 when present carries nothing the status does not
// already carry, and shipping it would invite "dining confidence is 100%".
export type AvailableEvidenceStateResult = {
  status: "available";
  basis: EvidenceConfidenceBasis;
};

export type EvidenceStateResult = AvailableEvidenceStateResult | NotAvailableEvidenceConfidenceResult;

// Restriction evidence is CATEGORICAL and carries no numeric field of any kind — no value, no score,
// no index, no assurance figure.
//
// The frozen enforcement ladder has two rungs, `soft` and `unclassified`, and `unclassified` means
// the severity could not be classified at all. Attaching a number to that invites reading it as
// "mostly fine", and the failure mode is someone eating something they cannot eat. The
// `needs_attention` verdict TS-3D produces is carried through untouched and is never softened here.
export type RestrictionEvidenceState = {
  evidencePresentForBoth: boolean;
  unclassifiedPresent: boolean;
  sourceReachableForBoth: boolean;
};

// The dimensions are reported side by side. There is deliberately no aggregate: no global
// confidence, no combined index, no overall figure. Trading "taste is well evidenced" against
// "payment preference is unknown" is a consumer decision, and no evidence here supports making it.
export type EvidenceConfidenceBundle = {
  versions: EvidenceConfidenceVersions;
  taste: TasteEvidenceConfidenceResult;
  mealPattern: EvidenceStateResult;
  dining: EvidenceStateResult;
  socialLogistics: EvidenceStateResult;
  goal: EvidenceStateResult;
  restrictionEvidence: RestrictionEvidenceState;
};
