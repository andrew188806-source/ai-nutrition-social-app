import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { FactList, ReadFailureNotice, ReadySection, StatusPill, SubLinks, enc, has } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuDetail } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; menuId: string }>("restaurant-menu-detail", async ({ context, params }) => {
  const result = await readMenuDetail(params.restaurantId, params.menuId);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/menus/${enc(params.menuId)}`;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="單一菜單的識別資料與分類（唯讀）。餐點資料需另外的權限。" entry={getAdminRoute("restaurant-menu-detail")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <>
          <ReadySection label="菜單資料">
            <h2 className="text-lg font-bold text-slate-950">{result.data.name}</h2>
            <p className="mb-4 font-mono text-xs text-slate-500">{result.data.restaurantId} / {result.data.menuId}</p>
            <FactList items={[
              { label: "狀態", value: <StatusPill status={result.data.status} /> },
              { label: "分類數", value: result.data.categories.length }
            ]} />
            <h3 className="mt-5 text-sm font-bold text-slate-950">分類</h3>
            {result.data.categories.length === 0 ? (
              <div className="mt-2"><EmptyNotice>這份菜單目前沒有分類。</EmptyNotice></div>
            ) : (
              <table className="mt-2 w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">分類</th><th className="py-2 pr-4">排序</th><th className="py-2">餐點數</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.data.categories.map((category) => (
                    <tr key={category.categoryId}><td className="py-2 pr-4">{category.name}<div className="font-mono text-xs text-slate-500">{category.categoryId}</div></td><td className="py-2 pr-4">{category.sortOrder}</td><td className="py-2">{category.itemCount}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </ReadySection>
          <SubLinks links={[{ label: "餐點", href: `${base}/items`, allowed: has(context, "admin.restaurants.menu_items.read") }]} />
        </>
      )}
    </article>
  );
});
