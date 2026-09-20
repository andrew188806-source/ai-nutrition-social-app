import Link from "next/link";
import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { PageControls, ReadFailureNotice, ReadySection, StatusPill, enc, has, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuList } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string }>("restaurant-menus", async ({ context, params, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readMenuList(params.restaurantId, page);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/menus`;
  const canOpenMenu = has(context, "admin.restaurants.menu.read");
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={`餐廳 ${params.restaurantId} 的菜單清單（唯讀，含所有生命週期狀態）；每頁 20 筆。`} entry={getAdminRoute("restaurant-menus")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>這間餐廳目前沒有菜單。</EmptyNotice>
      ) : (
        <ReadySection label="菜單清單">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">菜單</th><th className="py-2 pr-4">狀態</th><th className="py-2 pr-4">分類數</th><th className="py-2">餐點數</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((row) => (
                  <tr key={row.menuId}>
                    <td className="py-2 pr-4">
                      {canOpenMenu ? <Link className="font-bold text-sky-800 hover:underline" href={`${base}/${enc(row.menuId)}`}>{row.name}</Link> : <span className="font-bold">{row.name}</span>}
                      <div className="font-mono text-xs text-slate-500">{row.menuId}</div>
                    </td>
                    <td className="py-2 pr-4"><StatusPill status={row.status} /></td>
                    <td className="py-2 pr-4">{row.categoryCount}</td>
                    <td className="py-2">{row.itemCount}</td>
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
