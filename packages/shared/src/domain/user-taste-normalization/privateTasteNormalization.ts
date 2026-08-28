import type { CandidateTasteFacetKey, CandidateTasteProvenance } from "../candidate-taste";

export const PRIVATE_TASTE_NORMALIZATION_POLICY_ID = "private-taste-normalization" as const;
export const PRIVATE_TASTE_NORMALIZATION_POLICY_VERSION = 1 as const;

export const PRIVATE_TASTE_SOURCE_VOCABULARIES = Object.freeze({
  cuisine: Object.freeze({ sourceVocabularyId: "private-taste-cuisine-v1", sourceVocabularyVersion: 1 }),
  flavor: Object.freeze({ sourceVocabularyId: "private-taste-flavor-v1", sourceVocabularyVersion: 1 }),
  spice: Object.freeze({ sourceVocabularyId: "private-taste-spice-v1", sourceVocabularyVersion: 1 })
} as const);

export type PrivateTasteNormalizationFacet = keyof typeof PRIVATE_TASTE_SOURCE_VOCABULARIES;

export const PRIVATE_TASTE_DIRECT_MEAL_TYPE_KEYS = Object.freeze([
  "breakfast",
  "lunch",
  "dinner",
  "late_night",
  "snack",
  "other"
] as const);

export type PrivateTasteDirectMealTypeKey = (typeof PRIVATE_TASTE_DIRECT_MEAL_TYPE_KEYS)[number];

export const PRIVATE_TASTE_SPICE_SEMANTIC_ORDER = Object.freeze([
  Object.freeze({ valueKey: "none", semanticOrdinal: 0 }),
  Object.freeze({ valueKey: "mild", semanticOrdinal: 1 }),
  Object.freeze({ valueKey: "medium", semanticOrdinal: 2 }),
  Object.freeze({ valueKey: "hot", semanticOrdinal: 3 })
] as const);

export type PrivateTasteSourceValue = Readonly<{
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  sourceFacet: PrivateTasteNormalizationFacet;
  sourceValueKey: string;
  locale: string;
  label: string;
}>;

export type PrivateTasteNormalizationAliasKind =
  | "stable_key"
  | "localized_label"
  | "governed_alias";

export type PrivateTasteNormalizationMapping = Readonly<{
  normalizationPolicyId: string;
  normalizationPolicyVersion: number;
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  sourceFacet: PrivateTasteNormalizationFacet;
  sourceValueKey: string;
  normalizedSourceValue: string;
  aliasKind: PrivateTasteNormalizationAliasKind;
  sourceLocale: string | null;
  targetTaxonomyVersion: string;
  targetFacet: PrivateTasteNormalizationFacet;
  targetValueKey: string;
  semanticOrdinal: number | null;
  provenance: CandidateTasteProvenance;
  auditReference: string;
}>;

export type PrivateTasteNormalizationAuthority = Readonly<{
  sourceValues: readonly PrivateTasteSourceValue[];
  mappings: readonly PrivateTasteNormalizationMapping[];
}>;

export type PrivateTasteNormalizationInput = Readonly<{
  normalizationPolicyId: string;
  normalizationPolicyVersion: number;
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  sourceFacet: PrivateTasteNormalizationFacet;
  sourceValue: string;
  enabledFacets: readonly PrivateTasteNormalizationFacet[];
}>;

type PrivateTasteNormalizationBase = Readonly<{
  sourceVocabularyId: string;
  sourceVocabularyVersion: number;
  sourceFacet: PrivateTasteNormalizationFacet;
  normalizedSourceValue: string;
}>;

export type PrivateTasteMappedNormalizationResult = PrivateTasteNormalizationBase & Readonly<{
  state: "mapped";
  normalizationPolicyId: string;
  normalizationPolicyVersion: number;
  sourceValueKey: string;
  targetTaxonomyVersion: string;
  targetFacet: PrivateTasteNormalizationFacet;
  targetValueKey: string;
  semanticOrdinal: number | null;
}>;

export type PrivateTasteNormalizationResult =
  | PrivateTasteMappedNormalizationResult
  | (PrivateTasteNormalizationBase & Readonly<{ state: "unmapped" }>)
  | (PrivateTasteNormalizationBase & Readonly<{
      state: "source_unknown";
      reason: "normalization_policy_unknown" | "source_vocabulary_unknown";
    }>)
  | (PrivateTasteNormalizationBase & Readonly<{ state: "facet_disabled" }>);

export type PrivateTasteProfileWriteValidationResult =
  | Readonly<{
      accepted: true;
      sourceVocabularyId: string;
      sourceVocabularyVersion: number;
      sourceFacet: PrivateTasteNormalizationFacet;
      persistedSourceValueKey: string;
    }>
  | Readonly<{
      accepted: false;
      reason: "source_vocabulary_unknown" | "value_not_canonical";
    }>;

