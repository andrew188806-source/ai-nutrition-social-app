import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const restaurantReviewRepository = {
  listRestaurantReviews() {
    return getAdminCanonicalSnapshot().restaurantReviews;
  },
  listBranchReviews() {
    return getAdminCanonicalSnapshot().branchReviews;
  },
  listActionDrafts() {
    return getAdminCanonicalSnapshot().adminActionDrafts;
  }
};
