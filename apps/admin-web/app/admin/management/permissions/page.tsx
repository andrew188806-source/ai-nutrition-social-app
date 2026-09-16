import { createAdminManagementPage } from "../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../components/admin-shell/admin-ia-navigation";
import { createAdminSupabaseServerClient } from "../../../../auth/supabase-server";

type CatalogRow = Readonly<{
  permission_key: string;
  lifecycle_status: string;
  readiness_status: string;
  sensitivity_class: string;
  individually_provisionable: boolean;
  temporary_grantable: boolean;
  ordinary_supervisor_delegable: boolean;
  privileged_only: boolean;
  console_admission_required: boolean;
}>;

function flag(value: boolean) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${value ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
      {value ? "是" : "否"}
    </span>
  );
}

async function PermissionCatalogView() {
  const client = createAdminSupabaseServerClient();
  const { data, error } = await client.rpc("staff_management_permission_catalog_v1");
  const rows = (error ? [] : (data as CatalogRow[] | null)) ?? [];

  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="目前已啟用（非 deferred）的權限鍵值唯讀目錄；本頁不提供授予或撤銷操作，請至個別人員詳情頁執行。"
        entry={getAdminRoute("management-permissions")}
      />
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">目前無法讀取權限目錄，請稍後重試。</p>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">權限鍵值</th>
                <th className="px-4 py-3 font-bold">敏感度分類</th>
                <th className="px-4 py-3 font-bold">高權限限定</th>
                <th className="px-4 py-3 font-bold">需主控台授權</th>
                <th className="px-4 py-3 font-bold">可個別授予</th>
                <th className="px-4 py-3 font-bold">可臨時授予</th>
                <th className="px-4 py-3 font-bold">可一般主管委派</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr className="hover:bg-sky-50" key={row.permission_key}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-800">{row.permission_key}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.sensitivity_class}</td>
                  <td className="px-4 py-3">{flag(row.privileged_only)}</td>
                  <td className="px-4 py-3">{flag(row.console_admission_required)}</td>
                  <td className="px-4 py-3">{flag(row.individually_provisionable)}</td>
                  <td className="px-4 py-3">{flag(row.temporary_grantable)}</td>
                  <td className="px-4 py-3">{flag(row.ordinary_supervisor_delegable)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={7}>目前沒有可讀取的權限資料。</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}

export default createAdminManagementPage("management-permissions", () => <PermissionCatalogView />);
