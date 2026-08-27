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
  if (basis === "nutrition_gap") {
    return [
      "依每日營養目標與今日已記錄攝取量的剩餘缺口排序。",
      "僅計入目標、今日攝取與餐點資料都可用的熱量、蛋白質、碳水、脂肪與纖維。",
      "超過已滿足的目標會降低排序分數。"
    ];
  }
  return [
    "目前沒有可共同計算的每日目標與餐點營養資料。",
    "結果使用穩定中性排序，未宣稱套用個人化營養計算。"
  ];
}

function toCandidateViewModel(
  candidate: ConsumerNextMealCandidate,
  index: number,
  presentationSource: U1NextMealPresentationSource
): U1NextMealCandidateViewModel {
  return {
    prototypeId: candidate.candidateId,
    branchMenuItemId: candidate.branchMenuItemId,
    menuItemId: candidate.menuItemId,
    restaurantId: candidate.restaurantId,
    branchId: candidate.branchId ?? null,
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
  preferredMenuItemId?: string
): U1NextMealProviderResult {
  if (result.status === "disabled") {
    return { status: "disabled", message: "下一餐推薦目前未啟用。" };
  }
  if (result.status === "empty") {
    return { status: "empty", message: result.geoStatus === "applied"
      ? "目前附近沒有可用的下一餐候選選項。"
      : "目前沒有符合條件的下一餐候選選項。" };
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
  if (preferredMenuItemId) {
    const preferredIndex = allCandidates.findIndex(
      (c) => c.menuItemId === preferredMenuItemId
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
    contextNote: recommendation.context.rankingMode === "nutrition_gap"
      ? "本次排序已使用每日營養目標與今天已記錄的攝取量；未使用 Taste、飲食限制或社交情境。"
      : "本次缺少可共同計算的營養目標與餐點資料，因此使用穩定中性排序，未宣稱個人化。",
    candidates
  };

  return { status: "success", recommendation: viewModel };
}
