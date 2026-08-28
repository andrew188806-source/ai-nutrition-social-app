import type { CandidateTasteFacetKey } from "../../../../packages/shared/src/domain/candidate-taste";
import {
  PRIVATE_TASTE_NORMALIZATION_POLICY_ID,
  PRIVATE_TASTE_SOURCE_VOCABULARIES,
  isDirectPrivateTasteMealTypeKey,
  resolvePrivateTasteSourceValue,
  type PrivateTasteNormalizationAuthority
} from "../../../../packages/shared/src/domain/user-taste-normalization";
import type { ConsumerTasteProfileRow } from "../consumer-taste-profile/types";
import type { ConsumerNextMealCandidate, ConsumerNextMealNutritionEvaluation } from "./types";
import {
  isRecommendationCompositionPolicy,
  type RecommendationCompositionPolicy
} from "./recommendationCompositionPolicy";
import {
  isTasteRankingPolicy,
  type TasteRankingPolicy
} from "./tasteRankingPolicy";

export type NormalizedExplicitTasteProfile = Readonly<{
  cuisineKeys: readonly string[];
  mealTypeKeys: readonly string[];
  dislikedFlavorKeys: readonly string[];
  spice: Readonly<{ valueKey: string; semanticOrdinal: number }> | null;
}>;

export type CandidateTasteProjection = Readonly<{
  candidateId: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  taxonomyVersion: string;
  mappingState: "unknown" | "partial" | "mapped";
  facts: Readonly<Partial<Record<CandidateTasteFacetKey, readonly string[]>>>;
  spiceOrdinals: Readonly<Record<string, number>>;
}>;

export type TasteFacetEvidence = Readonly<{
  facetKey: CandidateTasteFacetKey;
  score: number;
}>;

export type CandidateTasteEvaluation = Readonly<{
  candidateId: string;
  state: "valid" | "insufficient_evidence";
  comparableFacetCount: number;
  score: number | null;
  facetEvidence: readonly TasteFacetEvidence[];
  positiveFacetKeys: readonly CandidateTasteFacetKey[];
  dislikedFlavorOverlap: boolean;
}>;

export type RecommendationLane = "nutrition_primary" | "taste_forward" | "nutrition_fallback";

export type RecommendationCompositionEntry = Readonly<{
  candidate: ConsumerNextMealCandidate;
  lane: RecommendationLane;
  nutrition: ConsumerNextMealNutritionEvaluation;
  taste: CandidateTasteEvaluation;
}>;

export type RecommendationCompositionResult = Readonly<{
  entries: readonly RecommendationCompositionEntry[];
  laneA: readonly string[];
  laneB: readonly string[];
}>;

/**
 * The REC-B policy uses a versioned reference name while the frozen P1 authority retains its
 * original database identity. This adapter is the single intentional reconciliation point; no
 * migration alias or second normalization authority is created.
 */
export function normalizeExplicitTasteProfile(
  row: ConsumerTasteProfileRow,
  authority: PrivateTasteNormalizationAuthority,
  policy: TasteRankingPolicy
): NormalizedExplicitTasteProfile {
  if (!isTasteRankingPolicy(policy)) throw new TypeError("Invalid Taste ranking policy.");

  const cuisineKeys = normalizeMany(row.preferred_cuisine_tags, "cuisine", authority, policy);
  const dislikedFlavorKeys = normalizeMany(row.disliked_tastes, "flavor", authority, policy);
  const mealTypeKeys = unique(row.preferred_meal_types.filter(isDirectPrivateTasteMealTypeKey));
  const spiceResult = row.spice_preference
    ? resolvePrivateTasteSourceValue(authority, {
        normalizationPolicyId: PRIVATE_TASTE_NORMALIZATION_POLICY_ID,
        normalizationPolicyVersion: policy.normalizationPolicyVersion,
        ...PRIVATE_TASTE_SOURCE_VOCABULARIES.spice,
        sourceFacet: "spice",
        sourceValue: row.spice_preference,
        enabledFacets: ["cuisine", "flavor", "spice"]
      })
    : null;
  const spice = spiceResult?.state === "mapped" && typeof spiceResult.semanticOrdinal === "number"
    ? Object.freeze({ valueKey: spiceResult.targetValueKey, semanticOrdinal: spiceResult.semanticOrdinal })
    : null;

  return Object.freeze({
    cuisineKeys: Object.freeze(cuisineKeys),
    mealTypeKeys: Object.freeze(mealTypeKeys),
    dislikedFlavorKeys: Object.freeze(dislikedFlavorKeys),
    spice
  });
}

