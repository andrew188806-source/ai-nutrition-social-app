import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const nutritionReviewRepository = {
  listMenuItems() {
    return getAdminCanonicalSnapshot().menuItems;
  },
  listNutrition() {
    return getAdminCanonicalSnapshot().menuItemNutrition;
  },
  listEstimates() {
    return getAdminCanonicalSnapshot().nutritionEstimates;
  },
  listReviews() {
    return getAdminCanonicalSnapshot().nutritionReviews;
  },
  listChangeLogs() {
    return getAdminCanonicalSnapshot().nutritionChangeLogs;
  },
  listActionDrafts() {
    return getAdminCanonicalSnapshot().adminActionDrafts;
  }
};
