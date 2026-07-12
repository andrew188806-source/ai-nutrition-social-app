import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, MetricGrid, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { adminAnalyticsService } from "../../services/admin-analytics-service";
import { adminDataQualityService } from "../../services/admin-data-quality-service";

export default function DataQualityPage() {
  const summary = adminDataQualityService.getGovernanceSummary();
  const issues = adminAnalyticsService.listAnalyticsQualityIssues();
  const anomalies = adminAnalyticsService.listRecommendationAnomalies();

  return (
    <AdminShell title="Canonical Data Quality" subtitle="Analytics event quality and recommendation anomaly inspection over shared canonical records.">
      <div className="grid gap-5">
        <PageStatePanel state={{ loading: false, filterLabel: "severity / source / issueCode", searchPlaceholder: "Search eventId, recommendationId, menuItemId", noResultsLabel: "No data-quality issues" }} />
        <MetricGrid
          items={[
            { label: "Restaurant reviews", value: String(summary.restaurantReviews), note: "Canonical Restaurant/Branch review rows" },
            { label: "Pending items", value: String(summary.pendingItems), note: "Shared PendingMenuItem rows" },
            { label: "Analytics issues", value: String(summary.analyticsIssues), note: `${summary.criticalIssues} critical` },
            { label: "Nutrition reviews", value: String(summary.nutritionReviews), note: "Official and AI layers separated" }
          ]}
        />
        <CardGrid>
          {issues.map((issue) => (
            <DetailCard
              key={issue.id}
              title={issue.issueCode}
              subtitle={issue.message}
              items={[
                { label: "Severity", value: issue.severity, tone: issue.severity === "critical" ? "danger" : issue.severity === "warning" ? "warning" : "default" },
                { label: "Event ID", value: issue.eventId ?? "n/a" },
                { label: "Recommendation ID", value: issue.recommendationId ?? "n/a" },
                { label: "Restaurant ID", value: issue.restaurantId ?? "n/a" },
                { label: "Branch ID", value: issue.branchId ?? "n/a" },
                { label: "MenuItem ID", value: issue.menuItemId ?? "n/a" },
                { label: "Source", value: issue.source }
              ]}
            />
          ))}
          {anomalies.map((anomaly) => (
            <DetailCard
              key={anomaly.id}
              title={`Recommendation ${anomaly.recommendationId}`}
              subtitle={anomaly.anomalyReason}
              items={[
                { label: "User ID", value: anomaly.userId },
                { label: "MenuItem ID", value: anomaly.menuItemId },
                { label: "Menu item", value: anomaly.menuItemName ?? "unknown" },
                { label: "Branch ID", value: anomaly.branchId },
                { label: "Branch offers item", value: anomaly.branchOffersItem, tone: anomaly.branchOffersItem ? "success" : "danger" },
                { label: "Menu item discontinued", value: anomaly.menuItemDiscontinued, tone: anomaly.menuItemDiscontinued ? "danger" : "success" },
                { label: "Nutrition missing", value: anomaly.nutritionMissing, tone: anomaly.nutritionMissing ? "warning" : "success" },
                { label: "Score", value: anomaly.score },
                { label: "Reason codes", value: anomaly.reasonCodes },
                { label: "Actions", value: anomaly.availableActions }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
