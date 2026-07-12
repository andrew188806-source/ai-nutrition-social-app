import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const analyticsQualityRepository = {
  listAnalyticsEvents() {
    return getAdminCanonicalSnapshot().analyticsEvents;
  },
  listAnalyticsEventIssues() {
    return getAdminCanonicalSnapshot().analyticsEventIssues;
  },
  listRecommendationResults() {
    return getAdminCanonicalSnapshot().recommendationResults;
  },
  listRecommendationAnomalies() {
    return getAdminCanonicalSnapshot().recommendationAnomalies;
  },
  listDataQualityIssues() {
    return getAdminCanonicalSnapshot().dataQualityIssues;
  },
  listRestaurants() {
    return getAdminCanonicalSnapshot().restaurants;
  },
  listBranches() {
    return getAdminCanonicalSnapshot().branches;
  },
  listMenuItems() {
    return getAdminCanonicalSnapshot().menuItems;
  },
  listBranchMenuItems() {
    return getAdminCanonicalSnapshot().branchMenuItems;
  }
};
