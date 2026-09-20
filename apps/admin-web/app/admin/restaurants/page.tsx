import Link from "next/link";
import { createAdminOperationalPage } from "../../../components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../components/admin-shell/admin-ia-navigation";
import { PageControls, ReadFailureNotice, ReadySection, StatusPill, dash, enc, parsePageParam } from "../../../components/admin-shell/AdminRestaurantViews";
import { readRestaurantList } from "../../../server/adminRestaurantRead";

export const dynamic = "force-dynamic";

export default createAdminOperationalPage<Record<string, never>>("restaurants", async ({ searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readRestaurantList(page);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="平台餐廳清單（唯讀，含草稿與非啟用狀態）。資料來自正式營運讀取契約；每頁 20 筆。"
        entry={getAdminRoute("restaurants")}
      />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600" data-b2-state="empty" role="status">目前沒有餐廳資料。</p>
      ) : (
        <ReadySection label="餐廳清單">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-2 pr-4">餐廳</th><th className="py-2 pr-4">城市</th><th className="py-2 pr-4">類別</th><th className="py-2 pr-4">狀態</th><th className="py-2 pr-4">分店數</th><th className="py-2 pr-4">有效成員</th><th className="py-2">負責人</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((row) => (
                  <tr key={row.restaurantId}>
                    <td className="py-2 pr-4"><Link className="font-bold text-sky-800 hover:underline" href={`/admin/restaurants/${enc(row.restaurantId)}`}>{row.name}</Link><div className="font-mono text-xs text-slate-500">{row.restaurantId}</div></td>
                    <td className="py-2 pr-4">{dash(row.city) ?? "—"}</td>
                    <td className="py-2 pr-4">{dash(row.category) ?? "—"}</td>
                    <td className="py-2 pr-4"><StatusPill status={row.status} /></td>
                    <td className="py-2 pr-4">{row.branchCount}</td>
                    <td className="py-2 pr-4">{row.activeMembershipCount}</td>
                    <td className="py-2">{row.hasActiveOwner ? "有" : "無"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageControls basePath="/admin/restaurants" hasMore={result.data.hasMore} page={page} />
        </ReadySection>
      )}
    </article>
  );
});
