import { AdminShell } from "../../components/AdminShell";
import { BeforeAfter, CardGrid, DetailCard, DraftTrace, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { adminRestaurantService } from "../../services/admin-restaurant-service";

export default function RestaurantReviewPage() {
  const rows = adminRestaurantService.listRestaurantReviews();

  return (
    <AdminShell title="Restaurant and Branch Review" subtitle="Platform review of canonical Restaurant and RestaurantBranch changes.">
      <div className="grid gap-5">
        <PageStatePanel state={{ loading: false, filterLabel: "status / restaurant / branch", searchPlaceholder: "Search restaurantId, branchId, submitter", noResultsLabel: "No restaurant review records" }} />
        <CardGrid>
          {rows.map((row) => (
            <div className="grid gap-3" key={row.id}>
              <DetailCard
                title={row.branchName ? `${row.restaurantName} / ${row.branchName}` : row.restaurantName}
                subtitle={row.notes}
                items={[
                  { label: "Review ID", value: row.id },
                  { label: "Restaurant ID", value: row.restaurantId },
                  { label: "Branch ID", value: row.branchId ?? "restaurant-level" },
                  { label: "Status", value: row.status, tone: row.status === "pending" ? "warning" : "default" },
                  { label: "Submitter", value: row.submitter },
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
