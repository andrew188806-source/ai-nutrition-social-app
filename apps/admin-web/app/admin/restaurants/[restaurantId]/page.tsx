import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { FactList, ReadFailureNotice, ReadySection, StatusPill, SubLinks, dash, enc, has } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readRestaurantDetail } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string }>("restaurant-detail", async ({ context, params }) => {
  const result = await readRestaurantDetail(params.restaurantId);
  const base = `/admin/restaurants/${enc(params.restaurantId)}`;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="單一餐廳的營運摘要（唯讀）。介紹、聯絡資料與分店需各自的權限。" entry={getAdminRoute("restaurant-detail")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <>
          <ReadySection label="餐廳摘要">
            <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
            <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId}</p>
            <FactList items={[
              { label: "狀態", value: <StatusPill status={result.data.status} /> },
              { label: "城市", value: dash(result.data.city) },
              { label: "類別", value: dash(result.data.category) },
              { label: "建立時間", value: result.data.createdAt },
              { label: "分店（啟用／全部）", value: `${result.data.activeBranchCount} / ${result.data.branchCount}` },
              { label: "菜單數", value: result.data.menuCount },
              { label: "餐點數", value: result.data.menuItemCount },
              { label: "有效成員數", value: result.data.activeMembershipCount },
              { label: "有負責人", value: result.data.hasActiveOwner ? "是" : "否" }
            ]} />
          </ReadySection>
          <SubLinks links={[
            { label: "介紹", href: `${base}/about`, allowed: has(context, "admin.restaurants.about.read") },
            { label: "聯絡資料", href: `${base}/contact`, allowed: has(context, "admin.restaurants.contact.read") },
            { label: "分店", href: `${base}/branches`, allowed: has(context, "admin.restaurants.branches.read") }
          ]} />
        </>
      )}
    </article>
  );
});
