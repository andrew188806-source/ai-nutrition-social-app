import { mobileMenuItemService } from "../../../services/mobile-menu-item-service";
import { mobileRestaurantService } from "../../../services/mobile-restaurant-service";
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

export class LocalMenuDemoConsumerNextMealRecommendationRepository implements ConsumerNextMealRecommendationRepository {
  readonly source: ConsumerNextMealRecommendationSource = "local-menu-demo";
  readonly dataProvenance: ConsumerNextMealDataProvenance = "sample";

  async getRankedNextMealCandidates(
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult> {
    try {
      const rows = mobileMenuItemService.listNextMealCandidateInputs();
      if (!rows.length) return { status: "empty" };

      const mapped: ConsumerNextMealCandidate[] = rows
        .map((item, index): ConsumerNextMealCandidate | null => {
          const restaurant = mobileRestaurantService.findRestaurantById(item.restaurantId);
          if (!restaurant || !item.branchMenuItemId) return null;
          const nutrition: ConsumerNutritionSnapshot = {
            calories: item.calories,
            protein: item.protein
          };
          return {
            candidateId: item.branchMenuItemId,
            branchMenuItemId: item.branchMenuItemId,
            menuItemId: item.menuItemId,
            restaurantId: item.restaurantId,
            branchId: item.branchId ?? null,
            mealName: item.dishName,
            restaurantName: item.restaurantName,
            areaLabel: item.distance ?? restaurant.location ?? null,
            emoji: item.emoji ?? null,
            nutrition,
            tags: buildDemoTags(item.protein, restaurant.tags),
            reason: {
              reasonSummary: "尚未套用營養排序。",
              reasonBasis: "neutral_nutrition_fallback",
              reasonCode: "neutral_nutrition_fallback",
              detailSummaries: []
            },
            rankOrdinal: index
          };
        })
        .filter((c): c is ConsumerNextMealCandidate => c !== null);

      if (!mapped.length) return { status: "empty" };

      const ranked = rankNextMealCandidatesByNutrition(mapped, input.nutritionRanking, input.nutritionRankingPolicy);
      const limit = input.candidatePoolLimit != null && input.candidatePoolLimit > 0
        ? Math.min(Math.floor(input.candidatePoolLimit), ranked.candidates.length)
        : ranked.candidates.length;
      const candidates = ranked.candidates.slice(0, limit);

      return {
        status: "available",
        candidates,
        totalCandidateCount: ranked.candidates.length,
        ranking: ranked.ranking,
        tasteRanking: { status: "unavailable" }
      };
    } catch {
      return { status: "read_failed", errorCode: "next_meal_local_demo_data_error" };
    }
  }
}

function buildDemoTags(protein: number, restaurantTags: string[]): readonly string[] {
  const tags = [
    protein >= 25 ? "高蛋白" : "均衡選擇",
    ...restaurantTags.filter((tag) => tag !== "藍勾勾認證")
  ];
  return [...new Set(tags)].slice(0, 4);
}
