import Link from "next/link";
import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { PageControls, ReadFailureNotice, ReadySection, StatusPill, dash, enc, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { readBranchList } from "apps/admin-web/server/adminRestaurantRead";

export default createAdminOperationalPage<{ restaurantId: string }>("restaurant-branches", async ({ params, searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readBranchList(params.restaurantId, page);
  const base = `/admin/restaurants/${enc(params.restaurantId)}/branches`;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={`餐廳 ${params.restaurantId} 的分店清單（唯讀，含非啟用分店）；每頁 20 筆。`} entry={getAdminRoute("restaurant-branches")} />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600" data-b2-state="empty" role="status">這間餐廳目前沒有分店。</p>
      ) : (
        <ReadySection label="分店清單">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">分店</th><th className="py-2 pr-4">行政區</th><th className="py-2">狀態</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((row) => (
                  <tr key={row.branchId}>
                    <td className="py-2 pr-4"><Link className="font-bold text-sky-800 hover:underline" href={`${base}/${enc(row.branchId)}`}>{row.name}</Link><div className="font-mono text-xs text-slate-500">{row.branchId}</div></td>
                    <td className="py-2 pr-4">{dash(row.district) ?? "—"}</td>
                    <td className="py-2"><StatusPill status={row.status} /></td>
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