export function evaluateCandidateTaste(
  profile: NormalizedExplicitTasteProfile,
  candidate: CandidateTasteProjection,
  policy: TasteRankingPolicy
): CandidateTasteEvaluation {
  if (!isTasteRankingPolicy(policy) || candidate.taxonomyVersion !== policy.candidateTaxonomyVersion) {
    throw new TypeError("Taste evaluation authority mismatch.");
  }

  const evidence: TasteFacetEvidence[] = [];
  for (const facet of policy.enabledFacets) {
    const candidateValues = candidate.facts[facet.facetKey] ?? [];
    if (facet.facetKey === "cuisine") {
      pushCategoricalEvidence(evidence, facet.facetKey, profile.cuisineKeys, candidateValues, policy);
    } else if (facet.facetKey === "meal_type") {
      pushCategoricalEvidence(evidence, facet.facetKey, profile.mealTypeKeys, candidateValues, policy);
    } else if (facet.facetKey === "flavor") {
      if (profile.dislikedFlavorKeys.length > 0 && candidateValues.length > 0) {
        evidence.push(Object.freeze({
          facetKey: "flavor",
          score: intersects(profile.dislikedFlavorKeys, candidateValues)
            ? policy.evidenceScores.dislikedFlavorOverlap
            : policy.evidenceScores.dislikedFlavorKnownNoOverlap
        }));
      }
    } else if (profile.spice && candidateValues.length === 1) {
      const candidateOrdinal = candidate.spiceOrdinals[candidateValues[0]];
      if (Number.isInteger(candidateOrdinal)) {
        const distance = Math.abs(profile.spice.semanticOrdinal - candidateOrdinal);
        const distancePolicy = policy.evidenceScores.spiceDistance.find((entry) => entry.distance === distance);
        if (distancePolicy) evidence.push(Object.freeze({ facetKey: "spice", score: distancePolicy.score }));
      }
    }
  }

  const comparableFacetCount = evidence.length;
  const valid = comparableFacetCount >= policy.minimumComparableFacetCount;
  const weights = new Map(policy.enabledFacets.map((entry) => [entry.facetKey, entry.weight]));
  const weightTotal = evidence.reduce((total, entry) => total + (weights.get(entry.facetKey) ?? 0), 0);
  const weightedTotal = evidence.reduce(
    (total, entry) => total + entry.score * (weights.get(entry.facetKey) ?? 0), 0
  );
  const score = valid && weightTotal > 0 ? weightedTotal / weightTotal : null;
  return Object.freeze({
    candidateId: candidate.candidateId,
    state: valid ? "valid" : "insufficient_evidence",
    comparableFacetCount,
    score,
    facetEvidence: Object.freeze(evidence),
    positiveFacetKeys: Object.freeze(evidence.filter((entry) => entry.score > 0).map((entry) => entry.facetKey)),
    dislikedFlavorOverlap: evidence.some((entry) => entry.facetKey === "flavor" && entry.score < 0)
  });
}

