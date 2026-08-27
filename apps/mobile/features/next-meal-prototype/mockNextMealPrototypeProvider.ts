import { mobileMenuItemService } from "../../services/mobile-menu-item-service";
import { mobileRestaurantService } from "../../services/mobile-restaurant-service";
import { getNextMealCandidateCount, normalizeNextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import type { U1NextMealCandidateViewModel, U1NextMealPrototypeProvider, U1NextMealRecommendationViewModel } from "./types";

const prototypeReferenceCalories = 520;

type PrototypeCandidateRow = {
  prototypeId: string;
  restaurantId: string;
  mealName: string;
  calories: number;
  protein: number;
  fiber?: number;
  restaurantName: string;
  areaLabel: string;
  emoji?: string;
  restaurantTags: string[];
};

export function createU1MockNextMealPrototypeProvider({ enabled }: { enabled: boolean }): U1NextMealPrototypeProvider {
  return {
    async getRecommendation({ entitlement: entitlementInput, preferredMenuItemId, preferredPrototypeId, scenario = "success" }) {
      if (!enabled) {
        return {
          status: "disabled",
          message: "下一餐範例資料目前未啟用，沒有假裝取得真實推薦。"
        };
      }

      if (scenario === "error") {
        return {
          status: "error",
          message: "暫時無法載入下一餐範例，請稍後再試。",
          retryable: true
        };
      }

      if (scenario === "empty") {
        return {
          status: "empty",
          message: "目前沒有可顯示的下一餐範例。"
        };
      }

      const entitlement = normalizeNextMealCandidateEntitlement(entitlementInput);
      const visibleLimit = getNextMealCandidateCount(entitlement);
      const maximumSharedLimit = getNextMealCandidateCount("premium");
      const rankedRows = mobileMenuItemService
        .getRecommendedMenuItemsForNextMeal(maximumSharedLimit, prototypeReferenceCalories)
        .map((item): PrototypeCandidateRow | null => {
          const restaurant = mobileRestaurantService.findRestaurantById(item.restaurantId);
          if (!restaurant) return null;
          const menuItem = mobileMenuItemService.findMenuItemById(item.menuItemId);
          return {
            prototypeId: item.menuItemId,
            restaurantId: item.restaurantId,
            mealName: item.dishName,
            calories: item.calories,
            protein: item.protein,
            fiber: menuItem?.fiber,
            restaurantName: item.restaurantName,
            areaLabel: restaurant.location,
            emoji: item.emoji,
            restaurantTags: restaurant.tags
          };
        })
        .filter((item): item is PrototypeCandidateRow => item !== null);

      const preferredRow = buildPreferredCandidateRow(preferredMenuItemId ?? preferredPrototypeId);
      const orderedRows = uniqueCandidates(preferredRow ? [preferredRow, ...rankedRows] : rankedRows).slice(0, visibleLimit);
      if (!orderedRows.length) {
        return {
          status: "empty",
          message: "找不到下一餐範例，請從首頁重新開啟。"
        };
      }

      const candidates = orderedRows.map((row, index) => toCandidateViewModel(row, index));
      const recommendation: U1NextMealRecommendationViewModel = {
        source: "u1_mock",
        isSampleData: true,
        headline: "這是你的下一餐",
        entitlement,
        visibleCandidateCount: candidates.length,
        candidates
      };

      return { status: "success", recommendation };
    }
  };
}

function buildPreferredCandidateRow(prototypeId: string | undefined): PrototypeCandidateRow | null {
  const menuItem = mobileMenuItemService.findMenuItemById(prototypeId);
  const restaurant = mobileRestaurantService.findRestaurantById(menuItem?.restaurantId);
  if (!menuItem || !restaurant) return null;
  return {
    prototypeId: menuItem.menuItemId,
    restaurantId: menuItem.restaurantId,
    mealName: menuItem.name,
    calories: menuItem.calories,
    protein: menuItem.protein,
    fiber: menuItem.fiber,
    restaurantName: restaurant.name,
    areaLabel: restaurant.location,
    emoji: menuItem.emoji,
    restaurantTags: restaurant.tags
  };
}

function uniqueCandidates(rows: PrototypeCandidateRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.prototypeId)) return false;
    seen.add(row.prototypeId);
    return true;
  });
}

function toCandidateViewModel(row: PrototypeCandidateRow, index: number): U1NextMealCandidateViewModel {
  return {
    prototypeId: row.prototypeId,
    source: "u1_mock",
    isSampleData: true,
    ordinal: index,
    isBestRecommendation: index === 0,
    mealName: row.mealName,
    restaurantName: row.restaurantName,
    areaLabel: row.areaLabel,
    emoji: row.emoji,
    calorieLabel: row.calories > 0 ? `${row.calories} kcal` : undefined,
    tags: buildPresentationTags(row.protein, row.fiber, row.restaurantTags),
    reasonSummary: index === 0 ? "固定排序中的首選範例，方便先比較最適合的呈現方式。" : "同一份 deterministic mock 排序中的替代選項。",
    reasonDetails: ["目前只展示 U1 prototype data，不是正式營養缺口演算法。", "餐點與餐廳名稱來自既有 restaurant sample dataset。"]
  };
}

function buildPresentationTags(protein: number, fiber: number | undefined, restaurantTags: string[]) {
  const tags = [protein >= 25 ? "高蛋白" : "均衡選擇", fiber && fiber > 0 ? "含纖維" : "清爽搭配", ...restaurantTags.filter((tag) => tag !== "藍勾勾認證")];
  return [...new Set(tags)].slice(0, 4);
}
