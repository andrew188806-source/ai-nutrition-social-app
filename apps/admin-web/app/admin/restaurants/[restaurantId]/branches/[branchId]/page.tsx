import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, StatusPill, SubLinks, dash, enc, has } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readBranchDetail } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; branchId: string }>("restaurant-branch-detail", async ({ context, params }) => {
  const result = await readBranchDetail(params.restaurantId, params.branchId);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/branches/${enc(params.branchId)}`;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="單一分店的營運資料（唯讀）。狀態變更請使用「分店狀態」功能。" entry={getAdminRoute("restaurant-branch-detail")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <>
          <ReadySection label="分店資料">
            <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
            <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId} / {result.data.branchId}</p>
            <FactList items={[
              { label: "狀態", value: <StatusPill status={result.data.status} /> },
              { label: "狀態版本", value: result.data.statusVersion },
              { label: "行政區", value: dash(result.data.district) },
              { label: "地址", value: dash(result.data.address) },
              { label: "時區", value: dash(result.data.timezoneName) },
              { label: "已連結餐點數", value: result.data.menuItemLinkCount }
            ]} />
          </ReadySection>
          <SubLinks links={[
            { label: "聯絡資料", href: `${base}/contact`, allowed: has(context, "admin.restaurants.contact.read") },
            { label: "營業時間與休業", href: `${base}/hours`, allowed: has(context, "admin.restaurants.hours.read") },
            { label: "地理資料", href: `${base}/geo`, allowed: has(context, "admin.restaurants.geo.read") },
            { label: "分店餐點", href: `${base}/menu-items`, allowed: has(context, "admin.restaurants.menu_items.read") },
            { label: "分店狀態（變更）", href: `${base}/status`, allowed: has(context, "admin_restaurant_branch.status.write") }
          ]} />
        </>
      )}
    </article>
  );
});
