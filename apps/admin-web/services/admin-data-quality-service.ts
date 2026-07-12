import { adminAnalyticsService } from "./admin-analytics-service";
import { adminAliasService } from "./admin-alias-service";
import { adminMenuItemService } from "./admin-menu-item-service";
import { adminNutritionService } from "./admin-nutrition-service";
import { adminPendingItemService } from "./admin-pending-item-service";
import { adminRestaurantService } from "./admin-restaurant-service";

export const adminDataQualityService = {
  getGovernanceSummary() {
    const analyticsIssues = adminAnalyticsService.listAnalyticsQualityIssues();
    return {
      restaurantReviews: adminRestaurantService.listRestaurantReviews().length,
      pendingItems: adminPendingItemService.listPendingItems().length,
      duplicateCandidates: adminMenuItemService.listDuplicateCandidates().length,
      aliasReviews: adminAliasService.listAliasReviews().length,
      nutritionReviews: adminNutritionService.listNutritionReviews().length,
      analyticsIssues: analyticsIssues.length,
      criticalIssues: analyticsIssues.filter((issue) => issue.severity === "critical").length
    };
  }
};
