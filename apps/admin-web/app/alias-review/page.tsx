import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, DraftTrace, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { adminAliasService } from "../../services/admin-alias-service";

export default function AliasReviewPage() {
  const rows = adminAliasService.listAliasReviews();

  return (
    <AdminShell title="MenuItemAlias Review" subtitle="Alias governance mapped to official menuItemId values.">
      <div className="grid gap-5">
        <PageStatePanel state={{ loading: false, filterLabel: "source / confidence / status", searchPlaceholder: "Search aliasName or normalizedAliasName", noResultsLabel: "No aliases awaiting review" }} />
        <CardGrid>
          {rows.map((row) => (
            <div className="grid gap-3" key={row.id}>
              <DetailCard
                title={row.aliasName}
                subtitle={`${row.restaurantName}${row.branchName ? ` / ${row.branchName}` : ""}`}
                items={[
                  { label: "Alias ID", value: row.aliasId },
                  { label: "Normalized", value: row.normalizedAliasName },
                  { label: "Source", value: row.sourceType },
                  { label: "Suggested menuItemId", value: row.suggestedMenuItemId },
                  { label: "Suggested item", value: row.suggestedMenuItemName },
                  { label: "Confidence", value: row.confidenceScore },
                  { label: "Usage", value: row.usageCount },
                  { label: "Status", value: row.status },
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
