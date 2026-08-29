import type {
  ConsumerNextMealCandidate,
  ConsumerNextMealDataProvenance,
  ConsumerNextMealRecommendationRepository,
  ConsumerNextMealRecommendationRepositoryInput,
  ConsumerNextMealRecommendationRepositoryResult,
  ConsumerNextMealRecommendationSource,
  ConsumerNutritionSnapshot
} from "../types";
import { rankNextMealCandidatesByNutrition } from "../nextMealNutritionRanker";

export const MOCK_NEXT_MEAL_RECOMMENDATION_CANDIDATES_COUNT = 5;

type MockCandidateSeed = {
  candidateId: string;
  menuItemId: string;
  restaurantId: string;
  mealName: string;
  restaurantName: string;
  areaLabel: string;
  emoji: string;
  nutrition: ConsumerNutritionSnapshot;
  tags: readonly string[];
};

const MOCK_CANDIDATE_SEEDS: readonly MockCandidateSeed[] = [
  {
    candidateId: "mock-branch-offer-phase2q-haochu-bowl",
    menuItemId: "mock-menu-item-phase2q-haochu-bowl",
    restaurantId: "mock-restaurant-haochu-01",
    mealName: "好廚碗",
    restaurantName: "好廚示範廚房",
    areaLabel: "大安區",
    emoji: "🥢",
    nutrition: { calories: 510, protein: 28, carbohydrates: 62, fat: 14, fiber: 6 },
    tags: ["高蛋白", "含纖維", "均衡選擇"],
  },
  {
    candidateId: "mock-branch-offer-phase2q-salad-bowl",
    menuItemId: "mock-menu-item-phase2q-salad-bowl",
    restaurantId: "mock-restaurant-haochu-02",
    mealName: "輕食沙拉碗",
    restaurantName: "清爽廚房",
    areaLabel: "信義區",
    emoji: "🥗",
    nutrition: { calories: 380, protein: 18, carbohydrates: 42, fat: 10, fiber: 9 },
    tags: ["低卡", "含纖維", "清爽搭配"],
  },
  {
    candidateId: "mock-branch-offer-phase2q-noodle-soup",
    menuItemId: "mock-menu-item-phase2q-noodle-soup",
    restaurantId: "mock-restaurant-haochu-03",
    mealName: "清燉牛肉麵",
    restaurantName: "台灣麵館",
    areaLabel: "中山區",
    emoji: "🍜",
    nutrition: { calories: 560, protein: 32, carbohydrates: 72, fat: 12, fiber: 3 },
    tags: ["高蛋白", "均衡選擇"],
  },
  {
    candidateId: "mock-branch-offer-phase2q-rice-box",
    menuItemId: "mock-menu-item-phase2q-rice-box",
    restaurantId: "mock-restaurant-haochu-04",
    mealName: "雞腿便當",
    restaurantName: "好吃便當",
    areaLabel: "松山區",
    emoji: "🍱",
    nutrition: { calories: 620, protein: 35, carbohydrates: 80, fat: 16, fiber: 4 },
    tags: ["高蛋白", "飽足感"],
  },
  {
    candidateId: "mock-branch-offer-phase2q-veggie-plate",
    menuItemId: "mock-menu-item-phase2q-veggie-plate",
    restaurantId: "mock-restaurant-haochu-05",
    mealName: "蔬食拼盤",
    restaurantName: "蔬食餐廳",
    areaLabel: "大安區",
    emoji: "🥦",
    nutrition: { calories: 290, protein: 12, carbohydrates: 48, fat: 6, fiber: 11 },
    tags: ["低卡", "高纖", "蔬食"],
  }
];

export class MockConsumerNextMealRecommendationRepository implements ConsumerNextMealRecommendationRepository {
  readonly source: ConsumerNextMealRecommendationSource = "mock";
  readonly dataProvenance: ConsumerNextMealDataProvenance = "sample";

  async getRankedNextMealCandidates(
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult> {
    const mapped: ConsumerNextMealCandidate[] = MOCK_CANDIDATE_SEEDS.map((seed, index) => ({
      candidateId: seed.candidateId,
      branchMenuItemId: seed.candidateId,
      menuItemId: seed.menuItemId,
      restaurantId: seed.restaurantId,
      mealName: seed.mealName,
      restaurantName: seed.restaurantName,
      areaLabel: seed.areaLabel,
      emoji: seed.emoji,
      nutrition: seed.nutrition,
      tags: seed.tags,
      reason: {
        reasonSummary: "尚未套用營養排序。",
        reasonBasis: "neutral_nutrition_fallback",
        reasonCode: "neutral_nutrition_fallback",
        detailSummaries: []
      },
      rankOrdinal: index
    }));
    const ranked = rankNextMealCandidatesByNutrition(mapped, input.nutritionRanking, input.nutritionRankingPolicy);
    const limit = input.candidatePoolLimit != null && input.candidatePoolLimit > 0
      ? Math.min(Math.floor(input.candidatePoolLimit), ranked.candidates.length)
      : ranked.candidates.length;
    const candidates = ranked.candidates.slice(0, limit);

    if (!candidates.length) return { status: "empty" };

    return {
      status: "available",
      candidates,
      totalCandidateCount: ranked.candidates.length,
      ranking: ranked.ranking,
      allergyEligibility: { status: "not_applied" },
      tasteRanking: { status: "unavailable" }
    };
  }
}
