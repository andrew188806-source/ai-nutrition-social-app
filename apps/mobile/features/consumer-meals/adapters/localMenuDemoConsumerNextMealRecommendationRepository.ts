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

export class LocalMenuDemoConsumerNextMealRecommendationRepository implements ConsumerNextMealRecommendationRepository {
  readonly source: ConsumerNextMealRecommendationSource = "local-menu-demo";
  readonly dataProvenance: ConsumerNextMealDataProvenance = "sample";

  async getRankedNextMealCandidates(
    input: ConsumerNextMealRecommendationRepositoryInput
  ): Promise<ConsumerNextMealRecommendationRepositoryResult> {
    try {
      const fetchLimit = input.candidatePoolLimit != null && input.candidatePoolLimit > 0
        ? input.candidatePoolLimit
        : 20;

      const ranked = mobileMenuItemService.getRecommendedMenuItemsForNextMeal(
        fetchLimit,
        input.referenceCaloriesPerMeal
      );

      if (!ranked.length) return { status: "empty" };

      const candidates: ConsumerNextMealCandidate[] = ranked
        .map((item, index): ConsumerNextMealCandidate | null => {
          const restaurant = mobileRestaurantService.findRestaurantById(item.restaurantId);
          if (!restaurant) return null;
          const nutrition: ConsumerNutritionSnapshot = {
            calories: item.calories,
            protein: item.protein
          };
          return {
            candidateId: item.menuItemId,
            restaurantId: item.restaurantId,
            branchId: item.branchId ?? null,
            mealName: item.dishName,
            restaurantName: item.restaurantName,
            areaLabel: item.distance ?? restaurant.location ?? null,
            emoji: item.emoji ?? null,
            nutrition,
            tags: buildDemoTags(item.protein, restaurant.tags),
            reason: {
              reasonSummary: index === 0
                ? "與目前熱量參考值最接近的示範菜單選項（本地示範資料）。"
                : "同一 demo 排序中的替代示範選項（本地示範資料）。",
              reasonBasis: "calorie_proximity"
            },
            rankOrdinal: index
          };
        })
        .filter((c): c is ConsumerNextMealCandidate => c !== null);

      if (!candidates.length) return { status: "empty" };

      return { status: "available", candidates, totalCandidateCount: candidates.length };
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
