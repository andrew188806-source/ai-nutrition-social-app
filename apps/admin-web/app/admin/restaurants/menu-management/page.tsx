import Link from "next/link";
import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { FactList, PageControls, ReadFailureNotice, ReadySection, StatusPill, SubLinks, enc, has, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readMenuManagementOverview } from "apps/admin-web/server/adminReviewQueueRead";

export default createAdminOperationalPage<Record<string, never>>("menu-management", async ({ context, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readMenuManagementOverview(page);
  const canOpenRestaurant = has(context, "admin.restaurants.read");
  const canOpenMenus = has(context, "admin.restaurants.menus.read");
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description="跨店菜單工作台（唯讀）：各餐廳菜單與餐點的生命週期狀態總覽。此頁只顯示現有狀態，不提供編輯；每頁 20 筆。" entry={getAdminRoute("menu-management")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : (
        <>
          <ReadySection label="平台狀態總覽">
            <FactList items={[
              { label: "餐廳數", value: result.data.totals.restaurantCount },
              { label: "菜單（草稿／已發布／封存）", value: `${result.data.totals.menusByStatus.draft} / ${result.data.totals.menusByStatus.published} / ${result.data.totals.menusByStatus.archived}` },
              { label: "餐點（草稿／啟用／封存）", value: `${result.data.totals.itemsByStatus.draft} / ${result.data.totals.itemsByStatus.active} / ${result.data.totals.itemsByStatus.archived}` }
            ]} />
          </ReadySection>
          {result.data.items.length === 0 ? (
            <EmptyNotice>目前沒有餐廳資料。</EmptyNotice>
          ) : (
            <ReadySection label="各餐廳菜單狀態">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="py-2 pr-4">餐廳</th><th className="py-2 pr-4">餐廳狀態</th><th className="py-2 pr-4">菜單（草稿／發布／封存）</th><th className="py-2 pr-4">餐點（草稿／啟用／封存）</th><th className="py-2">前往</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.data.items.map((row) => (
                      <tr data-queue-row={row.restaurantId} key={row.restaurantId}>
                        <td className="py-2 pr-4"><span className="font-bold">{row.name}</span><div className="font-mono text-xs text-slate-500">{row.restaurantId}</div></td>
                        <td className="py-2 pr-4"><StatusPill status={row.status} /></td>
                        <td className="py-2 pr-4">{row.menuCount}（{row.draftMenuCount} / {row.publishedMenuCount} / {row.archivedMenuCount}）</td>
                        <td className="py-2 pr-4">{row.itemCount}（{row.draftItemCount} / {row.activeItemCount} / {row.archivedItemCount}）</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-x-3 text-xs">
                            {canOpenRestaurant ? <Link className="font-bold text-sky-800 hover:underline" href={`/admin/restaurants/${enc(row.restaurantId)}`}>餐廳</Link> : null}
                            {canOpenMenus ? <Link className="font-bold text-sky-800 hover:underline" href={`/admin/restaurants/${enc(row.restaurantId)}/menus`}>菜單</Link> : null}
                            {!canOpenRestaurant && !canOpenMenus ? <span className="text-slate-400">—</span> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PageControls basePath="/admin/restaurants/menu-management" hasMore={result.data.hasMore} page={page} />
            </ReadySection>
          )}
          <SubLinks links={[
            { label: "待新增餐點", href: "/admin/restaurants/menu-management/pending", allowed: has(context, "admin.restaurants.menu_management.pending.read") },
            { label: "待補資料", href: "/admin/restaurants/menu-management/data-quality", allowed: has(context, "admin.restaurants.menu_management.data_quality.read") },
            { label: "待認證餐點", href: "/admin/nutrition/certification/pending", allowed: has(context, "admin.nutrition.certification.pending.read") }
          ]} />
        </>
      )}
    </article>
  );
});
