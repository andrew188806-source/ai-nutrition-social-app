import {
  CANDIDATE_TASTE_FACET_KEYS,
  CANDIDATE_TASTE_TAXONOMY_VERSION,
  type CandidateTasteFacetKey,
  type CandidateTasteProvenance
} from "../../../../../packages/shared/src/domain/candidate-taste";
import type {
  PrivateTasteNormalizationAliasKind,
  PrivateTasteNormalizationAuthority,
  PrivateTasteNormalizationMapping,
  PrivateTasteNormalizationFacet,
  PrivateTasteSourceValue
} from "../../../../../packages/shared/src/domain/user-taste-normalization";
import type { CandidateTasteProjection } from "../recommendationTasteRanking";
import type { ConsumerNextMealCandidate } from "../types";

export const SUPABASE_CANDIDATE_TASTE_FACTS_VIEW =
  "consumer_public_next_meal_candidate_taste_facts_v1" as const;
export const SUPABASE_CANDIDATE_TASTE_STATE_VIEW =
  "consumer_public_next_meal_candidate_taste_state_v1" as const;
export const SUPABASE_PRIVATE_TASTE_SOURCE_VALUES_VIEW =
  "consumer_private_taste_source_values_v1" as const;
export const SUPABASE_PRIVATE_TASTE_DICTIONARY_VIEW =
  "consumer_private_taste_normalization_dictionary_v1" as const;

type TasteView =
  | typeof SUPABASE_CANDIDATE_TASTE_FACTS_VIEW
  | typeof SUPABASE_CANDIDATE_TASTE_STATE_VIEW
  | typeof SUPABASE_PRIVATE_TASTE_SOURCE_VALUES_VIEW
  | typeof SUPABASE_PRIVATE_TASTE_DICTIONARY_VIEW;

type QueryResponse = Readonly<{
  data: unknown[] | null;
  error: Readonly<{ message: string; status?: number; code?: string }> | null;
}>;

type TasteQuery = PromiseLike<QueryResponse> & {
  in(column: "candidate_id", values: readonly string[]): PromiseLike<QueryResponse>;
};

export type SupabaseRecommendationTasteClientLike = Readonly<{
  from(view: TasteView): Readonly<{ select(columns: "*"): TasteQuery }>;
}>;

export type RecommendationTasteAuthorityReadResult =
  | Readonly<{
      status: "available";
      normalizationAuthority: PrivateTasteNormalizationAuthority;
      projections: readonly CandidateTasteProjection[];
    }>
  | Readonly<{ status: "unavailable" }>;

export class SupabaseRecommendationTasteReader {
  constructor(private readonly client: SupabaseRecommendationTasteClientLike) {}

