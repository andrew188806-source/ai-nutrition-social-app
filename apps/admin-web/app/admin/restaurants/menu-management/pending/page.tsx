import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { QueueTable } from "apps/admin-web/components/admin-shell/AdminQueueViews";
import { PageControls, ReadFailureNotice, ReadySection, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuManagementPending } from "apps/admin-web/server/adminReviewQueueRead";

export default createAdminOperationalPage<Record<string, never>>("menu-management-pending", async ({ context, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readMenuManagementPending(page);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="待新增餐點（唯讀）：餐點狀態為「草稿」、尚未啟用的餐點。此頁不提供核准、發布或編輯；每頁 20 筆。" entry={getAdminRoute("menu-management-pending")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>目前沒有狀態為草稿的餐點。</EmptyNotice>
      ) : (
        <ReadySection label="待新增餐點">
          <QueueTable context={context} rows={result.data.items} />
          <PageControls basePath="/admin/restaurants/menu-management/pending" hasMore={result.data.hasMore} page={page} />
        </ReadySection>
      )}
    </article>
  );
});
