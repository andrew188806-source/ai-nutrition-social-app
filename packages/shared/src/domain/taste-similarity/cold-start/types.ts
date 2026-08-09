import type { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";
import type { TASTE_SIMILARITY_POLICY_VERSION } from "../similarity";
import type { SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION } from "../compatibility";
import type {
  GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,
  RestrictionEligibilityVerdict
} from "../goal-restriction";
import type { TASTE_COMPARISON_BUNDLE_VERSION } from "../comparison";
import type { EVIDENCE_CONFIDENCE_POLICY_VERSION, EvidenceConfidenceBasis } from "../confidence";
import type {
  COLD_START_POLICY_VERSION,
  COLD_START_SIGNAL_FAMILIES,
  ColdStartReasonCodeName
} from "./policy";

// TS-5 — the cold start evidence assessment contract.

export type ColdStartSignalFamily = (typeof COLD_START_SIGNAL_FAMILIES)[number];

export type ColdStartReasonCode = ColdStartReasonCodeName;

// All seven authorities that shaped this assessment, typed against the frozen exported constants.
export type ColdStartVersions = {
  coldStartPolicyVersion: typeof COLD_START_POLICY_VERSION;
  evidenceConfidencePolicyVersion: typeof EVIDENCE_CONFIDENCE_POLICY_VERSION;
  comparisonBundleVersion: typeof TASTE_COMPARISON_BUNDLE_VERSION;
  tastePolicyVersion: typeof TASTE_SIMILARITY_POLICY_VERSION;
  socialContextPolicyVersion: typeof SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION;
  goalRestrictionPolicyVersion: typeof GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION;
  snapshotSchemaVersion: typeof TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
};

// The four canonical taste evidence states.
//
// `comparable` survives degraded sources: if a taste result exists, it exists, and the degradation is
// reported separately through `incompleteSignalFamilies` and the inherited basis. Downgrading a real
// result to `sources_incomplete` because one source was patchy would throw away information the
// frozen layers worked to produce.
//
// The distinction that matters most is between the two unavailable states: `no_comparable_evidence`
// means the sources answered and there is genuinely nothing to compare, while `sources_incomplete`
// means we could not tell. Treating the second as the first would let a transient read failure look
// exactly like a brand-new user.
//
// `unsupported` is a contract incompatibility, NOT a cold-start user.
export type ColdStartTasteEvidenceState =
  | "comparable"
  | "no_comparable_evidence"
  | "sources_incomplete"
  | "unsupported";

// `basis` and `value` exist ONLY on the comparable variant. The value is an informational
// pass-through of the frozen evidence-support index — it is never recomputed, never renamed, and
// never compared against anything.
export type ComparableTasteEvidence = {
  state: "comparable";
  basis: EvidenceConfidenceBasis;
  value: number;
};

export type NonComparableTasteEvidence = {
  state: "no_comparable_evidence" | "sources_incomplete" | "unsupported";
};

export type ColdStartTasteEvidence = ComparableTasteEvidence | NonComparableTasteEvidence;

// Restriction state carried VERBATIM from the frozen layers. Readonly throughout: no cold-start
// state may weaken a verdict, assume safety, supply a default, or attach a number to it.
export type ColdStartRestrictionState = {
  readonly verdict: RestrictionEligibilityVerdict;
  readonly evidencePresentForBoth: boolean;
  readonly unclassifiedPresent: boolean;
  readonly sourceReachableForBoth: boolean;
};

// There is deliberately NO `isColdStart` boolean, no `ready`, no `proceedNormally`, no `canMatch`,
// no aggregate score and no per-user sparsity field. This layer describes evidence state; deciding
// what to do about it belongs to Social Runtime consumer policy, and the shared adapter between them
// is composition only.
//
// `availableSignalFamilies` and `incompleteSignalFamilies` MAY OVERLAP, on purpose: a family can
// carry a usable result and simultaneously rest on a degraded source set, and forcing the two lists
// apart would make that pairing unrepresentable.
export type ColdStartAssessment = {
  versions: ColdStartVersions;
  tasteEvidence: ColdStartTasteEvidence;
  availableSignalFamilies: readonly ColdStartSignalFamily[];
  incompleteSignalFamilies: readonly ColdStartSignalFamily[];
  restrictionState: ColdStartRestrictionState;
  reasonCodes: readonly ColdStartReasonCode[];
};