  async readForEligibleCandidates(
    candidates: readonly ConsumerNextMealCandidate[]
  ): Promise<RecommendationTasteAuthorityReadResult> {
    if (candidates.length === 0) return { status: "unavailable" };
    const candidateIds = candidates.map((candidate) => candidate.candidateId);
    try {
      const [factsResponse, stateResponse, sourceResponse, dictionaryResponse] = await Promise.all([
        this.client.from(SUPABASE_CANDIDATE_TASTE_FACTS_VIEW).select("*").in("candidate_id", candidateIds),
        this.client.from(SUPABASE_CANDIDATE_TASTE_STATE_VIEW).select("*").in("candidate_id", candidateIds),
        this.client.from(SUPABASE_PRIVATE_TASTE_SOURCE_VALUES_VIEW).select("*"),
        this.client.from(SUPABASE_PRIVATE_TASTE_DICTIONARY_VIEW).select("*")
      ]);
      if (factsResponse.error || stateResponse.error || sourceResponse.error || dictionaryResponse.error) {
        return { status: "unavailable" };
      }
      if (![factsResponse.data, stateResponse.data, sourceResponse.data, dictionaryResponse.data]
        .every(Array.isArray)) return { status: "unavailable" };

      const sourceValues = (sourceResponse.data ?? []).map(parseSourceValue);
      const mappings = (dictionaryResponse.data ?? []).map(parseMapping);
      const normalizationAuthority = Object.freeze({
        sourceValues: Object.freeze(sourceValues),
        mappings: Object.freeze(mappings)
      });
      const facts = (factsResponse.data ?? []).map(parseCandidateFact);
      const states = (stateResponse.data ?? []).map(parseCandidateState);
      if (states.length !== candidates.length) return { status: "unavailable" };
      const stateById = new Map(states.map((state) => [state.candidateId, state]));
      if (stateById.size !== candidates.length) return { status: "unavailable" };

      const spiceOrdinals: Record<string, number> = {};
      for (const mapping of mappings.filter((entry) => entry.targetFacet === "spice")) {
        if (typeof mapping.semanticOrdinal !== "number") return { status: "unavailable" };
        const previous = spiceOrdinals[mapping.targetValueKey];
        if (previous !== undefined && previous !== mapping.semanticOrdinal) return { status: "unavailable" };
        spiceOrdinals[mapping.targetValueKey] = mapping.semanticOrdinal;
      }

      const projections = candidates.map((candidate) => {
        const state = stateById.get(candidate.candidateId);
        if (!state || state.restaurantId !== candidate.restaurantId
          || state.branchId !== candidate.branchId || state.menuItemId !== candidate.menuItemId
          || state.taxonomyVersion !== CANDIDATE_TASTE_TAXONOMY_VERSION) {
          throw new TypeError("Candidate Taste state identity mismatch.");
        }
        const candidateFacts = facts.filter((fact) => fact.candidateId === candidate.candidateId);
        if (candidateFacts.some((fact) => fact.restaurantId !== candidate.restaurantId
          || fact.branchId !== candidate.branchId || fact.menuItemId !== candidate.menuItemId
          || fact.taxonomyVersion !== state.taxonomyVersion)) {
          throw new TypeError("Candidate Taste fact identity mismatch.");
        }
        const observedFacets = [...new Set(candidateFacts.map((fact) => fact.facetKey))].sort();
        if (JSON.stringify(observedFacets) !== JSON.stringify([...state.knownFacetKeys].sort())
          || state.knownFacetKeys.some((facetKey) => state.unknownFacetKeys.includes(facetKey))
          || state.knownFacetKeys.length + state.unknownFacetKeys.length !== CANDIDATE_TASTE_FACET_KEYS.length) {
          throw new TypeError("Candidate Taste coverage mismatch.");
        }
        const grouped: Partial<Record<CandidateTasteFacetKey, readonly string[]>> = {};
        for (const facetKey of CANDIDATE_TASTE_FACET_KEYS) {
          const values = [...new Set(candidateFacts
            .filter((fact) => fact.facetKey === facetKey)
            .map((fact) => fact.valueKey))].sort();
          if (values.length > 0) grouped[facetKey] = Object.freeze(values);
        }
        return Object.freeze({
          candidateId: candidate.candidateId,
          restaurantId: candidate.restaurantId,
          branchId: state.branchId,
          menuItemId: candidate.menuItemId,
          taxonomyVersion: state.taxonomyVersion,
          mappingState: state.mappingState,
          facts: Object.freeze(grouped),
          spiceOrdinals: Object.freeze({ ...spiceOrdinals })
        });
      });
      return Object.freeze({
        status: "available",
        normalizationAuthority,
        projections: Object.freeze(projections)
      });
    } catch {
      return { status: "unavailable" };
    }
  }
}

function parseSourceValue(value: unknown): PrivateTasteSourceValue {
  const row = record(value);
  return Object.freeze({
    sourceVocabularyId: text(row.source_vocabulary_id),
    sourceVocabularyVersion: integer(row.source_vocabulary_version),
    sourceFacet: normalizationFacet(row.source_facet),
    sourceValueKey: text(row.source_value_key),
    locale: text(row.locale),
    label: text(row.label)
  });
}

