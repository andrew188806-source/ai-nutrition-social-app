import Link from "next/link";
import { createAdminManagementPage } from "../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../components/admin-shell/admin-ia-navigation";
import { createAdminSupabaseServerClient } from "../../../../auth/supabase-server";

type StaffRow = Readonly<{
  staff_account_id: string;
  auth_user_id: string;
  status: "active" | "suspended" | "revoked";
  effective_from: string;
  effective_until: string | null;
  status_version: number;
  console_admission_active: boolean;
  created_at: string;
  updated_at: string;
}>;

const STATUS_ZH_TW: Readonly<Record<StaffRow["status"], string>> = {
  active: "使用中",
  suspended: "已停用",
  revoked: "已撤銷"
};

const STATUS_BADGE_CLASS: Readonly<Record<StaffRow["status"], string>> = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  suspended: "bg-amber-50 text-amber-800 border-amber-200",
  revoked: "bg-slate-100 text-slate-500 border-slate-200"
};

async function StaffListView() {
  const client = createAdminSupabaseServerClient();
  const { data, error } = await client.rpc("staff_management_list_staff_v1");
  const rows = (error ? [] : (data as StaffRow[] | null)) ?? [];

  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="所有已建立的人員帳號與其生命週期狀態；權限授予／撤銷請進入個別人員詳情頁。"
        entry={getAdminRoute("management-staff")}
      />
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          目前無法讀取人員清單，請稍後重試。
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">人員帳號 ID</th>
                <th className="px-4 py-3 font-bold">狀態</th>
                <th className="px-4 py-3 font-bold">主控台已授權</th>
                <th className="px-4 py-3 font-bold">生效期間</th>
                <th className="px-4 py-3 font-bold">建立時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr className="hover:bg-sky-50" key={row.staff_account_id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    <Link className="text-sky-700 hover:underline" href={`/admin/management/staff/${row.staff_account_id}`}>
                      {row.staff_account_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_BADGE_CLASS[row.status]}`}>
                      {STATUS_ZH_TW[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{row.console_admission_active ? "是" : "否"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(row.effective_from).toLocaleString("zh-TW")}
                    {row.effective_until ? ` – ${new Date(row.effective_until).toLocaleString("zh-TW")}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{new Date(row.created_at).toLocaleString("zh-TW")}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={5}>目前沒有人員帳號。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}

export default createAdminManagementPage("management-staff", () => <StaffListView />);
