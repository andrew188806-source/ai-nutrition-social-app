import Link from "next/link";
import { createAdminManagementPage } from "../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../components/admin-shell/admin-ia-navigation";
import { createAdminSupabaseServerClient } from "../../../../auth/supabase-server";
import { LinkStaffAccountPanel } from "../../../../components/admin-shell/LinkStaffAccountPanel";
import { canReadStaffRoster, resolveStaffRosterState, type StaffRosterState } from "../../../../auth/admin-staff-roster-state";

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

async function readRoster(canRead: boolean): Promise<StaffRosterState<StaffRow>> {
  // A caller without admin.management.staff.read is never sent to the roster read.
  if (!canRead) return resolveStaffRosterState<StaffRow>({ canRead, error: null, data: null });
  try {
    const { data, error } = await createAdminSupabaseServerClient().rpc("staff_management_list_staff_v1");
    return resolveStaffRosterState<StaffRow>({ canRead, error, data });
  } catch {
    return resolveStaffRosterState<StaffRow>({ canRead, error: true, data: null });
  }
}

function RosterTable({ rows }: { rows: readonly StaffRow[] }) {
  return (
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
        </tbody>
      </table>
    </section>
  );
}

function RosterBody({ roster }: { roster: StaffRosterState<StaffRow> }) {
  if (roster.state === "permission_denied") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-staff-roster-state="permission_denied" role="alert">
        目前帳號沒有 admin.management.staff.read 權限，無法查看人員清單。此處不會顯示任何人員帳號或數量。
      </p>
    );
  }
  if (roster.state === "unavailable") {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" data-staff-roster-state="unavailable" role="alert">
        目前無法讀取人員清單，請稍後重試。
      </p>
    );
  }
  if (roster.state === "authorized_empty") {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500" data-staff-roster-state="authorized_empty">
        目前沒有人員帳號。
      </p>
    );
  }
  return <div data-staff-roster-state="authorized_with_data"><RosterTable rows={roster.rows} /></div>;
}

async function StaffListView({ canRead }: { canRead: boolean }) {
  const roster = await readRoster(canRead);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="所有已建立的人員帳號與其生命週期狀態；權限授予／撤銷請進入個別人員詳情頁。"
        entry={getAdminRoute("management-staff")}
      />
      <LinkStaffAccountPanel />
      <RosterBody roster={roster} />
    </article>
  );
}

export default createAdminManagementPage("management-staff", (context) => (
  <StaffListView canRead={canReadStaffRoster(context.permissions)} />
));
