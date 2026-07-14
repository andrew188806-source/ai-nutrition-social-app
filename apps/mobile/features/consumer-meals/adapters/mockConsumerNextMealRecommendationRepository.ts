import type {
  ConsumerNextMealCandidate,
  ConsumerNextMealDataProvenance,
  ConsumerNextMealRecommendationRepository,
  ConsumerNextMealRecommendationRepositoryInput,
  ConsumerNextMealRecommendationRepositoryResult,
  ConsumerNextMealRecommendationSource,
  ConsumerNutritionSnapshot
} from "../types";

export const MOCK_NEXT_MEAL_RECOMMENDATION_CANDIDATES_COUNT = 5;

type MockCandidateSeed = {
  candidateId: string;
  restaurantId: string;
  mealName: string;
  restaurantName: string;
  areaLabel: string;
  emoji: string;
  nutrition: ConsumerNutritionSnapshot;
  tags: readonly string[];
  calorieProximityDelta: number;
};

const MOCK_CANDIDATE_SEEDS: readonly MockCandidateSeed[] = [
  {
    candidateId: "mock-next-meal-phase2q-haochu-bowl",
    restaurantId: "mock-restaurant-haochu-01",
    mealName: "好廚碗",
    restaurantName: "好廚示範廚房",
    areaLabel: "大安區",
    emoji: "🥢",
    nutrition: { calories: 510, protein: 28, carbohydrates: 62, fat: 14, fiber: 6 },
    tags: ["高蛋白", "含纖維", "均衡選擇"],
    calorieProximityDelta: 10
  },
  {
    candidateId: "mock-next-meal-phase2q-salad-bowl",
    restaurantId: "mock-restaurant-haochu-02",
    mealName: "輕食沙拉碗",
    restaurantName: "清爽廚房",
    areaLabel: "信義區",
    emoji: "🥗",
    nutrition: { calories: 380, protein: 18, carbohydrates: 42, fat: 10, fiber: 9 },
    tags: ["低卡", "含纖維", "清爽搭配"],
    calorieProximityDelta: 140
  },
  {
    candidateId: "mock-next-meal-phase2q-noodle-soup",
    restaurantId: "mock-restaurant-haochu-03",
    mealName: "清燉牛肉麵",
    restaurantName: "台灣麵館",
    areaLabel: "中山區",
    emoji: "🍜",
    nutrition: { calories: 560, protein: 32, carbohydrates: 72, fat: 12, fiber: 3 },
    tags: ["高蛋白", "均衡選擇"],
    calorieProximityDelta: 40
  },
  {
    candidateId: "mock-next-meal-phase2q-rice-box",
    restaurantId: "mock-restaurant-haochu-04",
    mealName: "雞腿便當",
    restaurantName: "好吃便當",
    areaLabel: "松山區",
    emoji: "🍱",
    nutrition: { calories: 620, protein: 35, carbohydrates: 80, fat: 16, fiber: 4 },
    tags: ["高蛋白", "飽足感"],
    calorieProximityDelta: 100
  },
  {
    candidateId: "mock-next-meal-phase2q-veggie-plate",
    restaurantId: "mock-restaurant-haochu-05",
    mealName: "蔬食拼盤",
    restaurantName: "蔬食餐廳",
    areaLabel: "大安區",
    emoji: "🥦",
    nutrition: { calories: 290, protein: 12, carbohydrates: 48, fat: 6, fiber: 11 },
    tags: ["低卡", "高纖", "蔬食"],
    calorieProximityDelta: 230
  }
];

function rankByCalorieProximity(
  seeds: readonly MockCandidateSeed[],
  referenceCaloriesPerMeal: number
): MockCandidateSeed[] {
  return [...seeds].sort(
    (a, b) =>
      Math.abs((a.nutrition.calories ?? 0) - referenceCaloriesPerMeal) -
      Math.abs((b.nutrition.calories ?? 0) - referenceCaloriesPerMeal)
  );
}

export class MockConsumerNextMealRecommendationRepository implements ConsumerNextMealRecommendationRepository {
  readonly source: ConsumerNextMealRecommendationSource = "mock";
  readonly dataProvenance: ConsumerNextMealDataProvenance = "sample";

  async getRankedNextMealCandidates(
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult> {
    const ranked = rankByCalorieProximity(MOCK_CANDIDATE_SEEDS, input.referenceCaloriesPerMeal);
    const limit = input.candidatePoolLimit != null && input.candidatePoolLimit > 0
      ? Math.min(input.candidatePoolLimit, ranked.length)
      : ranked.length;
    const sliced = ranked.slice(0, limit);

    if (!sliced.length) return { status: "empty" };

    const candidates: ConsumerNextMealCandidate[] = sliced.map((seed, index) => ({
      candidateId: seed.candidateId,
      restaurantId: seed.restaurantId,
      mealName: seed.mealName,
      restaurantName: seed.restaurantName,
      areaLabel: seed.areaLabel,
      emoji: seed.emoji,
      nutrition: seed.nutrition,
      tags: seed.tags,
      reason: {
        reasonSummary: index === 0
          ? "與目前熱量參考值最接近的 Phase 2Q 示範選項。"
          : "同一 deterministic mock 排序中的替代示範選項。",
        reasonBasis: "calorie_proximity"
      },
      rankOrdinal: index
    }));

    return { status: "available", candidates, totalCandidateCount: candidates.length };
  }
}