export function composeDualLaneRecommendation(
  nutritionOrder: readonly ConsumerNextMealNutritionEvaluation[],
  tasteByCandidateId: ReadonlyMap<string, CandidateTasteEvaluation>,
  policy: RecommendationCompositionPolicy
): RecommendationCompositionResult {
  if (!isRecommendationCompositionPolicy(policy)) throw new TypeError("Invalid recommendation composition policy.");
  const insufficient = (candidateId: string): CandidateTasteEvaluation => Object.freeze({
    candidateId,
    state: "insufficient_evidence",
    comparableFacetCount: 0,
    score: null,
    facetEvidence: Object.freeze([]),
    positiveFacetKeys: Object.freeze([]),
    dislikedFlavorOverlap: false
  });
  const nutritionIndex = new Map(nutritionOrder.map((entry, index) => [entry.candidate.candidateId, index]));
  const laneA = buildLaneA(nutritionOrder, tasteByCandidateId, policy);
  const laneB = buildLaneB(nutritionOrder, tasteByCandidateId, policy);
  const baseline = nutritionOrder.map((entry) => entry.candidate.candidateId);
  const byId = new Map(nutritionOrder.map((entry) => [entry.candidate.candidateId, entry]));
  const used = new Set<string>();
  let cursorA = 0;
  let cursorB = 0;
  let cursorBaseline = 0;
  const entries: RecommendationCompositionEntry[] = [];

  const take = (lane: readonly string[], cursor: number) => {
    while (cursor < lane.length && used.has(lane[cursor])) cursor += 1;
    return { candidateId: cursor < lane.length ? lane[cursor] : null, cursor: cursor + 1 };
  };

  while (entries.length < nutritionOrder.length) {
    const requestedA = entries.length % 2 === 0;
    let selected: string | null = null;
    let lane: RecommendationLane = requestedA ? "nutrition_primary" : "taste_forward";
    if (requestedA) {
      const result = take(laneA, cursorA); cursorA = result.cursor; selected = result.candidateId;
      if (!selected) { const other = take(laneB, cursorB); cursorB = other.cursor; selected = other.candidateId; lane = "taste_forward"; }
    } else {
      const result = take(laneB, cursorB); cursorB = result.cursor; selected = result.candidateId;
      if (!selected) { const other = take(laneA, cursorA); cursorA = other.cursor; selected = other.candidateId; lane = "nutrition_primary"; }
    }
    if (!selected) {
      const fallback = take(baseline, cursorBaseline); cursorBaseline = fallback.cursor;
      selected = fallback.candidateId; lane = "nutrition_fallback";
    }
    if (!selected) break;
    used.add(selected);
    const nutrition = byId.get(selected);
    if (!nutrition) throw new TypeError("Composition candidate missing from Nutrition baseline.");
    entries.push(Object.freeze({
      candidate: nutrition.candidate,
      lane,
      nutrition,
      taste: tasteByCandidateId.get(selected) ?? insufficient(selected)
    }));
  }

  if (used.size !== nutritionIndex.size) throw new TypeError("Composition did not preserve the eligible pool.");
  return Object.freeze({
    entries: Object.freeze(entries),
    laneA: Object.freeze(laneA),
    laneB: Object.freeze(laneB)
  });
}

export function rankUtility(rank: number, count: number): number {
  if (!Number.isInteger(rank) || !Number.isInteger(count) || count < 1 || rank < 0 || rank >= count) {
    throw new RangeError("Invalid rank utility input.");
  }
  return count === 1 ? 1 : 1 - rank / (count - 1);
}

function buildLaneA(
  nutritionOrder: readonly ConsumerNextMealNutritionEvaluation[],
  tasteByCandidateId: ReadonlyMap<string, CandidateTasteEvaluation>,
  policy: RecommendationCompositionPolicy
): string[] {
  const output: string[] = [];
  for (let start = 0; start < nutritionOrder.length;) {
    const anchor = nutritionOrder[start];
    let end = start + 1;
    while (end < nutritionOrder.length
      && anchor.score - nutritionOrder[end].score <= policy.laneA.nutritionTolerance) end += 1;
    const band = nutritionOrder.slice(start, end);
    const valid = band.filter((entry) => tasteByCandidateId.get(entry.candidate.candidateId)?.state === "valid")
      .sort((left, right) => {
        const leftTaste = tasteByCandidateId.get(left.candidate.candidateId)?.score ?? 0;
        const rightTaste = tasteByCandidateId.get(right.candidate.candidateId)?.score ?? 0;
        return rightTaste - leftTaste
          || right.score - left.score
          || left.rankOrdinal - right.rankOrdinal
          || left.candidate.candidateId.localeCompare(right.candidate.candidateId);
      });
    let validCursor = 0;
    for (const entry of band) {
      const taste = tasteByCandidateId.get(entry.candidate.candidateId);
      output.push(taste?.state === "valid"
        ? valid[validCursor++].candidate.candidateId
        : entry.candidate.candidateId);
    }
    start = end;
  }
  return output;
}

