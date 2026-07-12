import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, DraftTrace, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { adminPendingItemService } from "../../services/admin-pending-item-service";

export default function PendingMenuItemsPage() {
  const rows = adminPendingItemService.listPendingItems();

  return (
    <AdminShell title="Pending Menu Items" subtitle="Admin and Restaurant Console governance for the same PendingMenuItem records.">
      <div className="grid gap-5">
        <PageStatePanel state={{ loading: false, filterLabel: "status / restaurant / similarity", searchPlaceholder: "Search user-entered or AI-detected name", noResultsLabel: "No pending menu items" }} />
        <CardGrid>
          {rows.map((row) => (
            <div className="grid gap-3" key={row.id}>
              <DetailCard
                title={row.userEnteredName}
                subtitle={`${row.restaurantName} / ${row.branchName ?? row.branchId}`}
                items={[
                  { label: "Pending ID", value: row.id },
                  { label: "Restaurant ID", value: row.restaurantId },
                  { label: "Branch ID", value: row.branchId },
                  { label: "AI detected name", value: row.aiDetectedName },
                  { label: "Candidate menuItemId", value: row.candidateMenuItemId ?? "unresolved" },
                  { label: "Candidate name", value: row.candidateMenuItemName ?? "unresolved" },
                  { label: "Occurrence count", value: row.occurrenceCount },
                  { label: "Similarity", value: row.similarityScore },
                  { label: "Restaurant status", value: row.restaurantProcessingStatus },
                  { label: "Platform status", value: row.platformProcessingStatus },
                  { label: "Actions", value: row.availableActions }
                ]}
              />
              <DraftTrace draftId={row.actionDraft?.id} auditLogId={row.actionDraft?.auditLogId} />
            </div>
          ))}
        </CardGrid>
      </div>
    </AdminShell>
  );
}
