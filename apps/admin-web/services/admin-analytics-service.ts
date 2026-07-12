import { analyticsQualityRepository } from "../repositories/analytics-quality-repository";
import { findMenuItemName } from "../repositories/admin-base-repository";
import type { AnalyticsQualityIssueViewModel, RecommendationAnomalyViewModel } from "../view-models/admin-governance-view-models";

export const adminAnalyticsService = {
  listAnalyticsQualityIssues(): AnalyticsQualityIssueViewModel[] {
    const restaurants = new Set(analyticsQualityRepository.listRestaurants().map((restaurant) => restaurant.id));
    const branches = new Set(analyticsQualityRepository.listBranches().map((branch) => branch.id));
    const menuItems = new Set(analyticsQualityRepository.listMenuItems().map((menuItem) => menuItem.id));
    const seenEventIds = new Set<string>();
    const generatedIssues: AnalyticsQualityIssueViewModel[] = [];

    for (const event of analyticsQualityRepository.listAnalyticsEvents()) {
      if (seenEventIds.has(event.id)) {
        generatedIssues.push(toIssue(event.id, "critical", "DUPLICATE_EVENT_ID", "Duplicate analytics event id.", event));
      }
      seenEventIds.add(event.id);

      if (!restaurants.has(event.restaurantId)) generatedIssues.push(toIssue(event.id, "critical", "UNKNOWN_RESTAURANT_ID", "Analytics event restaurantId cannot be resolved.", event));
      if (event.branchId && !branches.has(event.branchId)) generatedIssues.push(toIssue(event.id, "warning", "UNKNOWN_BRANCH_ID", "Analytics event branchId cannot be resolved.", event));
      if (event.menuItemId && !menuItems.has(event.menuItemId)) generatedIssues.push(toIssue(event.id, "warning", "UNKNOWN_MENU_ITEM_ID", "Analytics event menuItemId cannot be resolved.", event));
      if (event.eventType.startsWith("recommendation_") && !event.recommendationId) generatedIssues.push(toIssue(event.id, "warning", "MISSING_RECOMMENDATION_ID", "Recommendation event should include recommendationId.", event));
      if (event.eventType.startsWith("nutrition_badge") && !event.menuItemId) generatedIssues.push(toIssue(event.id, "warning", "MISSING_BADGE_MENU_ITEM_ID", "Nutrition badge event should resolve to a menu item.", event));
      if (Number.isNaN(Date.parse(event.occurredAt))) generatedIssues.push(toIssue(event.id, "critical", "INVALID_OCCURRED_AT", "Analytics event occurredAt is not parseable.", event));
    }

    const manualIssues = [
      ...analyticsQualityRepository.listAnalyticsEventIssues().map((issue) => {
        const event = analyticsQualityRepository.listAnalyticsEvents().find((item) => item.id === issue.analyticsEventId);
        return {
          id: issue.id,
          eventId: issue.analyticsEventId,
          severity: issue.severity,
          issueCode: issue.issueCode,
          message: issue.message,
          restaurantId: event?.restaurantId,
          branchId: event?.branchId,
          menuItemId: event?.menuItemId,
          source: event?.source ?? "manual_issue",
          occurredAt: event?.occurredAt
        };
      }),
      ...analyticsQualityRepository.listDataQualityIssues().map((issue) => ({
        id: issue.id,
        eventId: issue.sourceType === "analytics_event" ? issue.sourceId : undefined,
        recommendationId: issue.sourceType === "recommendation" ? issue.sourceId : undefined,
        severity: issue.severity,
        issueCode: issue.issueCode,
        message: issue.message,
        source: issue.sourceType
      }))
    ];

    return [...generatedIssues, ...manualIssues];
  },

  listRecommendationAnomalies(): RecommendationAnomalyViewModel[] {
    const branchMenuItems = analyticsQualityRepository.listBranchMenuItems();
    const menuItems = analyticsQualityRepository.listMenuItems();
    const nutritionMenuItemIds = new Set(analyticsQualityRepository.listMenuItems().filter((item) => item.nutritionId).map((item) => item.id));

    return analyticsQualityRepository.listRecommendationResults().map((recommendation) => {
      const explicitAnomaly = analyticsQualityRepository.listRecommendationAnomalies().find((item) => item.recommendationId === recommendation.id);
      const branchOffer = branchMenuItems.find((item) => item.branchId === recommendation.branchId && item.menuItemId === recommendation.menuItemId);
      const menuItem = menuItems.find((item) => item.id === recommendation.menuItemId);

      return {
        id: explicitAnomaly?.id ?? `reco-anomaly-check-${recommendation.id}`,
        recommendationId: recommendation.id,
        userId: recommendation.userId,
        menuItemId: recommendation.menuItemId,
        menuItemName: findMenuItemName(recommendation.menuItemId),
        branchId: recommendation.branchId,
        branchOffersItem: Boolean(branchOffer && branchOffer.availability !== "unavailable" && !branchOffer.soldOut),
        menuItemDiscontinued: menuItem?.status === "archived" || branchOffer?.branchSpecificStatus === "discontinued",
        nutritionMissing: !nutritionMenuItemIds.has(recommendation.menuItemId),
        score: recommendation.score,
        reasonCodes: recommendation.reasonCodes,
        anomalyReason: explicitAnomaly?.anomalyReason ?? "No blocking anomaly detected; monitor recommendation quality.",
        availableActions: ["mark_anomaly", "ignore", "request_more_information"]
      };
    });
  }
};

function toIssue(
  id: string,
  severity: AnalyticsQualityIssueViewModel["severity"],
  issueCode: string,
  message: string,
  event: ReturnType<typeof analyticsQualityRepository.listAnalyticsEvents>[number]
): AnalyticsQualityIssueViewModel {
  return {
    id: `${issueCode.toLowerCase()}-${id}`,
    eventId: event.id,
    severity,
    issueCode,
    message,
    restaurantId: event.restaurantId,
    branchId: event.branchId,
    menuItemId: event.menuItemId,
    source: event.source,
    occurredAt: event.occurredAt
  };
}
