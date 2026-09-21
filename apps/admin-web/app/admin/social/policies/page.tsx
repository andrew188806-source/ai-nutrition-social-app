import { createAdminOperationalPage } from "apps/admin-web/components/admin-shell/AdminOperationalPage";
import { AdminWorkspaceHeader } from "apps/admin-web/components/admin-shell/AdminWorkspaceHeader";
import { EmptyNotice } from "apps/admin-web/components/admin-shell/AdminMenuViews";
import { PageControls, ReadFailureNotice, ReadySection, parsePageParam } from "apps/admin-web/components/admin-shell/AdminRestaurantViews";
import { getAdminRoute } from "apps/admin-web/components/admin-shell/admin-ia-navigation";
import { readSocialPolicies } from "apps/admin-web/server/adminDashboardSocialRead";

export default createAdminOperationalPage<Record<string, never>>("social-policies", async ({ searchParams }) => {
  const page = parsePageParam(searchParams.page);
  const result = await readSocialPolicies(page);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="平台社交興趣目錄（唯讀）。顯示穩定機器識別、階層、啟用／可選狀態與本地化標籤；不含任何會員選擇、配對或私人社交資料。"
        entry={getAdminRoute("social-policies")}
      />
      {result.state !== "ready" ? <ReadFailureNotice state={result.state} /> : result.data.items.length === 0 ? (
        <EmptyNotice>此頁目前沒有目錄項目。</EmptyNotice>
      ) : (
        <ReadySection label="社交興趣目錄">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-2 pr-4">識別</th><th className="py-2 pr-4">命名空間／階層</th><th className="py-2 pr-4">狀態</th><th className="py-2">標籤</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.items.map((row) => (
                  <tr data-social-policy-row={row.tagKey} key={row.tagKey}>
                    <td className="py-3 pr-4 font-mono text-xs">{row.tagKey}</td>
                    <td className="py-3 pr-4">{row.namespace} · depth {row.depth}<div className="font-mono text-xs text-slate-500">parent: {row.parentKey ?? "—"} · order: {row.displayOrder}</div></td>
                    <td className="py-3 pr-4">{row.active ? "啟用" : "停用"} · {row.selectable ? "可選" : "不可選"}</td>
                    <td className="py-3">{row.labels.length === 0 ? <span className="text-slate-400">—</span> : row.labels.map((label) => <div key={label.locale}><span className="font-mono text-xs text-slate-500">{label.locale}</span> {label.label}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageControls basePath="/admin/social/policies" hasMore={result.data.hasMore} page={page} pageSize={50} />
        </ReadySection>
      )}
    </article>
  );
});