export function normalizePrivateTasteSourceValue(value: string): string {
  if (typeof value !== "string") throw new TypeError("Private Taste source value must be a string.");
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throw new TypeError("Private Taste source value must not be empty.");
  return normalized;
}

export function resolvePrivateTasteSourceValue(
  authority: PrivateTasteNormalizationAuthority,
  input: PrivateTasteNormalizationInput
): PrivateTasteNormalizationResult {
  const normalizedSourceValue = normalizePrivateTasteSourceValue(input.sourceValue);
  const base = Object.freeze({
    sourceVocabularyId: input.sourceVocabularyId,
    sourceVocabularyVersion: input.sourceVocabularyVersion,
    sourceFacet: input.sourceFacet,
    normalizedSourceValue
  });

  if (!input.enabledFacets.includes(input.sourceFacet)) {
    return Object.freeze({ ...base, state: "facet_disabled" });
  }

  const sourceKnown = authority.sourceValues.some((entry) =>
    entry.sourceVocabularyId === input.sourceVocabularyId
    && entry.sourceVocabularyVersion === input.sourceVocabularyVersion
    && entry.sourceFacet === input.sourceFacet
  );
  if (!sourceKnown) {
    return Object.freeze({ ...base, state: "source_unknown", reason: "source_vocabulary_unknown" });
  }

  const policyKnown = input.normalizationPolicyId === PRIVATE_TASTE_NORMALIZATION_POLICY_ID
    && input.normalizationPolicyVersion === PRIVATE_TASTE_NORMALIZATION_POLICY_VERSION;
  if (!policyKnown) {
    return Object.freeze({ ...base, state: "source_unknown", reason: "normalization_policy_unknown" });
  }

  const mapping = authority.mappings.find((entry) =>
    entry.normalizationPolicyId === input.normalizationPolicyId
    && entry.normalizationPolicyVersion === input.normalizationPolicyVersion
    && entry.sourceVocabularyId === input.sourceVocabularyId
    && entry.sourceVocabularyVersion === input.sourceVocabularyVersion
    && entry.sourceFacet === input.sourceFacet
    && entry.targetFacet === input.sourceFacet
    && entry.normalizedSourceValue === normalizedSourceValue
  );
  if (!mapping) return Object.freeze({ ...base, state: "unmapped" });

  return Object.freeze({
    ...base,
    state: "mapped",
    normalizationPolicyId: mapping.normalizationPolicyId,
    normalizationPolicyVersion: mapping.normalizationPolicyVersion,
    sourceValueKey: mapping.sourceValueKey,
    targetTaxonomyVersion: mapping.targetTaxonomyVersion,
    targetFacet: mapping.targetFacet,
    targetValueKey: mapping.targetValueKey,
    semanticOrdinal: mapping.semanticOrdinal
  });
}

/**
 * New writes accept stable source keys only. Display labels remain readable legacy aliases but are
 * never persisted as identity by a future profile-write surface.
 */
export function validatePrivateTasteProfileWriteValue(
  sourceValues: readonly PrivateTasteSourceValue[],
  input: Readonly<{
    sourceVocabularyId: string;
    sourceVocabularyVersion: number;
    sourceFacet: PrivateTasteNormalizationFacet;
    value: string;
  }>
): PrivateTasteProfileWriteValidationResult {
  const normalized = normalizePrivateTasteSourceValue(input.value);
  const vocabulary = sourceValues.filter((entry) =>
    entry.sourceVocabularyId === input.sourceVocabularyId
    && entry.sourceVocabularyVersion === input.sourceVocabularyVersion
    && entry.sourceFacet === input.sourceFacet
  );
  if (vocabulary.length === 0) {
    return Object.freeze({ accepted: false, reason: "source_vocabulary_unknown" });
  }
  const value = vocabulary.find((entry) => entry.sourceValueKey === normalized);
  if (!value) return Object.freeze({ accepted: false, reason: "value_not_canonical" });
  return Object.freeze({
    accepted: true,
    sourceVocabularyId: input.sourceVocabularyId,
    sourceVocabularyVersion: input.sourceVocabularyVersion,
    sourceFacet: input.sourceFacet,
    persistedSourceValueKey: value.sourceValueKey
  });
}

export function isDirectPrivateTasteMealTypeKey(value: string): value is PrivateTasteDirectMealTypeKey {
  return (PRIVATE_TASTE_DIRECT_MEAL_TYPE_KEYS as readonly string[]).includes(value);
}

export function isPrivateTasteNormalizationFacet(value: CandidateTasteFacetKey): value is PrivateTasteNormalizationFacet {
  return value === "cuisine" || value === "flavor" || value === "spice";
}
