export const CANDIDATE_ALLERGEN_TAXONOMY_ID = "tastkind-allergen-tw-v1" as const;
export const CANDIDATE_ALLERGEN_TAXONOMY_VERSION = 1 as const;
export const PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID = "private-restriction-allergen-v1" as const;
export const PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_VERSION = 1 as const;
export const PRIVATE_RESTRICTION_ALLERGEN_NORMALIZATION_POLICY_ID =
  "private-restriction-allergen-normalization-v1" as const;
export const PRIVATE_RESTRICTION_ALLERGEN_NORMALIZATION_POLICY_VERSION = 1 as const;
export const LEGACY_MENU_ALLERGEN_SOURCE_VOCABULARY_ID = "legacy-menu-items-allergens-v1" as const;
export const LEGACY_MENU_ALLERGEN_SOURCE_VOCABULARY_VERSION = 1 as const;

export const CANDIDATE_ALLERGEN_VALUES = Object.freeze([
  Object.freeze({ key: "crustacean", zhTWLabel: "甲殼類" }),
  Object.freeze({ key: "mango", zhTWLabel: "芒果" }),
  Object.freeze({ key: "peanut", zhTWLabel: "花生" }),
  Object.freeze({ key: "milk", zhTWLabel: "牛奶／羊奶" }),
  Object.freeze({ key: "egg", zhTWLabel: "蛋" }),
  Object.freeze({ key: "tree_nut", zhTWLabel: "堅果類" }),
  Object.freeze({ key: "sesame", zhTWLabel: "芝麻" }),
  Object.freeze({ key: "gluten_containing_cereal", zhTWLabel: "含麩質之穀物" }),
  Object.freeze({ key: "soy", zhTWLabel: "大豆" }),
  Object.freeze({ key: "fish", zhTWLabel: "魚類" }),
  Object.freeze({ key: "sulfites_ge_10mg_per_kg", zhTWLabel: "亞硫酸鹽（SO₂ ≥ 10 mg/kg）" })
] as const);

export type CandidateAllergenKey = (typeof CANDIDATE_ALLERGEN_VALUES)[number]["key"];
export type CandidateAllergenFactDomain = "allergen_content";
export type CandidateAllergenCoverageState = "unknown" | "partial" | "complete";
export type CandidateAllergenProvenance =
  | "restaurant_verified"
  | "admin_verified"
  | "provider_verified";

export const CANDIDATE_ALLERGEN_PROVENANCE_VALUES = Object.freeze([
  "restaurant_verified",
  "admin_verified",
  "provider_verified"
] as const);

export const CANDIDATE_ALLERGEN_COVERAGE_STATES = Object.freeze([
  "unknown",
  "partial",
  "complete"
] as const);

export type CandidateAllergenFact = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  taxonomyId: typeof CANDIDATE_ALLERGEN_TAXONOMY_ID;
  taxonomyVersion: typeof CANDIDATE_ALLERGEN_TAXONOMY_VERSION;
  factDomain: CandidateAllergenFactDomain;
  allergenKey: CandidateAllergenKey;
}>;

export type CandidateAllergenCoverage = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  taxonomyId: typeof CANDIDATE_ALLERGEN_TAXONOMY_ID;
  taxonomyVersion: typeof CANDIDATE_ALLERGEN_TAXONOMY_VERSION;
  factDomain: CandidateAllergenFactDomain;
  coverageState: CandidateAllergenCoverageState;
}>;

export type PrivateRestrictionAllergenNormalizationState =
  | "mapped"
  | "unmapped"
  | "source_unknown"
  | "facet_disabled";

type NormalizationBase = Readonly<{
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  normalizedSourceValue: string;
}>;

export type PrivateRestrictionAllergenNormalizationResult =
  | (NormalizationBase & Readonly<{
      state: "mapped";
      targetTaxonomyId: typeof CANDIDATE_ALLERGEN_TAXONOMY_ID;
      targetTaxonomyVersion: typeof CANDIDATE_ALLERGEN_TAXONOMY_VERSION;
      targetAllergenKey: CandidateAllergenKey;
    }>)
  | (NormalizationBase & Readonly<{ state: "unmapped" }>)
  | (NormalizationBase & Readonly<{
      state: "source_unknown";
      reason: "normalization_policy_unknown" | "source_vocabulary_unknown";
    }>)
  | (NormalizationBase & Readonly<{ state: "facet_disabled" }>);

