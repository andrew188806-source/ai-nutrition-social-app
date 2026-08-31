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
    branchName: candidate.branchName ?? undefined,
    imageUrl: candidate.imageUrl ?? undefined,
    description: candidate.description ?? undefined,
    emoji: candidate.emoji ?? undefined,
    calorieLabel:
      candidate.nutrition.calories != null && candidate.nutrition.calories > 0
        ? `${candidate.nutrition.calories} kcal`
        : undefined,
    tags: Array.from(candidate.tags),
    nutrition: { ...candidate.nutrition },
    nutritionSource: candidate.nutritionSource ?? undefined,
    reasonSummary: candidate.reason.reasonSummary,
    reasonCode: candidate.reason.reasonCode,
    reasonDetails: Array.from(candidate.reason.detailSummaries ?? []),
    recommendationLane: candidate.recommendationLane
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
    return { status: "empty", message: result.reason === "allergy_eligibility"
      ? "目前沒有能依現有過敏原資料確認可推薦的餐點。請向店家確認成分與交叉接觸風險。"
      : result.reason === "ingredient_avoidance_eligibility"
      ? "目前沒有能依「我不吃的食物」設定與已確認成分資料推薦的餐點。"
      : result.geoStatus === "applied"
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
    if (result.errorCode === "next_meal_allergy_unresolved_user_allergy") {
      return {
        status: "error",
        message: "有部分過敏設定目前無法辨識，請先到「個人設定 → 飲食限制 → 過敏原」重新確認設定。",
        retryable: false
      };
    }
    if (result.errorCode === "next_meal_allergy_authority_unavailable") {
      return {
        status: "error",
        message: "目前無法確認你的過敏限制，請稍後再試。",
        retryable: true
      };
    }
    if (result.errorCode === "next_meal_ingredient_avoidance_unresolved_governed_avoidance") {
      return {
        status: "error",
        message: "有部分「我不吃的食物」設定目前無法辨識，請先回到個人設定重新確認。",
        retryable: false
      };
    }
    if (result.errorCode === "next_meal_ingredient_avoidance_authority_unavailable") {
      return {
        status: "error",
        message: "目前無法確認「我不吃的食物」設定，請稍後再試。",
        retryable: true
      };
    }
    return {
      status: "error",
      message: "下一餐候選資料讀取失敗，請稍後再試。",
      retryable: true
    };
  }

  const { recommendation } = result;
  const presentationSource = toU1Source(recommendation.source);
  // The final dual-lane order is exposure authority. Navigation hints may not reorder it before
  // entitlement clipping; both Free and Premium see prefixes of this exact same sequence.
  void preferredMenuItemId;
  const clipped = Array.from(recommendation.candidates).slice(0, visibleLimit);
  const candidates = clipped.map((c, i) =>
    toCandidateViewModel(c, i, presentationSource)
  );

  const viewModel: U1NextMealRecommendationViewModel = {
    source: presentationSource,
    isSampleData: true,
    headline: "這是你的下一餐",
    entitlement,
    visibleCandidateCount: candidates.length,
    contextNote: recommendation.context.ingredientAvoidanceEligibilityStatus === "applied"
      ? "已依「我不吃的食物」設定與可確認的餐點成分篩選候選餐點。"
      : recommendation.context.allergyEligibilityStatus === "applied"
      ? "已依你設定的過敏原排除已知成分衝突；仍請向店家確認成分與交叉接觸風險。"
      : recommendation.context.tasteRankingStatus === "applied"
      ? "本次推薦參考今天的營養需求與你明確設定的口味偏好。"
      : recommendation.context.rankingMode === "nutrition_gap"
      ? "本次排序使用每日營養目標與今天已記錄的攝取量。"
      : "本次缺少可共同計算的營養目標與餐點資料，因此使用穩定中性排序，未宣稱個人化。",
    candidates
  };

  return { status: "success", recommendation: viewModel };
}
