import { findBranchName, findRestaurantName } from "../repositories/admin-base-repository";
import { restaurantReviewRepository } from "../repositories/restaurant-review-repository";
import type { RestaurantReviewViewModel } from "../view-models/admin-governance-view-models";

const REVIEW_ACTIONS = ["approve", "return_for_changes", "reject"] as const;

export const adminRestaurantService = {
  listRestaurantReviews(): RestaurantReviewViewModel[] {
    const drafts = restaurantReviewRepository.listActionDrafts();
    const restaurantRows = restaurantReviewRepository.listRestaurantReviews().map<RestaurantReviewViewModel>((review) => ({
      id: review.id,
      restaurantId: review.restaurantId,
      restaurantName: findRestaurantName(review.restaurantId),
      status: review.status,
      submitter: review.submittedBy,
      reviewer: review.reviewerId,
      submittedAt: review.submittedAt,
      reviewedAt: review.reviewedAt,
      before: review.before,
      after: review.after,
      notes: review.note,
      availableActions: [...REVIEW_ACTIONS],
      actionDraft: drafts.find((draft) => draft.targetId === review.id || draft.targetId === review.restaurantId)
    }));

    const branchRows = restaurantReviewRepository.listBranchReviews().map<RestaurantReviewViewModel>((review) => ({
      id: review.id,
      restaurantId: review.restaurantId,
      restaurantName: findRestaurantName(review.restaurantId),
      branchId: review.branchId,
      branchName: findBranchName(review.branchId),
      status: review.status,
      submitter: review.submittedBy,
      reviewer: review.reviewerId,
      submittedAt: review.submittedAt,
      reviewedAt: review.reviewedAt,
      before: review.before,
      after: review.after,
      notes: review.note,
      availableActions: [...REVIEW_ACTIONS],
      actionDraft: drafts.find((draft) => draft.targetId === review.id || draft.targetId === review.branchId)
    }));

    return [...restaurantRows, ...branchRows];
  }
};
