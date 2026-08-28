import type { CandidateTasteFacetKey } from "../../../../packages/shared/src/domain/candidate-taste";
import type { RecommendationCompositionEntry } from "./recommendationTasteRanking";
import type { ConsumerNextMealCandidateReason, ConsumerNextMealReasonCode } from "./types";

export function buildRecommendationReason(
  entry: RecommendationCompositionEntry
): ConsumerNextMealCandidateReason {
  const nutrition = entry.nutrition.hasPositiveGapContribution;
  const positiveFacet = preferredPositiveFacet(entry.taste.positiveFacetKeys);
  const tasteCode = positiveReasonCode(positiveFacet);
  const tasteSummary = positiveSummary(positiveFacet);
  const tasteFirst = entry.lane === "taste_forward";

  let reasonCode: ConsumerNextMealReasonCode = "taste_evidence_insufficient";
  let reasonBasis: ConsumerNextMealCandidateReason["reasonBasis"] = "neutral_nutrition_fallback";
  let reasonSummary = "";
  if (tasteFirst && tasteSummary) {
    reasonCode = tasteCode;
    reasonBasis = "positive_taste_match";
    reasonSummary = tasteSummary;
  } else if (nutrition) {
    reasonCode = "nutrition_gap_match";
    reasonBasis = "nutrition_gap";
    reasonSummary = "有助補足今天尚未滿足的營養需求。";
  } else if (tasteSummary) {
    reasonCode = tasteCode;
    reasonBasis = "positive_taste_match";
    reasonSummary = tasteSummary;
  }

  const detailSummaries: string[] = [];
  if (nutrition) detailSummaries.push("這份餐點可補充今天仍有缺口的營養維度。");
  if (tasteSummary) detailSummaries.push(tasteSummary);
  if (entry.taste.dislikedFlavorOverlap) {
    detailSummaries.push("部分已知風味與你的偏好較不一致。");
  }
  if (detailSummaries.length === 0) {
    detailSummaries.push("目前以可用的餐點與營養資料提供穩定排序。");
  }

  return Object.freeze({ reasonCode, reasonBasis, reasonSummary, detailSummaries: Object.freeze(detailSummaries) });
}

function preferredPositiveFacet(facets: readonly CandidateTasteFacetKey[]): CandidateTasteFacetKey | null {
  for (const facet of ["cuisine", "meal_type", "spice"] as const) {
    if (facets.includes(facet)) return facet;
  }
  return null;
}

function positiveReasonCode(facet: CandidateTasteFacetKey | null): ConsumerNextMealReasonCode {
  if (facet === "cuisine") return "preferred_cuisine_match";
  if (facet === "meal_type") return "preferred_meal_type_match";
  if (facet === "spice") return "spice_preference_match";
  return "taste_evidence_insufficient";
}

function positiveSummary(facet: CandidateTasteFacetKey | null): string {
  if (facet === "cuisine") return "符合你偏好的料理類型。";
  if (facet === "meal_type") return "符合你偏好的用餐時段。";
  if (facet === "spice") return "辣度接近你的偏好。";
  return "";
}
