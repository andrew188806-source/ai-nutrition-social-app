export const CANDIDATE_TASTE_TAXONOMY_VERSION = "candidate-taste-v1" as const;

export const CANDIDATE_TASTE_FACET_KEYS = Object.freeze([
  "cuisine",
  "flavor",
  "meal_type",
  "spice"
] as const);

export type CandidateTasteFacetKey = (typeof CANDIDATE_TASTE_FACET_KEYS)[number];

export const CANDIDATE_TASTE_PROVENANCE_VALUES = Object.freeze([
  "restaurant_verified",
  "admin_verified",
  "provider_imported",
  "canonical_mapping"
] as const);

export type CandidateTasteProvenance = (typeof CANDIDATE_TASTE_PROVENANCE_VALUES)[number];
export type CandidateTasteMappingScope = "restaurant" | "menu_item";
export type CandidateTasteMappingState = "unknown" | "partial" | "mapped";

export type CandidateTasteFact = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  taxonomyVersion: typeof CANDIDATE_TASTE_TAXONOMY_VERSION;
  facetKey: CandidateTasteFacetKey;
  valueKey: string;
  mappingScope: CandidateTasteMappingScope;
  provenance: CandidateTasteProvenance;
  sourceReference: string;
  establishedAt: string;
}>;

export type CandidateTasteCoverage = Readonly<{
  taxonomyVersion: typeof CANDIDATE_TASTE_TAXONOMY_VERSION;
  mappingState: CandidateTasteMappingState;
  knownFacetKeys: readonly CandidateTasteFacetKey[];
  unknownFacetKeys: readonly CandidateTasteFacetKey[];
}>;

const FACET_SET: ReadonlySet<string> = new Set(CANDIDATE_TASTE_FACET_KEYS);

export function classifyCandidateTasteCoverage(
  observedFacetKeys: readonly string[]
): CandidateTasteCoverage {
  const knownFacetKeys = CANDIDATE_TASTE_FACET_KEYS.filter((key) => observedFacetKeys.includes(key));
  const unknownFacetKeys = CANDIDATE_TASTE_FACET_KEYS.filter((key) => !knownFacetKeys.includes(key));
  const mappingState: CandidateTasteMappingState = knownFacetKeys.length === 0
    ? "unknown"
    : unknownFacetKeys.length === 0
      ? "mapped"
      : "partial";

  return Object.freeze({
    taxonomyVersion: CANDIDATE_TASTE_TAXONOMY_VERSION,
    mappingState,
    knownFacetKeys: Object.freeze([...knownFacetKeys]),
    unknownFacetKeys: Object.freeze([...unknownFacetKeys])
  });
}

export function isCandidateTasteFacetKey(value: string): value is CandidateTasteFacetKey {
  return FACET_SET.has(value);
}
