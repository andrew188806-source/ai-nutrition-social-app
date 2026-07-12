import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const aliasReviewRepository = {
  listAliasReviews() {
    return getAdminCanonicalSnapshot().aliasReviews;
  },
  listAliases() {
    return getAdminCanonicalSnapshot().menuItemAliases;
  },
  listActionDrafts() {
    return getAdminCanonicalSnapshot().adminActionDrafts;
  }
};
