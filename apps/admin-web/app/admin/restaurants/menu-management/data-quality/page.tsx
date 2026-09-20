import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { QueueTable } from "apps/admin-web/components/admin-shell/AdminQueueViews";
import { PageControls, ReadFailureNotice, ReadySection, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuManagementDataQuality } from "apps/admin-web/server/adminReviewQueueRead";

export default createAdminOperationalPage<Record<string, never>>("menu-management-data-quality", async ({ context, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readMenuManagementDataQuality(page);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="待補資料（唯讀）：違反明確資料規則的餐點（菜單歸屬與餐廳不一致、標章與營養紀錄不一致、多筆現行營養紀錄）。不含主觀評分；此頁不提供修復；每頁 20 筆。" entry={getAdminRoute("menu-management-data-quality")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>目前沒有違反資料規則的餐點。</EmptyNotice>
      ) : (
        <ReadySection label="待補資料">
          <QueueTable context={context} rows={result.data.items} />
          <PageControls basePath="/admin/restaurants/menu-management/data-quality" hasMore={result.data.hasMore} page={page} />
        </ReadySection>
      )}
    </article>
  );
});
