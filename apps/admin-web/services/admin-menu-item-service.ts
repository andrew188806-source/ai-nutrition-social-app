import { findBranchName, findMenuItemName, findRestaurantName } from "../repositories/admin-base-repository";
import { menuItemGovernanceRepository } from "../repositories/menu-item-governance-repository";
import { nutritionReviewRepository } from "../repositories/nutrition-review-repository";
import type { DuplicateMenuItemViewModel } from "../view-models/admin-governance-view-models";

export const adminMenuItemService = {
  listDuplicateCandidates(): DuplicateMenuItemViewModel[] {
    const aliases = menuItemGovernanceRepository.listAliases();
    const ingredients = menuItemGovernanceRepository.listIngredients();
    const nutrition = nutritionReviewRepository.listNutrition();
    const drafts = menuItemGovernanceRepository.listActionDrafts();

    return menuItemGovernanceRepository.listMergeCandidates().map((candidate) => ({
      id: candidate.id,
      canonicalMenuItemId: candidate.canonicalMenuItemId,
      suspectedDuplicateMenuItemId: candidate.suspectedDuplicateMenuItemId,
      officialMenuItemName: findMenuItemName(candidate.canonicalMenuItemId) ?? candidate.canonicalMenuItemId,
      suspectedName: findMenuItemName(candidate.suspectedDuplicateMenuItemId) ?? candidate.suspectedDuplicateMenuItemId,
      restaurantId: candidate.restaurantId,
      restaurantName: findRestaurantName(candidate.restaurantId),
      branchId: candidate.branchId,
      branchName: findBranchName(candidate.branchId),
      aliases: aliases.filter((alias) => alias.menuItemId === candidate.canonicalMenuItemId || alias.menuItemId === candidate.suspectedDuplicateMenuItemId),
      ingredients: ingredients.filter((ingredient) => ingredient.menuItemId === candidate.canonicalMenuItemId || ingredient.menuItemId === candidate.suspectedDuplicateMenuItemId),
      nutrition: nutrition.find((item) => item.menuItemId === candidate.canonicalMenuItemId),
      similarityScore: candidate.similarityScore,
      usageCount: candidate.usageCount,
      recommendationReferenceCount: candidate.recommendationReferenceCount,
      mealRecordReferenceCount: candidate.mealRecordReferenceCount,
      availableActions: ["merge", "keep_separate", "create_alias", "request_more_information", "ignore"],
      actionDraft: drafts.find((draft) => draft.targetId === candidate.id || draft.targetId === candidate.canonicalMenuItemId)
    }));
  }
};
