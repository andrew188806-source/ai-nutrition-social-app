import { headers } from "next/headers";
import { AdminShell } from "../../components/AdminShell";
import { BeforeAfter, CardGrid, DetailCard, DraftTrace, PageStatePanel } from "../../components/CanonicalGovernanceUi";
import { PlatformAdminBranchStatus } from "../../components/PlatformAdminBranchStatus";
import { adminRestaurantService } from "../../services/admin-restaurant-service";
import { readPlatformAdminBranchStatus } from "../../server/platformAdminBranchStatusRuntime";
import { getPlatformAdminBranchStatusConfig } from "../../server/platformAdminBranchStatusTransport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RestaurantReviewPage({ searchParams }: Readonly<{
  searchParams?: Readonly<Record<string, string | string[] | undefined>>;
}>) {
  const rows = adminRestaurantService.listRestaurantReviews();
  const restaurantId = typeof searchParams?.restaurantId === "string" ? searchParams.restaurantId : null;
  const branchId = typeof searchParams?.branchId === "string" ? searchParams.branchId : null;
  const preview = await readPlatformAdminBranchStatus(
    headers().get("authorization"), restaurantId, branchId, getPlatformAdminBranchStatusConfig()
  );

  return (
    <AdminShell title="Restaurant and Branch Review" subtitle="Platform review of canonical Restaurant and RestaurantBranch changes.">
      <div className="grid gap-5">
        <PlatformAdminBranchStatus initialPreview={preview} />
        <p className="text-xs text-slate-500">下列為示範資料（Mock），不授予管理員權限，也不會啟用上方正式狀態控制。</p>
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
