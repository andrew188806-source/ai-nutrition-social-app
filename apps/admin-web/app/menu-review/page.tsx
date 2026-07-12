import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, GovernanceNote, MetricGrid } from "../../components/GovernanceUi";
import { adminAliasService } from "../../services/admin-alias-service";
import { adminDataQualityService } from "../../services/admin-data-quality-service";
import { adminMenuItemService } from "../../services/admin-menu-item-service";
import { adminNutritionService } from "../../services/admin-nutrition-service";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function AdminMenuReviewPage() {
  const summary = adminDataQualityService.getGovernanceSummary();
  const duplicateCandidates = adminMenuItemService.listDuplicateCandidates();
  const aliasReviews = adminAliasService.listAliasReviews();
  const nutritionReviews = adminNutritionService.listNutritionReviews().filter((review) => review.source === "ai_estimated" || review.verifiedStatus === "pending_review");

  return (
    <AdminShell title={zhTW.adminPhase5.pages.menuTitle} subtitle={zhTW.adminPhase5.pages.menuSubtitle}>
      <div className="grid gap-5">
        <GovernanceNote>Canonical menu governance overview. Detailed duplicate, alias, pending-item, and nutrition workflows now use Admin services over shared restaurant-platform data.</GovernanceNote>
        <MetricGrid
          items={[
            { label: "Duplicate candidates", value: String(summary.duplicateCandidates), note: "Merge actions create drafts only" },
            { label: "Alias reviews", value: String(summary.aliasReviews), note: "All aliases resolve to menuItemId" },
            { label: "Nutrition reviews", value: String(summary.nutritionReviews), note: "Official and AI records remain separate" },
            { label: "Analytics issues", value: String(summary.analyticsIssues), note: "Traceable to AnalyticsEvent rows" }
          ]}
        />
        <CardGrid>
          {duplicateCandidates.map((review) => (
            <DetailCard
              key={review.id}
              title={review.officialMenuItemName}
              subtitle={`Duplicate candidate: ${review.suspectedName}`}
              items={[
                { label: "Canonical menuItemId", value: review.canonicalMenuItemId },
                { label: "Suspected duplicate", value: review.suspectedDuplicateMenuItemId },
                { label: "Similarity", value: review.similarityScore },
                { label: "Actions", value: review.availableActions }
              ]}
            />
          ))}
          {aliasReviews.slice(0, 2).map((review) => (
            <DetailCard
              key={review.id}
              title={review.aliasName}
              subtitle="Alias review"
              items={[
                { label: "Alias ID", value: review.aliasId },
                { label: "Suggested menuItemId", value: review.suggestedMenuItemId },
                { label: "Confidence", value: review.confidenceScore },
                { label: "Actions", value: review.availableActions }
              ]}
            />
          ))}
          {nutritionReviews.slice(0, 2).map((review) => (
            <DetailCard
              key={review.id}
              title={review.menuItemName}
              subtitle="Nutrition review"
              items={[
                { label: "MenuItem ID", value: review.menuItemId },
                { label: "Official source", value: review.source },
                { label: "AI estimate", value: review.aiEstimate?.id ?? "none" },
                { label: "Actions", value: review.availableActions }
              ]}
            />
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
