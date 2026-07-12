import { findBranchName, findMenuItemName, findRestaurantName } from "../repositories/admin-base-repository";
import { aliasReviewRepository } from "../repositories/alias-review-repository";
import type { AliasReviewViewModel } from "../view-models/admin-governance-view-models";

export const adminAliasService = {
  listAliasReviews(): AliasReviewViewModel[] {
    const aliases = aliasReviewRepository.listAliases();
    const drafts = aliasReviewRepository.listActionDrafts();

    return aliasReviewRepository.listAliasReviews().flatMap((review) => {
      const alias = aliases.find((item) => item.id === review.aliasId);
      if (!alias) return [];

      return [
        {
          id: review.id,
          aliasId: alias.id,
          aliasName: alias.aliasName,
          normalizedAliasName: alias.normalizedAliasName,
          sourceType: alias.sourceType,
          restaurantId: alias.restaurantId,
          restaurantName: findRestaurantName(alias.restaurantId),
          branchId: alias.branchId,
          branchName: findBranchName(alias.branchId),
          suggestedMenuItemId: review.suggestedMenuItemId,
          suggestedMenuItemName: findMenuItemName(review.suggestedMenuItemId) ?? review.suggestedMenuItemId,
          confidenceScore: alias.confidenceScore,
          usageCount: review.usageCount,
          status: review.status,
          availableActions: ["approve", "change_target", "reject", "merge", "mark_typo", "wrong_restaurant"],
          actionDraft: drafts.find((draft) => draft.targetId === alias.id || draft.targetId === review.id)
        }
      ];
    });
  }
};
