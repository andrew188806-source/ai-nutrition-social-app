import {
  CANDIDATE_ALLERGEN_TAXONOMY_ID,
  CANDIDATE_ALLERGEN_TAXONOMY_VERSION,
  isCandidateAllergenKey,
  type CandidateAllergenCoverageState,
  type CandidateAllergenKey
} from "./candidateAllergenAuthority";

export const ALLERGY_CONTENT_ELIGIBILITY_POLICY_ID =
  "tastkind.allergy.content_eligibility" as const;
export const ALLERGY_CONTENT_ELIGIBILITY_POLICY_VERSION = 1 as const;

export type AllergyUserState =
  | Readonly<{ state: "no_active_allergies" }>
  | Readonly<{ state: "active_allergies"; allergenKeys: readonly CandidateAllergenKey[] }>
  | Readonly<{ state: "unresolved_user_allergy" }>;

export type AllergyCandidateEligibilityState =
  | "known_allergen_conflict"
  | "allergen_coverage_unknown"
  | "allergen_coverage_partial"
  | "complete_no_known_conflict";

export type AllergyContentEligibilityPolicy = Readonly<{
  policyId: typeof ALLERGY_CONTENT_ELIGIBILITY_POLICY_ID;
  policyVersion: typeof ALLERGY_CONTENT_ELIGIBILITY_POLICY_VERSION;
  taxonomyId: typeof CANDIDATE_ALLERGEN_TAXONOMY_ID;
  taxonomyVersion: typeof CANDIDATE_ALLERGEN_TAXONOMY_VERSION;
  knownConflict: "exclude";
  unknownCoverage: "exclude";
  partialCoverage: "exclude";
  completeNoKnownConflict: "eligible";
}>;

export const DEFAULT_ALLERGY_CONTENT_ELIGIBILITY_POLICY: AllergyContentEligibilityPolicy =
  Object.freeze({
    policyId: ALLERGY_CONTENT_ELIGIBILITY_POLICY_ID,
    policyVersion: ALLERGY_CONTENT_ELIGIBILITY_POLICY_VERSION,
    taxonomyId: CANDIDATE_ALLERGEN_TAXONOMY_ID,
    taxonomyVersion: CANDIDATE_ALLERGEN_TAXONOMY_VERSION,
    knownConflict: "exclude",
    unknownCoverage: "exclude",
    partialCoverage: "exclude",
    completeNoKnownConflict: "eligible"
  });

export type AllergyContentEligibilityPolicyProvider = Readonly<{
  getActiveAllergyContentEligibilityPolicy(): AllergyContentEligibilityPolicy;
}>;

export function createDefaultAllergyContentEligibilityPolicyProvider():
AllergyContentEligibilityPolicyProvider {
  return Object.freeze({
    getActiveAllergyContentEligibilityPolicy: () => DEFAULT_ALLERGY_CONTENT_ELIGIBILITY_POLICY
  });
}

export function isAllergyContentEligibilityPolicy(
  value: unknown
): value is AllergyContentEligibilityPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return policy.policyId === ALLERGY_CONTENT_ELIGIBILITY_POLICY_ID
    && policy.policyVersion === ALLERGY_CONTENT_ELIGIBILITY_POLICY_VERSION
    && policy.taxonomyId === CANDIDATE_ALLERGEN_TAXONOMY_ID
    && policy.taxonomyVersion === CANDIDATE_ALLERGEN_TAXONOMY_VERSION
    && policy.knownConflict === "exclude"
    && policy.unknownCoverage === "exclude"
    && policy.partialCoverage === "exclude"
    && policy.completeNoKnownConflict === "eligible";
}

export function resolveAllergyUserState(input: Readonly<{
  allergenKeys: readonly CandidateAllergenKey[];
  unresolvedSelectionCount: number;
}>): AllergyUserState {
  if (!Number.isInteger(input.unresolvedSelectionCount) || input.unresolvedSelectionCount < 0
    || !Array.isArray(input.allergenKeys)
    || input.allergenKeys.some((key) => !isCandidateAllergenKey(key))
    || new Set(input.allergenKeys).size !== input.allergenKeys.length) {
    throw new TypeError("Invalid governed Allergy settings.");
  }
  if (input.unresolvedSelectionCount > 0) {
    return Object.freeze({ state: "unresolved_user_allergy" });
  }
  if (input.allergenKeys.length === 0) {
    return Object.freeze({ state: "no_active_allergies" });
  }
  return Object.freeze({
    state: "active_allergies",
    allergenKeys: Object.freeze([...input.allergenKeys])
  });
}

export function evaluateAllergyCandidateEligibility(input: Readonly<{
  activeAllergenKeys: readonly CandidateAllergenKey[];
  knownPresentAllergenKeys: readonly CandidateAllergenKey[];
  coverageState: CandidateAllergenCoverageState;
  policy: AllergyContentEligibilityPolicy;
}>): Readonly<{ state: AllergyCandidateEligibilityState; eligible: boolean }> {
  if (!isAllergyContentEligibilityPolicy(input.policy)) {
    throw new TypeError("Invalid Allergy content eligibility policy.");
  }
  if (input.activeAllergenKeys.length === 0
    || input.activeAllergenKeys.some((key) => !isCandidateAllergenKey(key))
    || input.knownPresentAllergenKeys.some((key) => !isCandidateAllergenKey(key))
    || !["unknown", "partial", "complete"].includes(input.coverageState)) {
    throw new TypeError("Invalid Allergy eligibility evidence.");
  }
  const active = new Set(input.activeAllergenKeys);
  if (input.knownPresentAllergenKeys.some((key) => active.has(key))) {
    return Object.freeze({ state: "known_allergen_conflict", eligible: false });
  }
  if (input.coverageState === "unknown") {
    return Object.freeze({ state: "allergen_coverage_unknown", eligible: false });
  }
  if (input.coverageState === "partial") {
    return Object.freeze({ state: "allergen_coverage_partial", eligible: false });
  }
  return Object.freeze({ state: "complete_no_known_conflict", eligible: true });
}
