import type { RestaurantDomain } from "@haocu/shared/domain";

export type NutritionSourceLabel =
  | "restaurant_verified"
  | "admin_verified"
  | "restaurant_confirmed"
  | "platform_reviewed"
  | "ai_estimated"
  | "pending"
  | "missing";

export type MobileMenuVerificationStatus = "restaurant_verified" | "ai_estimated" | "pending_review";

export type RecommendedMenuItemViewModel = {
  menuItemId: string;
  restaurantId: string;
  branchId?: string;
  branchMenuItemId?: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  price: number;
  tags: string[];
  image?: string;
  emoji?: string;
  mealType?: string;
  source: "restaurant_menu" | "ai_user_uploaded";
  verificationStatus: MobileMenuVerificationStatus;
  availability: RestaurantDomain.BranchMenuItem["availability"] | "unknown";
  nutritionSourceLabel: NutritionSourceLabel;
  nutrition?: RestaurantDomain.MenuItemNutrition;
  nutritionEstimate?: RestaurantDomain.NutritionEstimate;
  nutritionReview?: RestaurantDomain.NutritionReview;
};

export type RestaurantCardViewModel = {
  id: string;
  restaurantId: string;
  branchId?: string;
  name: string;
  location: string;
  address?: string;
  distanceDisplay: string;
  category: string;
  tags: string[];
  priceRange: string;
  rating?: string;
  score: string;
  aliases?: string[];
  menuItems: RecommendedMenuItemViewModel[];
};

export type RestaurantDetailViewModel = RestaurantCardViewModel & {
  branches: RestaurantDomain.RestaurantBranch[];
};

export type MealBuddyRestaurantViewModel = {
  restaurantId: string;
  branchId?: string;
  restaurantNameSnapshot: string;
  branchNameSnapshot?: string;
  menuItemId?: string;
  menuItemNameSnapshot?: string;
  priceSnapshot?: number;
  nutritionSnapshot?: Pick<RecommendedMenuItemViewModel, "calories" | "protein" | "carbs" | "fat" | "fiber">;
};

export type AnalyzedMealViewModel = {
  restaurantId?: string;
  branchId?: string;
  menuItemId?: string;
  restaurantNameSnapshot?: string;
  menuItemNameSnapshot: string;
  nutritionSnapshot: Pick<RecommendedMenuItemViewModel, "calories" | "protein" | "carbs" | "fat" | "fiber">;
  nutritionSourceLabel: NutritionSourceLabel;
};

export type AliasResolutionViewModel = {
  matched: boolean;
  menuItemId?: string;
  aliasId?: string;
  confidenceScore?: number;
  unresolvedInput?: string;
};

export type NextMealRecommendationViewModel = {
  menuItemId: string;
  restaurantId: string;
  branchId?: string;
  branchMenuItemId?: string;
  dishName: string;
  calories: number;
  protein: number;
  restaurantName: string;
  distance: string;
  emoji: string;
  reason: string;
  matchPercent: number;
};