function parseMapping(value: unknown): PrivateTasteNormalizationMapping {
  const row = record(value);
  return Object.freeze({
    normalizationPolicyId: text(row.normalization_policy_id),
    normalizationPolicyVersion: integer(row.normalization_policy_version),
    sourceVocabularyId: text(row.source_vocabulary_id),
    sourceVocabularyVersion: integer(row.source_vocabulary_version),
    sourceFacet: normalizationFacet(row.source_facet),
    sourceValueKey: text(row.source_value_key),
    normalizedSourceValue: text(row.normalized_source_value),
    aliasKind: aliasKind(row.alias_kind),
    sourceLocale: nullableText(row.source_locale),
    targetTaxonomyVersion: text(row.target_taxonomy_version),
    targetFacet: normalizationFacet(row.target_facet),
    targetValueKey: text(row.target_value_key),
    semanticOrdinal: row.semantic_ordinal === null ? null : integer(row.semantic_ordinal),
    provenance: provenance(row.provenance),
    auditReference: text(row.audit_reference)
  });
}

function parseCandidateFact(value: unknown) {
  const row = record(value);
  return Object.freeze({
    candidateId: text(row.candidate_id), restaurantId: text(row.restaurant_id),
    branchId: text(row.branch_id), menuItemId: text(row.menu_item_id),
    taxonomyVersion: text(row.taxonomy_version), facetKey: facet(row.facet_key),
    valueKey: text(row.value_key)
  });
}

function parseCandidateState(value: unknown) {
  const row = record(value);
  const mappingState = text(row.mapping_state);
  if (mappingState !== "unknown" && mappingState !== "partial" && mappingState !== "mapped") {
    throw new TypeError("Invalid Candidate Taste mapping state.");
  }
  const knownFacetKeys = facetArray(row.known_facet_keys);
  const unknownFacetKeys = facetArray(row.unknown_facet_keys);
  const expectedState = knownFacetKeys.length === 0 ? "unknown"
    : unknownFacetKeys.length === 0 ? "mapped" : "partial";
  if (mappingState !== expectedState) throw new TypeError("Inconsistent Candidate Taste mapping state.");
  return Object.freeze({
    candidateId: text(row.candidate_id), restaurantId: text(row.restaurant_id),
    branchId: text(row.branch_id), menuItemId: text(row.menu_item_id),
    taxonomyVersion: text(row.taxonomy_version), mappingState,
    knownFacetKeys: Object.freeze(knownFacetKeys), unknownFacetKeys: Object.freeze(unknownFacetKeys)
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid Taste row.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new TypeError("Invalid Taste text.");
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new TypeError("Invalid Taste integer.");
  return value;
}
function facet(value: unknown): CandidateTasteFacetKey {
  const result = text(value) as CandidateTasteFacetKey;
  if (!CANDIDATE_TASTE_FACET_KEYS.includes(result)) throw new TypeError("Invalid Taste facet.");
  return result;
}
function normalizationFacet(value: unknown): PrivateTasteNormalizationFacet {
  const result = text(value);
  if (result !== "cuisine" && result !== "flavor" && result !== "spice") throw new TypeError("Invalid normalization facet.");
  return result;
}
function aliasKind(value: unknown): PrivateTasteNormalizationAliasKind {
  const result = text(value);
  if (result !== "stable_key" && result !== "localized_label" && result !== "governed_alias") {
    throw new TypeError("Invalid normalization alias kind.");
  }
  return result;
}
function provenance(value: unknown): CandidateTasteProvenance {
  const result = text(value) as CandidateTasteProvenance;
  if (!["restaurant_verified", "admin_verified", "provider_imported", "canonical_mapping"].includes(result)) {
    throw new TypeError("Invalid Taste provenance.");
  }
  return result;
}
function facetArray(value: unknown): CandidateTasteFacetKey[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid Taste facet array.");
  const values = value.map(facet);
  if (new Set(values).size !== values.length) throw new TypeError("Duplicate Taste facet.");
  return values;
}
