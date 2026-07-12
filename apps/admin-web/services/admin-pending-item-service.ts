import { findBranchName, findMenuItemName, findRestaurantName } from "../repositories/admin-base-repository";
import { pendingItemReviewRepository } from "../repositories/pending-item-review-repository";
import type { PendingMenuItemReviewViewModel } from "../view-models/admin-governance-view-models";

export const adminPendingItemService = {
  listPendingItems(): PendingMenuItemReviewViewModel[] {
    const drafts = pendingItemReviewRepository.listActionDrafts();

    return pendingItemReviewRepository.listPendingItems().map((item) => ({
      id: item.id,
      restaurantId: item.restaurantId,
      restaurantName: findRestaurantName(item.restaurantId),
      branchId: item.branchId,
      branchName: findBranchName(item.branchId),
      userEnteredName: item.userInputName,
      aiDetectedName: item.normalizedInputName,
      candidateMenuItemId: item.aiSuggestedMenuItemId,
      candidateMenuItemName: findMenuItemName(item.aiSuggestedMenuItemId),
      uploadedPhoto: item.photoUrl,
      occurrenceCount: item.occurrenceCount,
      mostRecentOccurrence: item.lastSeenAt,
      restaurantProcessingStatus: item.status,
      platformProcessingStatus: drafts.some((draft) => draft.targetId === item.id) ? "draft_created" : "pending_platform_review",
      similarityScore: item.similarity,
      source: item.status === "matched_existing_item" ? "restaurant_console" : "manual_input",
      availableActions: ["create_alias", "request_more_information", "reject", "wrong_restaurant"],
      actionDraft: drafts.find((draft) => draft.targetId === item.id)
    }));
  }
};
