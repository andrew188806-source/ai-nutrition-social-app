import Link from "next/link";
import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice, yesNo } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { PageControls, ReadFailureNotice, ReadySection, StatusPill, enc, has, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuItemList } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; menuId: string }>("restaurant-menu-items", async ({ context, params, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readMenuItemList(params.restaurantId, params.menuId, page);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/menus/${enc(params.menuId)}/items`;
  const canOpenItem = has(context, "admin.restaurants.menu_item.read");
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={`菜單 ${params.menuId} 的餐點清單（唯讀，含所有狀態）；每頁 20 筆。`} entry={getAdminRoute("restaurant-menu-items")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>這份菜單目前沒有餐點。</EmptyNotice>
      ) : (
        <ReadySection label="餐點清單">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">餐點</th><th className="py-2 pr-4">狀態</th><th className="py-2 pr-4">菜單</th><th className="py-2 pr-4">分類</th><th className="py-2 pr-4">營養標章狀態</th><th className="py-2">標章啟用</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((row) => (
                  <tr key={row.menuItemId}>
                    <td className="py-2 pr-4">
                      {canOpenItem ? <Link className="font-bold text-sky-800 hover:underline" href={`${base}/${enc(row.menuItemId)}`}>{row.name}</Link> : <span className="font-bold">{row.name}</span>}
                      <div className="font-mono text-xs text-slate-500">{row.menuItemId}</div>
                    </td>
                    <td className="py-2 pr-4"><StatusPill status={row.status} /></td>
                    <td className="py-2 pr-4">{row.menuName}</td>
                    <td className="py-2 pr-4">{row.categoryName}</td>
                    <td className="py-2 pr-4">{row.nutritionBadgeStatus}</td>
                    <td className="py-2">{yesNo(row.badgeEnabled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageControls basePath={base} hasMore={result.data.hasMore} page={page} />
        </ReadySection>
      )}
    </article>
  );
});
