import type { NextMealCandidateEntitlement } from "./nextMealCandidateCountPolicy";
import type { ConsumerRecommendationFeedbackCanonicalTargetSource } from "../consumer-recommendation-feedback/consumerRecommendationFeedbackTargetMapper";

export type U1NextMealPrototypeScenario = "success" | "empty" | "error";

export type U1NextMealPresentationSource =
  | "u1_mock"
  | "canonical_mock"
  | "local_menu_demo";

export type U1NextMealCandidateViewModel = {
  prototypeId: string;
  source: U1NextMealPresentationSource;
  isSampleData: boolean;
  ordinal: number;
  isBestRecommendation: boolean;
  mealName: string;
  restaurantName?: string;
  areaLabel?: string;
  emoji?: string;
  calorieLabel?: string;
  tags: readonly string[];
  reasonSummary: string;
  reasonDetails: readonly string[];
  canonicalFeedbackTarget?: ConsumerRecommendationFeedbackCanonicalTargetSource;
};

export type U1NextMealRecommendationViewModel = {
  source: U1NextMealPresentationSource;
  isSampleData: boolean;
  headline: string;
  entitlement: NextMealCandidateEntitlement;
  visibleCandidateCount: number;
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
  scenario?: U1NextMealPrototypeScenario;
};

export interface U1NextMealPrototypeProvider {
  getRecommendation(request: U1NextMealPrototypeRequest): Promise<U1NextMealProviderResult>;
}

export type U1NextMealBuddyPrefillViewModel = {
  handoffId: string;
  source: "u1_next_meal_prototype";
  foodName: string;
  foodCategory: string;
  restaurantName: string;
  area: string;
  preferredTime: string;
  note: string;
};
