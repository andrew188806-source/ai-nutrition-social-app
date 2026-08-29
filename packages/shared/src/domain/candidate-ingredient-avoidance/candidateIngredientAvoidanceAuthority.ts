export const CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID =
  "tastkind-ingredient-avoidance-v1" as const;
export const CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION = 1 as const;
export const PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID =
  "private-ingredient-avoidance-v1" as const;
export const PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION = 1 as const;
export const PRIVATE_INGREDIENT_AVOIDANCE_NORMALIZATION_POLICY_ID =
  "private-ingredient-avoidance-normalization-v1" as const;
export const PRIVATE_INGREDIENT_AVOIDANCE_NORMALIZATION_POLICY_VERSION = 1 as const;

export const CANDIDATE_INGREDIENT_AVOIDANCE_VALUES = Object.freeze([
  Object.freeze({ key: "pork", zhTWLabel: "豬肉／豬來源成分" }),
  Object.freeze({ key: "beef", zhTWLabel: "牛肉／牛來源成分" }),
  Object.freeze({ key: "coriander", zhTWLabel: "香菜" })
] as const);

export type CandidateIngredientAvoidanceKey =
  (typeof CANDIDATE_INGREDIENT_AVOIDANCE_VALUES)[number]["key"];
export type CandidateIngredientAvoidanceFactDomain = "ingredient_avoidance_content";
export type CandidateIngredientAvoidanceCoverageState = "unknown" | "partial" | "complete";
export type CandidateIngredientAvoidanceProvenance =
  | "restaurant_verified"
  | "admin_verified"
  | "provider_verified";

export const CANDIDATE_INGREDIENT_AVOIDANCE_PROVENANCE_VALUES = Object.freeze([
  "restaurant_verified",
  "admin_verified",
  "provider_verified"
] as const);

export const CANDIDATE_INGREDIENT_AVOIDANCE_COVERAGE_STATES = Object.freeze([
  "unknown",
  "partial",
  "complete"
] as const);

export type CandidateIngredientAvoidanceFact = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  taxonomyId: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID;
  taxonomyVersion: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION;
  factDomain: CandidateIngredientAvoidanceFactDomain;
  ingredientAvoidanceKey: CandidateIngredientAvoidanceKey;
}>;

export type CandidateIngredientAvoidanceCoverage = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  taxonomyId: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID;
  taxonomyVersion: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION;
  factDomain: CandidateIngredientAvoidanceFactDomain;
  coverageState: CandidateIngredientAvoidanceCoverageState;
}>;

export type PrivateIngredientAvoidanceNormalizationResult =
  | Readonly<{
      state: "mapped";
      sourceVocabularyId: typeof PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID;
      sourceVocabularyVersion: typeof PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION;
      normalizedSourceValue: CandidateIngredientAvoidanceKey;
      targetTaxonomyId: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID;
      targetTaxonomyVersion: typeof CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION;
      targetIngredientAvoidanceKey: CandidateIngredientAvoidanceKey;
    }>
  | Readonly<{
      state: "unmapped";
      sourceVocabularyId: string;
      sourceVocabularyVersion: number;
      normalizedSourceValue: string;
    }>
  | Readonly<{
      state: "source_unknown";
      reason: "normalization_policy_unknown" | "source_vocabulary_unknown";
      sourceVocabularyId: string;
      sourceVocabularyVersion: number;
      normalizedSourceValue: string;
    }>;

const INGREDIENT_AVOIDANCE_KEY_SET: ReadonlySet<string> = new Set(
  CANDIDATE_INGREDIENT_AVOIDANCE_VALUES.map(({ key }) => key)
);

export function normalizeExactIngredientAvoidanceSourceValue(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("Ingredient-avoidance source value must be a string.");
  }
  const normalized = value.normalize("NFC").trim();
  if (!normalized) {
    throw new TypeError("Ingredient-avoidance source value must not be empty.");
  }
  return normalized;
}

export function normalizePrivateIngredientAvoidance(input: Readonly<{
  normalizationPolicyId: string;
  normalizationPolicyVersion: number;
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  sourceValue: string;
}>): PrivateIngredientAvoidanceNormalizationResult {
  const normalizedSourceValue = normalizeExactIngredientAvoidanceSourceValue(input.sourceValue);
  const base = Object.freeze({
    sourceVocabularyId: input.sourceVocabularyId,
    sourceVocabularyVersion: input.sourceVocabularyVersion,
    normalizedSourceValue
  });
  if (input.sourceVocabularyId !== PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID
    || input.sourceVocabularyVersion !== PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION) {
    return Object.freeze({ ...base, state: "source_unknown", reason: "source_vocabulary_unknown" });
  }
  if (input.normalizationPolicyId !== PRIVATE_INGREDIENT_AVOIDANCE_NORMALIZATION_POLICY_ID
    || input.normalizationPolicyVersion !== PRIVATE_INGREDIENT_AVOIDANCE_NORMALIZATION_POLICY_VERSION) {
    return Object.freeze({ ...base, state: "source_unknown", reason: "normalization_policy_unknown" });
  }
  if (!isCandidateIngredientAvoidanceKey(normalizedSourceValue)) {
    return Object.freeze({ ...base, state: "unmapped" });
  }
  return Object.freeze({
    state: "mapped",
    sourceVocabularyId: PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID,
    sourceVocabularyVersion: PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION,
    normalizedSourceValue,
    targetTaxonomyId: CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
    targetTaxonomyVersion: CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_VERSION,
    targetIngredientAvoidanceKey: normalizedSourceValue
  });
}

export function isCandidateIngredientAvoidanceKey(
  value: string
): value is CandidateIngredientAvoidanceKey {
  return INGREDIENT_AVOIDANCE_KEY_SET.has(value);
}

export function ingredientAvoidanceProvenanceCanDeclareCompleteCoverage(
  provenance: CandidateIngredientAvoidanceProvenance
): boolean {
  return provenance === "restaurant_verified" || provenance === "admin_verified";
}

export function ingredientAvoidanceCoverageHasCompleteVocabularyAssessment(
  state: CandidateIngredientAvoidanceCoverageState
): boolean {
  return state === "complete";
}
