import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice, yesNo } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { PageControls, ReadFailureNotice, ReadySection, StatusPill, dash, enc, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readBranchMenuItemList } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string; branchId: string }>("restaurant-branch-menu-items", async ({ params, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readBranchMenuItemList(params.restaurantId, params.branchId, page);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/branches/${enc(params.branchId)}/menu-items`;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={`分店 ${params.branchId} 與餐點的關聯（價格、供應與售完狀態，唯讀）；每頁 20 筆。價格與供應變更屬於餐廳負責人的功能。`} entry={getAdminRoute("restaurant-branch-menu-items")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>這間分店目前沒有關聯的餐點。</EmptyNotice>
      ) : (
        <ReadySection label="分店餐點清單">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">餐點</th><th className="py-2 pr-4">餐點狀態</th><th className="py-2 pr-4">分店品名</th><th className="py-2 pr-4">價格</th><th className="py-2 pr-4">供應</th><th className="py-2 pr-4">售完</th><th className="py-2">分店狀態</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((row) => (
                  <tr key={row.branchMenuItemId}>
                    <td className="py-2 pr-4"><span className="font-bold">{row.menuItemName}</span><div className="font-mono text-xs text-slate-500">{row.menuItemId}</div></td>
                    <td className="py-2 pr-4"><StatusPill status={row.menuItemStatus} /></td>
                    <td className="py-2 pr-4">{dash(row.branchSpecificName) ?? "—"}</td>
                    <td className="py-2 pr-4">{row.price}</td>
                    <td className="py-2 pr-4">{row.availability}</td>
                    <td className="py-2 pr-4">{yesNo(row.soldOut)}</td>
                    <td className="py-2">{row.branchSpecificStatus}</td>
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
