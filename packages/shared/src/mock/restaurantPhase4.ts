import type {
  Ingredient,
  MenuItem,
  Restaurant,
  RestaurantAnalytics,
  RestaurantVerificationRequest,
  RestaurantVipMember
} from "../types";

export const mockRestaurantProfile: Restaurant = {
  id: "restaurant-haochu-bowl",
  ownerUserId: "user-restaurant-owner-1",
  name: "Haochu Health Bowl",
  isVerified: true,
  tagIds: ["tag-restaurant-verified", "tag-restaurant-nutrition", "tag-restaurant-high-protein"]
};

export const mockMenuItems: MenuItem[] = [
  {
    id: "menu-chicken-bowl",
    restaurantId: mockRestaurantProfile.id,
    name: "Chicken Protein Bowl",
    priceTwd: 185,
    tagIds: ["tag-restaurant-high-protein", "tag-menu-disclosed", "tag-menu-health-goal-fit"],
    portionSize: "regular",
    cookingMethod: "grilled",
    calories: 620,
    proteinGrams: 38,
    carbsGrams: 58,
    fatGrams: 22,
    disclosureStatus: "published"
  },
  {
    id: "menu-veggie-fiber-bowl",
    restaurantId: mockRestaurantProfile.id,
    name: "High Fiber Veggie Bowl",
    priceTwd: 168,
    tagIds: ["tag-restaurant-vegetarian", "tag-restaurant-low-calorie", "tag-menu-ai-estimated"],
    portionSize: "regular",
    cookingMethod: "steamed",
    calories: 520,
    proteinGrams: 24,
    carbsGrams: 64,
    fatGrams: 16,
    disclosureStatus: "ready"
  }
];

export const mockIngredients: Ingredient[] = [
  { id: "ingredient-chicken", menuItemId: "menu-chicken-bowl", name: "chicken breast", amount: "150g" },
  { id: "ingredient-brown-rice", menuItemId: "menu-chicken-bowl", name: "brown rice", amount: "120g" },
  { id: "ingredient-vegetables", menuItemId: "menu-veggie-fiber-bowl", name: "seasonal vegetables", amount: "220g" }
];

export const mockRestaurantVerificationRequest: RestaurantVerificationRequest = {
  id: "verification-haochu-1",
  restaurantId: mockRestaurantProfile.id,
  status: "submitted",
  requestedAt: "2026-05-25",
  reviewNote: "identity_and_nutrition_disclosure_pending_review"
};

export const mockRestaurantAnalytics: RestaurantAnalytics = {
  id: "analytics-haochu-1",
  restaurantId: mockRestaurantProfile.id,
  profileViews: 1280,
  nutritionDisclosureViews: 342,
  recommendationClicks: 218,
  tableJoinIntents: 46
};

export const mockRestaurantVipMembers: RestaurantVipMember[] = [
  {
    id: "vip-member-1",
    restaurantId: mockRestaurantProfile.id,
    userId: "user-demo-1",
    displayName: "member_a",
    consentGranted: true,
    tagIds: ["tag-eating-high-protein", "tag-goal-calorie"]
  },
  {
    id: "vip-member-2",
    restaurantId: mockRestaurantProfile.id,
    userId: "user-demo-2",
    displayName: "member_b",
    consentGranted: true,
    tagIds: ["tag-eating-vegetarian", "tag-goal-high-fiber"]
  }
];
