import { findMenuItemName, findRestaurantName } from "../repositories/admin-base-repository";
import { nutritionReviewRepository } from "../repositories/nutrition-review-repository";
import type { NutritionReviewViewModel } from "../view-models/admin-governance-view-models";

export const adminNutritionService = {
  listNutritionReviews(): NutritionReviewViewModel[] {
    const nutritionRows = nutritionReviewRepository.listNutrition();
    const estimates = nutritionReviewRepository.listEstimates();
    const reviews = nutritionReviewRepository.listReviews();
    const changeLogs = nutritionReviewRepository.listChangeLogs();
    const drafts = nutritionReviewRepository.listActionDrafts();

    return nutritionReviewRepository.listMenuItems().map((menuItem) => {
      const officialNutrition = nutritionRows.find((nutrition) => nutrition.menuItemId === menuItem.id);
      const aiEstimate = estimates.find((estimate) => estimate.menuItemId === menuItem.id);
      const review = reviews.find((item) => item.menuItemId === menuItem.id);
      const before = officialNutrition
        ? { calories: officialNutrition.calories, protein: officialNutrition.protein, source: officialNutrition.source, verifiedStatus: officialNutrition.verifiedStatus }
        : { calories: null, protein: null, source: "missing", verifiedStatus: "missing" };
      const after = aiEstimate ? { calories: aiEstimate.calories, protein: aiEstimate.protein, source: "ai_estimate_candidate", confidenceScore: aiEstimate.confidenceScore } : before;

      return {
        id: officialNutrition?.id ?? `nutrition-review-${menuItem.id}`,
        menuItemId: menuItem.id,
        menuItemName: findMenuItemName(menuItem.id) ?? menuItem.id,
        restaurantId: menuItem.restaurantId,
        restaurantName: findRestaurantName(menuItem.restaurantId),
        officialNutrition,
        aiEstimate,
        review,
        changeHistory: changeLogs.filter((log) => log.menuItemId === menuItem.id),
        confidenceScore: officialNutrition?.confidenceScore ?? aiEstimate?.confidenceScore ?? 0,
        source: officialNutrition?.source ?? "missing",
        verifiedStatus: officialNutrition?.verifiedStatus ?? "missing",
        before,
        after,
        availableActions: ["approve", "adopt_ai", "partial_adopt_ai", "request_more_information", "reject"],
        actionDraft: drafts.find((draft) => draft.targetId === officialNutrition?.id || draft.targetId === menuItem.id)
      };
    });
  }
};
