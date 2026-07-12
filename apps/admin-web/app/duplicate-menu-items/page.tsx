import { AdminShell } from "../../components/AdminShell";
import { CardGrid, DetailCard, DraftTrace, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { adminMenuItemService } from "../../services/admin-menu-item-service";

export default function DuplicateMenuItemsPage() {
  const rows = adminMenuItemService.listDuplicateCandidates();

  return (
    <AdminShell title="Duplicate Menu-Item Governance" subtitle="Candidate review without deleting referenced MenuItem records.">
      <div className="grid gap-5">
        <PageStatePanel state={{ loading: false, filterLabel: "similarity / restaurant / action", searchPlaceholder: "Search canonical or suspected menuItemId", noResultsLabel: "No duplicate candidates" }} />
        <CardGrid>
          {rows.map((row) => (
            <div className="grid gap-3" key={row.id}>
              <DetailCard
                title={`${row.officialMenuItemName} -> ${row.suspectedName}`}
                subtitle={`${row.restaurantName}${row.branchName ? ` / ${row.branchName}` : ""}`}
                items={[
                  { label: "Candidate ID", value: row.id },
                  { label: "Canonical menuItemId", value: row.canonicalMenuItemId },
                  { label: "Suspected duplicate", value: row.suspectedDuplicateMenuItemId },
                  { label: "Aliases", value: row.aliases.map((alias) => alias.aliasName) },
                  { label: "Ingredients", value: row.ingredients.map((ingredient) => ingredient.ingredientId) },
                  { label: "Nutrition", value: row.nutrition ? `${row.nutrition.calories ?? "?"} kcal / ${row.nutrition.source}` : "missing" },
                  { label: "Similarity", value: row.similarityScore },
                  { label: "Usage count", value: row.usageCount },
                  { label: "Recommendation refs", value: row.recommendationReferenceCount },
                  { label: "Meal-record refs", value: row.mealRecordReferenceCount },
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
