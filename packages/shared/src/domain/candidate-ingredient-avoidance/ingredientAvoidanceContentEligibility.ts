import {
  CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
  CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION,
  isCandidateIngredientAvoidanceKey,
  type CandidateIngredientAvoidanceCoverageState,
  type CandidateIngredientAvoidanceKey
} from "./candidateIngredientAvoidanceAuthority";

export const INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_ID =
  "tastkind.ingredient_avoidance.content_eligibility" as const;
export const INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_VERSION = 1 as const;

export type IngredientAvoidanceUserAuthorityState =
  | Readonly<{ state: "no_active_governed_avoidance" }>
  | Readonly<{
      state: "active_governed_avoidance";
      ingredientAvoidanceKeys: readonly CandidateIngredientAvoidanceKey[];
    }>
  | Readonly<{ state: "unresolved_governed_avoidance" }>
  | Readonly<{ state: "authority_unavailable" }>;

export type IngredientAvoidanceCandidateEligibilityState =
  | "known_ingredient_avoidance_conflict"
  | "ingredient_avoidance_coverage_unknown"
  | "ingredient_avoidance_coverage_partial"
  | "complete_no_known_ingredient_avoidance_conflict";

export type IngredientAvoidanceContentEligibilityPolicy = Readonly<{
  policyId: typeof INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_ID;
  policyVersion: typeof INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_VERSION;
  taxonomyId: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID;
  taxonomyVersion: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION;
  knownConflict: "exclude";
  unknownCoverage: "exclude";
  partialCoverage: "exclude";
  completeNoKnownConflict: "eligible";
}>;

export const DEFAULT_INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY:
IngredientAvoidanceContentEligibilityPolicy = Object.freeze({
  policyId: INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_ID,
  policyVersion: INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_VERSION,
  taxonomyId: CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
  taxonomyVersion: CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION,
  knownConflict: "exclude",
  unknownCoverage: "exclude",
  partialCoverage: "exclude",
  completeNoKnownConflict: "eligible"
});

export type IngredientAvoidanceContentEligibilityPolicyProvider = Readonly<{
  getActiveIngredientAvoidanceContentEligibilityPolicy():
  IngredientAvoidanceContentEligibilityPolicy;
}>;

export function createDefaultIngredientAvoidanceContentEligibilityPolicyProvider():
IngredientAvoidanceContentEligibilityPolicyProvider {
  return Object.freeze({
    getActiveIngredientAvoidanceContentEligibilityPolicy: () =>
      DEFAULT_INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY
  });
}

export function isIngredientAvoidanceContentEligibilityPolicy(
  value: unknown
): value is IngredientAvoidanceContentEligibilityPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return policy.policyId === INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_ID
    && policy.policyVersion === INGREDIENT_AVOIDANCE_CONTENT_ELIGIBILITY_POLICY_VERSION
    && policy.taxonomyId === CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID
    && policy.taxonomyVersion === CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION
    && policy.knownConflict === "exclude"
    && policy.unknownCoverage === "exclude"
    && policy.partialCoverage === "exclude"
    && policy.completeNoKnownConflict === "eligible";
}

export function resolveIngredientAvoidanceUserAuthorityState(input:
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "available";
      ingredientAvoidanceKeys: readonly CandidateIngredientAvoidanceKey[];
      unresolvedSelectionCount: number;
    }>
): IngredientAvoidanceUserAuthorityState {
  if (input.status === "unavailable") {
    return Object.freeze({ state: "authority_unavailable" });
  }
  if (!Number.isInteger(input.unresolvedSelectionCount) || input.unresolvedSelectionCount < 0
    || !Array.isArray(input.ingredientAvoidanceKeys)
    || input.ingredientAvoidanceKeys.some((key) => !isCandidateIngredientAvoidanceKey(key))
    || new Set(input.ingredientAvoidanceKeys).size !== input.ingredientAvoidanceKeys.length) {
    throw new TypeError("Invalid governed Ingredient Avoidance settings.");
  }
  if (input.unresolvedSelectionCount > 0) {
    return Object.freeze({ state: "unresolved_governed_avoidance" });
  }
  if (input.ingredientAvoidanceKeys.length === 0) {
    return Object.freeze({ state: "no_active_governed_avoidance" });
  }
  return Object.freeze({
    state: "active_governed_avoidance",
    ingredientAvoidanceKeys: Object.freeze([...input.ingredientAvoidanceKeys])
  });
}

export function evaluateIngredientAvoidanceCandidateEligibility(input: Readonly<{
  activeIngredientAvoidanceKeys: readonly CandidateIngredientAvoidanceKey[];
  knownPresentIngredientAvoidanceKeys: readonly CandidateIngredientAvoidanceKey[];
  coverageState: CandidateIngredientAvoidanceCoverageState;
  policy: IngredientAvoidanceContentEligibilityPolicy;
}>): Readonly<{ state: IngredientAvoidanceCandidateEligibilityState; eligible: boolean }> {
  if (!isIngredientAvoidanceContentEligibilityPolicy(input.policy)) {
    throw new TypeError("Invalid Ingredient Avoidance content eligibility policy.");
  }
  if (input.activeIngredientAvoidanceKeys.length === 0
    || input.activeIngredientAvoidanceKeys.some((key) => !isCandidateIngredientAvoidanceKey(key))
    || new Set(input.activeIngredientAvoidanceKeys).size !== input.activeIngredientAvoidanceKeys.length
    || input.knownPresentIngredientAvoidanceKeys.some((key) => !isCandidateIngredientAvoidanceKey(key))
    || !["unknown", "partial", "complete"].includes(input.coverageState)) {
    throw new TypeError("Invalid Ingredient Avoidance eligibility evidence.");
  }
  const active = new Set(input.activeIngredientAvoidanceKeys);
  if (input.knownPresentIngredientAvoidanceKeys.some((key) => active.has(key))) {
    return Object.freeze({ state: "known_ingredient_avoidance_conflict", eligible: false });
  }
  if (input.coverageState === "unknown") {
    return Object.freeze({ state: "ingredient_avoidance_coverage_unknown", eligible: false });
  }
  if (input.coverageState === "partial") {
    return Object.freeze({ state: "ingredient_avoidance_coverage_partial", eligible: false });
  }
  return Object.freeze({
    state: "complete_no_known_ingredient_avoidance_conflict",
    eligible: true
  });
}
