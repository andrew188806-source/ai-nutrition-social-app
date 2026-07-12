import type { RestaurantDomain } from "@haocu/shared/domain";
import { mobileNutritionService } from "../mobile-nutrition-service";
import type { RecommendedMenuItemViewModel } from "../../view-models/restaurant-view-models";

const FALLBACK_PRICE = 0;

const menuItemEmojiByTag: Record<string, string> = {
  "tag-drink": "DR",
  "tag-high-protein": "HP",
  "tag-restaurant-high-protein": "HP",
  "tag-restaurant-vegetarian": "VG",
  "tag-restaurant-low-calorie": "LC"
};

export function toRecommendedMenuItemViewModel(
  menuItem: RestaurantDomain.MenuItem,
  branchMenuItem: RestaurantDomain.BranchMenuItem | null
): RecommendedMenuItemViewModel {
  const formalNutrition = mobileNutritionService.getFormalNutrition(menuItem.id);
  const estimate = mobileNutritionService.getAiEstimate(menuItem.id);
  const review = mobileNutritionService.getLatestReview(menuItem.id);
  const nutritionSourceLabel = mobileNutritionService.getNutritionSourceLabel(menuItem.id);
  const calories = formalNutrition?.calories ?? estimate?.calories ?? 0;
  const protein = formalNutrition?.protein ?? estimate?.protein ?? 0;
  const carbs = formalNutrition?.carbohydrates ?? estimate?.carbohydrates ?? 0;
  const fat = formalNutrition?.fat ?? estimate?.fat ?? 0;
  const verificationStatus =
    formalNutrition?.source === "restaurant_verified" || formalNutrition?.source === "admin_verified"
      ? "restaurant_verified"
      : formalNutrition?.source === "ai_estimated"
        ? "ai_estimated"
        : "pending_review";

  return {
    menuItemId: menuItem.id,
    restaurantId: menuItem.restaurantId,
    branchId: branchMenuItem?.branchId,
    branchMenuItemId: branchMenuItem?.id,
    name: branchMenuItem?.branchSpecificName ?? menuItem.name,
    calories,
    protein,
    carbs,
    fat,
    fiber: formalNutrition?.fiber,
    price: branchMenuItem?.price ?? FALLBACK_PRICE,
    tags: [...menuItem.tagIds],
    image: menuItem.imageUrl,
    emoji: inferEmoji(menuItem),
    mealType: inferMealType(menuItem),
    source: verificationStatus === "pending_review" ? "ai_user_uploaded" : "restaurant_menu",
    verificationStatus,
    availability: branchMenuItem?.availability ?? "unknown",
    nutritionSourceLabel,
    nutrition: formalNutrition ?? undefined,
    nutritionEstimate: estimate ?? undefined,
    nutritionReview: review ?? undefined
  };
}

export function buildPriceRange(items: RecommendedMenuItemViewModel[]) {
  const prices = items.map((item) => item.price).filter((price) => price > 0);
  if (!prices.length) return "NT$--";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `NT$${min}` : `NT$${min}-${max}`;
}

function inferEmoji(menuItem: RestaurantDomain.MenuItem) {
  for (const tag of menuItem.tagIds) {
    if (menuItemEmojiByTag[tag]) return menuItemEmojiByTag[tag];
  }
  return "TK";
}

function inferMealType(menuItem: RestaurantDomain.MenuItem) {
  if (menuItem.tagIds.includes("tag-drink")) return "drink";
  if (menuItem.menuCategoryId.includes("light")) return "light";
  return "meal";
}
