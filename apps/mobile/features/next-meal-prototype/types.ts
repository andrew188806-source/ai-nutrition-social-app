import type { NextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import type { ConsumerRecommendationFeedbackCanonicalTargetSource } from "../consumer-recommendation-feedback/consumerRecommendationFeedbackTargetMapper";
import type { ConsumerNextMealReasonCode, ConsumerNutritionSnapshot, ConsumerNutritionSourceType } from "../consumer-meals/types";

export type U1NextMealPrototypeScenario = "success" | "empty" | "error";

export type U1NextMealPresentationSource =
  | "u1_mock"
  | "canonical_mock"
  | "local_menu_demo";

export type U1NextMealCandidateViewModel = {
  prototypeId: string;
  branchMenuItemId?: string;
  menuItemId?: string;
  restaurantId?: string;
  branchId?: string | null;
  source: U1NextMealPresentationSource;
  isSampleData: boolean;
  ordinal: number;
  isBestRecommendation: boolean;
  mealName: string;
  restaurantName?: string;
  areaLabel?: string;
  branchName?: string;
  imageUrl?: string;
  description?: string;
  emoji?: string;
  calorieLabel?: string;
  nutrition: ConsumerNutritionSnapshot;
  nutritionSource?: ConsumerNutritionSourceType;
  tags: readonly string[];
  reasonSummary: string;
  reasonCode: ConsumerNextMealReasonCode;
  reasonDetails: readonly string[];
  recommendationLane?: "nutrition_primary" | "taste_forward" | "nutrition_fallback";
  canonicalFeedbackTarget?: ConsumerRecommendationFeedbackCanonicalTargetSource;
};

export type U1NextMealRecommendationViewModel = {
  source: U1NextMealPresentationSource;
  isSampleData: boolean;
  headline: string;
  entitlement: NextMealCandidateEntitlement;
  visibleCandidateCount: number;
  contextNote?: string;
  candidates: readonly U1NextMealCandidateViewModel[];
};

export type U1NextMealProviderResult =
  | { status: "disabled"; message: string }
  | { status: "empty"; message: string }
  | { status: "error"; message: string; retryable: boolean }
  | { status: "success"; recommendation: U1NextMealRecommendationViewModel };

export type U1NextMealScreenViewModel =
  | { status: "disabled"; message: string }
  | { status: "loading" }
  | { status: "empty"; message: string }
  | { status: "error"; message: string; retryable: boolean }
  | {
      status: "success";
      recommendation: U1NextMealRecommendationViewModel;
      selectedCandidateId: string | null;
      confirmedCandidateId: string | null;
    };

export type U1NextMealPrototypeRequest = {
  entitlement?: unknown;
  preferredPrototypeId?: string;
  preferredMenuItemId?: string;
  scenario?: U1NextMealPrototypeScenario;
  currentLocation?: Readonly<{ latitude: number; longitude: number }>;
};

export interface U1NextMealPrototypeProvider {
  getRecommendation(request: U1NextMealPrototypeRequest): Promise<U1NextMealProviderResult>;
}

export type U1NextMealBuddyPrefillViewModel = {
  handoffId: string;
  source: "u1_next_meal_prototype";
  foodName: string;
  restaurantName: string;
  area: string;
  preferredTime: string;
  note: string;
  // Stable selected identity only. Display text and recommendation reasons stay outside the
  // authority object, and no context key is accepted from Mobile.
  selectedRecommendation: {
    source: "canonical_next_meal";
    branchMenuItemId: string;
    menuItemId: string;
    restaurantId: string;
    branchId: string;
  } | null;
};
