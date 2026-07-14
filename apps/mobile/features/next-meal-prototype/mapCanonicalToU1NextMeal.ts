import type {
  ConsumerNextMealCandidate,
  ConsumerNextMealRecommendationBasis,
  ConsumerNextMealRecommendationResult,
  ConsumerNextMealRecommendationSource
} from "../consumer-meals/types";
import type { NextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import type {
  U1NextMealCandidateViewModel,
  U1NextMealPresentationSource,
  U1NextMealProviderResult,
  U1NextMealRecommendationViewModel
} from "./types";

function toU1Source(source: ConsumerNextMealRecommendationSource): U1NextMealPresentationSource {
  if (source === "local-menu-demo") return "local_menu_demo";
  return "canonical_mock";
}

function toBasisDetails(basis: ConsumerNextMealRecommendationBasis): readonly string[] {
  if (basis === "calorie_proximity") {
    return [
      "按與今日參考熱量的接近程度排序。",
      "今日已記錄飲食已納入參考計算。"
    ];
  }
  return [
    "使用預設參考熱量排序，今日尚未記錄飲食。",
    "完整偏好個人化將於後續提供。"
  ];
}

function toCandidateViewModel(
  candidate: ConsumerNextMealCandidate,
  index: number,
  presentationSource: U1NextMealPresentationSource
): U1NextMealCandidateViewModel {
  return {
    prototypeId: candidate.candidateId,
    source: presentationSource,
    isSampleData: true,
    ordinal: index,
    isBestRecommendation: index === 0,
    mealName: candidate.mealName,
    restaurantName: candidate.restaurantName,
    areaLabel: candidate.areaLabel ?? undefined,
    emoji: candidate.emoji ?? undefined,
    calorieLabel:
      candidate.nutrition.calories != null && candidate.nutrition.calories > 0
        ? `${candidate.nutrition.calories} kcal`
        : undefined,
    tags: Array.from(candidate.tags),
    reasonSummary: candidate.reason.reasonSummary,
    reasonDetails: toBasisDetails(candidate.reason.reasonBasis)
  };
}

export function mapCanonicalToU1NextMeal(
  result: ConsumerNextMealRecommendationResult,
  entitlement: NextMealCandidateEntitlement,
  visibleLimit: number,
  preferredCandidateId?: string
): U1NextMealProviderResult {
  if (result.status === "disabled") {
    return { status: "disabled", message: "下一餐推薦目前未啟用。" };
  }
  if (result.status === "empty") {
    return { status: "empty", message: "目前沒有符合條件的下一餐候選選項。" };
  }
  if (result.status === "intake_unavailable") {
    return {
      status: "error",
      message: "今日飲食記錄服務暫時無法取得。",
      retryable: false
    };
  }
  if (result.status === "read_failed") {
    return {
      status: "error",
      message: "下一餐候選資料讀取失敗，請稍後再試。",
      retryable: true
    };
  }

  const { recommendation } = result;
  const presentationSource = toU1Source(recommendation.source);
  const allCandidates = Array.from(recommendation.candidates);

  let orderedCandidates: ConsumerNextMealCandidate[];
  if (preferredCandidateId) {
    const preferredIndex = allCandidates.findIndex(
      (c) => c.candidateId === preferredCandidateId
    );
    if (preferredIndex > 0) {
      const preferred = allCandidates[preferredIndex];
      orderedCandidates = [
        preferred,
        ...allCandidates.slice(0, preferredIndex),
        ...allCandidates.slice(preferredIndex + 1)
      ];
    } else {
      orderedCandidates = allCandidates;
    }
  } else {
    orderedCandidates = allCandidates;
  }

  const clipped = orderedCandidates.slice(0, visibleLimit);
  const candidates = clipped.map((c, i) =>
    toCandidateViewModel(c, i, presentationSource)
  );

  const viewModel: U1NextMealRecommendationViewModel = {
    source: presentationSource,
    isSampleData: true,
    headline: "這是你的下一餐",
    entitlement,
    visibleCandidateCount: candidates.length,
    candidates
  };

  return { status: "success", recommendation: viewModel };
}
