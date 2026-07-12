import type { RestaurantDomain } from "@haocu/shared/domain";
import { nutritionRepository } from "../repositories/nutrition-repository";
import type { NutritionSourceLabel } from "../view-models/restaurant-view-models";

export const mobileNutritionService = {
  getFormalNutrition(menuItemId: string | undefined | null): RestaurantDomain.MenuItemNutrition | null {
    return nutritionRepository.findFormalNutrition(menuItemId);
  },

  getAiEstimate(menuItemId: string | undefined | null): RestaurantDomain.NutritionEstimate | null {
    return nutritionRepository.findAiEstimate(menuItemId);
  },

  getLatestReview(menuItemId: string | undefined | null): RestaurantDomain.NutritionReview | null {
    return nutritionRepository.findLatestReview(menuItemId);
  },

  getNutritionSourceLabel(menuItemId: string | undefined | null): NutritionSourceLabel {
    const formalNutrition = nutritionRepository.findFormalNutrition(menuItemId);
    if (!formalNutrition) return "missing";
    return formalNutrition.source;
  }
};
