import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { QueueTable } from "apps/admin-web/components/admin-shell/AdminQueueViews";
import { PageControls, ReadFailureNotice, ReadySection, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readNutritionCertificationPending } from "apps/admin-web/server/adminReviewQueueRead";
import type { CertificationRow } from "apps/admin-web/server/adminReviewQueueRead";

const pendingRecords = (row: CertificationRow): string => {
  if (row.pendingRecordCount === 0) return "0 筆";
  const latest = row.latestPendingRecordAt === null ? "" : `最近 ${row.latestPendingRecordAt}`;
  const source = row.latestPendingRecordSource === null ? "" : `來源 ${row.latestPendingRecordSource}`;
  const detail = [latest, source].filter((part) => part !== "").join("，");
  return detail === "" ? `${row.pendingRecordCount} 筆` : `${row.pendingRecordCount} 筆（${detail}）`;
};

export default createAdminOperationalPage<Record<string, never>>("nutrition-certification-pending", async ({ context, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readNutritionCertificationPending(page);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="待認證餐點（唯讀）：營養標章狀態或營養紀錄驗證狀態為「待審核」的餐點。此頁只顯示現有審核狀態，不提供核准、駁回或修改；每頁 20 筆。" entry={getAdminRoute("nutrition-certification-pending")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>目前沒有待審核的營養資料。</EmptyNotice>
      ) : (
        <ReadySection label="待認證餐點">
          <QueueTable
            context={context}
            extraColumns={[
              { header: "營養標章狀態", cell: (row) => row.nutritionBadgeStatus },
              { header: "待審紀錄", cell: pendingRecords }
            ]}
            rows={result.data.items}
          />
          <PageControls basePath="/admin/nutrition/certification/pending" hasMore={result.data.hasMore} page={page} />
        </ReadySection>
      )}
    </article>
  );
});
