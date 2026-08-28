import type { CandidateTasteFacetKey } from "../../../../packages/shared/src/domain/candidate-taste";

export type TasteRankingFacetPolicy = Readonly<{
  facetKey: CandidateTasteFacetKey;
  weight: number;
}>;

export type TasteRankingPolicy = Readonly<{
  policyId: string;
  policyVersion: number;
  candidateTaxonomyVersion: string;
  normalizationPolicyId: string;
  normalizationPolicyVersion: number;
  enabledFacets: readonly TasteRankingFacetPolicy[];
  minimumComparableFacetCount: number;
  unknownTreatment: "abstain";
  evidenceScores: Readonly<{
    categoricalMatch: number;
    categoricalKnownDisjoint: number;
    dislikedFlavorOverlap: number;
    dislikedFlavorKnownNoOverlap: number;
    spiceDistance: readonly Readonly<{ distance: number; score: number }>[];
  }>;
}>;

export const DEFAULT_TASTE_RANKING_POLICY_ID = "tastkind.taste.explicit_preferences" as const;
export const DEFAULT_TASTE_RANKING_POLICY_VERSION = 1 as const;
export const TASTE_RANKING_NORMALIZATION_POLICY_REFERENCE_ID = "private-taste-normalization-v1" as const;

export const DEFAULT_TASTE_RANKING_POLICY: TasteRankingPolicy = Object.freeze({
  policyId: DEFAULT_TASTE_RANKING_POLICY_ID,
  policyVersion: DEFAULT_TASTE_RANKING_POLICY_VERSION,
  candidateTaxonomyVersion: "candidate-taste-v1",
  normalizationPolicyId: TASTE_RANKING_NORMALIZATION_POLICY_REFERENCE_ID,
  normalizationPolicyVersion: 1,
  enabledFacets: Object.freeze([
    Object.freeze({ facetKey: "cuisine" as const, weight: 0.30 }),
    Object.freeze({ facetKey: "meal_type" as const, weight: 0.20 }),
    Object.freeze({ facetKey: "flavor" as const, weight: 0.35 }),
    Object.freeze({ facetKey: "spice" as const, weight: 0.15 })
  ]),
  minimumComparableFacetCount: 2,
  unknownTreatment: "abstain",
  evidenceScores: Object.freeze({
    categoricalMatch: 1,
    categoricalKnownDisjoint: 0,
    dislikedFlavorOverlap: -1,
    dislikedFlavorKnownNoOverlap: 0,
    spiceDistance: Object.freeze([
      Object.freeze({ distance: 0, score: 1 }),
      Object.freeze({ distance: 1, score: 0.5 }),
      Object.freeze({ distance: 2, score: 0 }),
      Object.freeze({ distance: 3, score: -0.5 })
    ])
  })
});

export interface TasteRankingPolicyProvider {
  getActiveTasteRankingPolicy(): TasteRankingPolicy;
}

export function createDefaultTasteRankingPolicyProvider(): TasteRankingPolicyProvider {
  return Object.freeze({ getActiveTasteRankingPolicy: () => DEFAULT_TASTE_RANKING_POLICY });
}

export function isTasteRankingPolicy(value: unknown): value is TasteRankingPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Partial<TasteRankingPolicy>;
  if (typeof policy.policyId !== "string" || !policy.policyId) return false;
  if (!Number.isInteger(policy.policyVersion) || Number(policy.policyVersion) < 1) return false;
  if (policy.candidateTaxonomyVersion !== "candidate-taste-v1") return false;
  if (policy.normalizationPolicyId !== TASTE_RANKING_NORMALIZATION_POLICY_REFERENCE_ID
    || policy.normalizationPolicyVersion !== 1) return false;
  if (policy.unknownTreatment !== "abstain" || policy.minimumComparableFacetCount !== 2) return false;
  if (!Array.isArray(policy.enabledFacets) || policy.enabledFacets.length !== 4) return false;
  const expected = new Map<CandidateTasteFacetKey, number>([
    ["cuisine", 0.30], ["meal_type", 0.20], ["flavor", 0.35], ["spice", 0.15]
  ]);
  if (policy.enabledFacets.some((entry) => expected.get(entry.facetKey) !== entry.weight)
    || new Set(policy.enabledFacets.map((entry) => entry.facetKey)).size !== 4) return false;
  const evidence = policy.evidenceScores;
  return Boolean(evidence
    && evidence.categoricalMatch === 1
    && evidence.categoricalKnownDisjoint === 0
    && evidence.dislikedFlavorOverlap === -1
    && evidence.dislikedFlavorKnownNoOverlap === 0
    && JSON.stringify(evidence.spiceDistance) === JSON.stringify([
      { distance: 0, score: 1 }, { distance: 1, score: 0.5 },
      { distance: 2, score: 0 }, { distance: 3, score: -0.5 }
    ]));
}
