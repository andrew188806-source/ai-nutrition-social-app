import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const pendingItemReviewRepository = {
  listPendingItems() {
    return getAdminCanonicalSnapshot().pendingMenuItems;
  },
  listActionDrafts() {
    return getAdminCanonicalSnapshot().adminActionDrafts;
  }
};