function buildLaneB(
  nutritionOrder: readonly ConsumerNextMealNutritionEvaluation[],
  tasteByCandidateId: ReadonlyMap<string, CandidateTasteEvaluation>,
  policy: RecommendationCompositionPolicy
): string[] {
  const eligible = nutritionOrder.filter((entry) => tasteByCandidateId.get(entry.candidate.candidateId)?.state === "valid");
  const tasteOrder = [...eligible].sort((left, right) => {
    const leftTaste = tasteByCandidateId.get(left.candidate.candidateId)?.score ?? 0;
    const rightTaste = tasteByCandidateId.get(right.candidate.candidateId)?.score ?? 0;
    return rightTaste - leftTaste
      || left.rankOrdinal - right.rankOrdinal
      || left.candidate.candidateId.localeCompare(right.candidate.candidateId);
  });
  const tasteRank = new Map(tasteOrder.map((entry, index) => [entry.candidate.candidateId, index]));
  const nutritionRank = new Map(eligible.map((entry, index) => [entry.candidate.candidateId, index]));
  return [...eligible].sort((left, right) => {
    const count = eligible.length;
    const leftTasteRank = tasteRank.get(left.candidate.candidateId) ?? count - 1;
    const rightTasteRank = tasteRank.get(right.candidate.candidateId) ?? count - 1;
    const leftNutritionRank = nutritionRank.get(left.candidate.candidateId) ?? count - 1;
    const rightNutritionRank = nutritionRank.get(right.candidate.candidateId) ?? count - 1;
    const leftUtility = policy.laneB.tasteRankWeight * rankUtility(leftTasteRank, count)
      + policy.laneB.nutritionRankWeight * rankUtility(leftNutritionRank, count);
    const rightUtility = policy.laneB.tasteRankWeight * rankUtility(rightTasteRank, count)
      + policy.laneB.nutritionRankWeight * rankUtility(rightNutritionRank, count);
    const leftTaste = tasteByCandidateId.get(left.candidate.candidateId)?.score ?? 0;
    const rightTaste = tasteByCandidateId.get(right.candidate.candidateId)?.score ?? 0;
    return rightUtility - leftUtility
      || rightTaste - leftTaste
      || left.rankOrdinal - right.rankOrdinal
      || left.candidate.candidateId.localeCompare(right.candidate.candidateId);
  }).map((entry) => entry.candidate.candidateId);
}

function normalizeMany(
  values: readonly string[],
  facet: "cuisine" | "flavor",
  authority: PrivateTasteNormalizationAuthority,
  policy: TasteRankingPolicy
): string[] {
  return unique(values.flatMap((sourceValue) => {
    const result = resolvePrivateTasteSourceValue(authority, {
      normalizationPolicyId: PRIVATE_TASTE_NORMALIZATION_POLICY_ID,
      normalizationPolicyVersion: policy.normalizationPolicyVersion,
      ...PRIVATE_TASTE_SOURCE_VOCABULARIES[facet],
      sourceFacet: facet,
      sourceValue,
      enabledFacets: ["cuisine", "flavor", "spice"]
    });
    return result.state === "mapped" && result.targetTaxonomyVersion === policy.candidateTaxonomyVersion
      ? [result.targetValueKey]
      : [];
  }));
}

function pushCategoricalEvidence(
  target: TasteFacetEvidence[],
  facetKey: "cuisine" | "meal_type",
  userValues: readonly string[],
  candidateValues: readonly string[],
  policy: TasteRankingPolicy
) {
  if (userValues.length === 0 || candidateValues.length === 0) return;
  target.push(Object.freeze({
    facetKey,
    score: intersects(userValues, candidateValues)
      ? policy.evidenceScores.categoricalMatch
      : policy.evidenceScores.categoricalKnownDisjoint
  }));
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