export type LegacyCandidateAllergenNormalizationResult =
  | Readonly<{
      state: "mapped";
      normalizedSourceValue: string;
      targetAllergenKey: CandidateAllergenKey;
    }>
  | Readonly<{ state: "unmapped"; normalizedSourceValue: string }>;

const ALLERGEN_KEY_SET: ReadonlySet<string> = new Set(CANDIDATE_ALLERGEN_VALUES.map(({ key }) => key));
const PRIVATE_ALIASES: ReadonlyMap<string, CandidateAllergenKey> = new Map(
  CANDIDATE_ALLERGEN_VALUES.flatMap(({ key, zhTWLabel }) => [[key, key], [zhTWLabel, key]] as const)
);
const LEGACY_RAW_ALIASES: ReadonlyMap<string, CandidateAllergenKey> = new Map([
  ["fish", "fish"],
  ["soy", "soy"],
  ["egg", "egg"],
  ["wheat", "gluten_containing_cereal"],
  ["peanut", "peanut"]
]);

export function normalizeExactAllergenSourceValue(value: string): string {
  if (typeof value !== "string") throw new TypeError("Allergen source value must be a string.");
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new TypeError("Allergen source value must not be empty.");
  return normalized;
}

export function normalizePrivateRestrictionAllergen(input: Readonly<{
  normalizationPolicyId: string;
  normalizationPolicyVersion: number;
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  sourceValue: string;
  allergenFacetEnabled: boolean;
}>): PrivateRestrictionAllergenNormalizationResult {
  const normalizedSourceValue = normalizeExactAllergenSourceValue(input.sourceValue);
  const base = Object.freeze({
    sourceVocabularyId: input.sourceVocabularyId,
    sourceVocabularyVersion: input.sourceVocabularyVersion,
    normalizedSourceValue
  });
  if (!input.allergenFacetEnabled) return Object.freeze({ ...base, state: "facet_disabled" });
  if (input.sourceVocabularyId !== PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID
    || input.sourceVocabularyVersion !== PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_VERSION) {
    return Object.freeze({ ...base, state: "source_unknown", reason: "source_vocabulary_unknown" });
  }
  if (input.normalizationPolicyId !== PRIVATE_RESTRICTION_ALLERGEN_NORMALIZATION_POLICY_ID
    || input.normalizationPolicyVersion !== PRIVATE_RESTRICTION_ALLERGEN_NORMALIZATION_POLICY_VERSION) {
    return Object.freeze({ ...base, state: "source_unknown", reason: "normalization_policy_unknown" });
  }
  const targetAllergenKey = PRIVATE_ALIASES.get(normalizedSourceValue);
  if (!targetAllergenKey) return Object.freeze({ ...base, state: "unmapped" });
  return Object.freeze({
    ...base,
    state: "mapped",
    targetTaxonomyId: CANDIDATE_ALLERGEN_TAXONOMY_ID,
    targetTaxonomyVersion: CANDIDATE_ALLERGEN_TAXONOMY_VERSION,
    targetAllergenKey
  });
}

export function normalizeLegacyCandidateAllergen(input: Readonly<{
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  rawValue: string;
}>): LegacyCandidateAllergenNormalizationResult {
  const normalizedSourceValue = normalizeExactAllergenSourceValue(input.rawValue);
  if (input.sourceVocabularyId !== LEGACY_MENU_ALLERGEN_SOURCE_VOCABULARY_ID
    || input.sourceVocabularyVersion !== LEGACY_MENU_ALLERGEN_SOURCE_VOCABULARY_VERSION) {
    return Object.freeze({ state: "unmapped", normalizedSourceValue });
  }
  const targetAllergenKey = LEGACY_RAW_ALIASES.get(normalizedSourceValue);
  return targetAllergenKey
    ? Object.freeze({ state: "mapped", normalizedSourceValue, targetAllergenKey })
    : Object.freeze({ state: "unmapped", normalizedSourceValue });
}

export function isCandidateAllergenKey(value: string): value is CandidateAllergenKey {
  return ALLERGEN_KEY_SET.has(value);
}

export function provenanceCanDeclareCompleteCoverage(provenance: CandidateAllergenProvenance): boolean {
  return provenance === "restaurant_verified" || provenance === "admin_verified";
}

export function coverageHasCompleteVocabularyAssessment(state: CandidateAllergenCoverageState): boolean {
  return state === "complete";
}
