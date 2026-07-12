import type { RestaurantDomain } from "@haocu/shared/domain";
import {
  canonicalAdminActionDrafts,
  canonicalAliasReviews,
  canonicalAnalyticsEventIssues,
  canonicalAnalyticsEvents,
  canonicalAdminAuditLogs,
  canonicalBranchMenuItems,
  canonicalBranchReviews,
  canonicalBranches,
  canonicalDataQualityIssues,
  canonicalMenuItemAliases,
  canonicalMenuItemIngredients,
  canonicalMenuItemMergeCandidates,
  canonicalMenuItemNutrition,
  canonicalMenuItems,
  canonicalNutritionChangeLogs,
  canonicalNutritionEstimates,
  canonicalNutritionReviews,
  canonicalPendingMenuItems,
  canonicalRecommendationAnomalies,
  canonicalRecommendationResults,
  canonicalRestaurantReviews,
  canonicalRestaurants
} from "@haocu/shared/mock/restaurant-platform";

export type AdminRestaurantMockSnapshot = {
  restaurants: RestaurantDomain.Restaurant[];
  branches: RestaurantDomain.RestaurantBranch[];
  menuItems: RestaurantDomain.MenuItem[];
  branchMenuItems: RestaurantDomain.BranchMenuItem[];
  menuItemAliases: RestaurantDomain.MenuItemAlias[];
  menuItemIngredients: RestaurantDomain.MenuItemIngredient[];
  menuItemNutrition: RestaurantDomain.MenuItemNutrition[];
  nutritionEstimates: RestaurantDomain.NutritionEstimate[];
  nutritionReviews: RestaurantDomain.NutritionReview[];
  nutritionChangeLogs: RestaurantDomain.NutritionChangeLog[];
  pendingMenuItems: RestaurantDomain.PendingMenuItem[];
  analyticsEvents: RestaurantDomain.AnalyticsEvent[];
  recommendationResults: RestaurantDomain.RecommendationResult[];
  restaurantReviews: RestaurantDomain.RestaurantReview[];
  branchReviews: RestaurantDomain.BranchReview[];
  menuItemMergeCandidates: RestaurantDomain.MenuItemMergeCandidate[];
  aliasReviews: RestaurantDomain.AliasReview[];
  dataQualityIssues: RestaurantDomain.DataQualityIssue[];
  recommendationAnomalies: RestaurantDomain.RecommendationAnomaly[];
  analyticsEventIssues: RestaurantDomain.AnalyticsEventIssue[];
  adminActionDrafts: RestaurantDomain.AdminActionDraft[];
  auditLogs: RestaurantDomain.AuditLog[];
};

export const adminRestaurantMockAdapter = {
  getSnapshot(): AdminRestaurantMockSnapshot {
    return {
      restaurants: canonicalRestaurants,
      branches: canonicalBranches,
      menuItems: canonicalMenuItems,
      branchMenuItems: canonicalBranchMenuItems,
      menuItemAliases: canonicalMenuItemAliases,
      menuItemIngredients: canonicalMenuItemIngredients,
      menuItemNutrition: canonicalMenuItemNutrition,
      nutritionEstimates: canonicalNutritionEstimates,
      nutritionReviews: canonicalNutritionReviews,
      nutritionChangeLogs: canonicalNutritionChangeLogs,
      pendingMenuItems: canonicalPendingMenuItems,
      analyticsEvents: canonicalAnalyticsEvents,
      recommendationResults: canonicalRecommendationResults,
      restaurantReviews: canonicalRestaurantReviews,
      branchReviews: canonicalBranchReviews,
      menuItemMergeCandidates: canonicalMenuItemMergeCandidates,
      aliasReviews: canonicalAliasReviews,
      dataQualityIssues: canonicalDataQualityIssues,
      recommendationAnomalies: canonicalRecommendationAnomalies,
      analyticsEventIssues: canonicalAnalyticsEventIssues,
      adminActionDrafts: canonicalAdminActionDrafts,
      auditLogs: canonicalAdminAuditLogs
    };
  }
};
