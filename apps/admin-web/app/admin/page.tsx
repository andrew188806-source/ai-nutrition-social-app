import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, has } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readDashboardCounts } from "apps/admin-web/server/adminDashboardSocialRead";

export default createAdminOperationalPage<Record<string, never>>("dashboard", async ({ context }) => {
  const canReadCounts = has(context, "admin.dashboard.counts.read");
  const result = canReadCounts ? await readDashboardCounts() : null;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="管理後台總覽。基本管理員可進入此頁；營運彙總只提供給具備總覽統計讀取權限的人員。"
        entry={getAdminRoute("dashboard")}
      />
      {!canReadCounts ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm" data-admin-d-counts="not-authorized">
          此帳號可使用管理後台，但未取得營運彙總讀取權限。
        </section>
      ) : result?.state !== "ready" ? (
        <ReadFailureNotice state={result?.state ?? "unavailable"} />
      ) : (
        <>
          <ReadySection label="現況彙總">
            <FactList items={[
              { label: "餐廳", value: result.data.restaurants },
              { label: "分店", value: result.data.branches },
              { label: "菜單", value: result.data.menus },
              { label: "餐點", value: result.data.menuItems }
            ]} />
          </ReadySection>
          <ReadySection label="目前待處理項目">
            <FactList items={[
              { label: "草稿餐點", value: result.data.draftMenuItems },
              { label: "資料品質異常餐點", value: result.data.dataQualityMenuItems },
              { label: "待營養審查餐點", value: result.data.nutritionReviewPendingMenuItems }
            ]} />
          </ReadySection>
        </>
      )}
    </article>
  );
});
