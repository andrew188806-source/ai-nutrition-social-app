import { AdminShell } from "../../components/AdminShell";
import { BeforeAfter, CardGrid, DetailCard, DraftTrace, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { adminNutritionService } from "../../services/admin-nutrition-service";

export default function NutritionReviewPage() {
  const rows = adminNutritionService.listNutritionReviews();

  return (
    <AdminShell title="Nutrition Data Review" subtitle="Official MenuItemNutrition, AI NutritionEstimate, reviews, and change history stay separated.">
      <div className="grid gap-5">
        <PageStatePanel state={{ loading: false, filterLabel: "source / verifiedStatus / confidence", searchPlaceholder: "Search menuItemId or restaurant", noResultsLabel: "No nutrition rows" }} />
        <CardGrid>
          {rows.map((row) => (
            <div className="grid gap-3" key={row.id}>
              <DetailCard
                title={row.menuItemName}
                subtitle={row.restaurantName}
                items={[
                  { label: "MenuItem ID", value: row.menuItemId },
                  { label: "Official nutrition ID", value: row.officialNutrition?.id ?? "missing" },
                  { label: "AI estimate ID", value: row.aiEstimate?.id ?? "none" },
                  { label: "Source", value: row.source },
                  { label: "Verified status", value: row.verifiedStatus },
                  { label: "Confidence", value: row.confidenceScore },
                  { label: "Review", value: row.review?.status ?? "none" },
                  { label: "Change logs", value: row.changeHistory.map((log) => log.id) },
                  { label: "Actions", value: row.availableActions }
                ]}
              />
              <BeforeAfter before={row.before} after={row.after} />
              <DraftTrace draftId={row.actionDraft?.id} auditLogId={row.actionDraft?.auditLogId} />
            </div>
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
