import { notFound } from "next/navigation";
import { createAdminManagementParamPage } from "../../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../../components/admin-shell/admin-ia-navigation";
import { createAdminSupabaseServerClient } from "../../../../../auth/supabase-server";
import { StaffAuthorityPanel, type StaffAuthority } from "../../../../../components/admin-shell/StaffAuthorityPanel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DetailRow = Readonly<{
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

async function StaffDetailView({ staffAccountId }: { staffAccountId: string }) {
  if (!UUID.test(staffAccountId)) notFound();
  const client = createAdminSupabaseServerClient();
  const [detailResult, authorityResult] = await Promise.all([
    client.rpc("staff_management_staff_detail_v1", { p_staff_account_id: staffAccountId }),
    client.rpc("staff_management_staff_authority_v1", { p_staff_account_id: staffAccountId })
  ]);
  const rows = (detailResult.error ? [] : (detailResult.data as DetailRow[] | null)) ?? [];
  const detail = rows[0];
  const authority = (authorityResult.error ? null : (authorityResult.data as StaffAuthority)) ?? null;

  if (!detail) {
    return (
      <article className="space-y-5">
        <AdminWorkspaceHeader
          description="此人員帳號不存在，或目前帳號沒有讀取權限。"
          entry={getAdminRoute("management-staff-detail")}
        />
      </article>
    );
  }

  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description={`人員帳號 ${detail.staff_account_id} 的生命週期與高權限管理。`}
        entry={getAdminRoute("management-staff-detail")}
      />
      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div><p className="text-xs font-bold text-slate-500">Auth UUID</p><p className="mt-1 font-mono text-sm text-slate-800">{detail.auth_user_id}</p></div>
        <div><p className="text-xs font-bold text-slate-500">狀態</p><p className="mt-1 text-sm text-slate-800">{detail.status}（status_version {detail.status_version}）</p></div>
        <div><p className="text-xs font-bold text-slate-500">生效期間</p><p className="mt-1 text-sm text-slate-800">{new Date(detail.effective_from).toLocaleString("zh-TW")}{detail.effective_until ? ` – ${new Date(detail.effective_until).toLocaleString("zh-TW")}` : "（無期限）"}</p></div>
        <div><p className="text-xs font-bold text-slate-500">主控台存取</p><p className="mt-1 text-sm text-slate-800">{detail.console_admission_active ? "已授予" : "未授予"}</p></div>
      </section>

      {authority ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-950">目前有效授權 (Entitlements)</h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {authority.entitlements.length === 0 ? <li>無</li> : authority.entitlements.map((item) => (
                <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={item.entitlementId}>
                  <span className="font-mono">{item.permissionKey}</span> · {item.status} · {item.sourceType}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-950">高權限授予 (Privileged Grants)</h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {authority.privilegedGrants.length === 0 ? <li>無</li> : authority.privilegedGrants.map((item) => (
                <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={item.privilegedPermissionGrantId}>
                  <span className="font-mono">{item.permissionKey}</span> · {item.status} (v{item.statusVersion})
                  <br /><span className="font-mono text-[10px] text-slate-400">{item.privilegedPermissionGrantId}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-950">持有的委派權限 (Delegations Held)</h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {authority.delegationsHeld.length === 0 ? <li>無</li> : authority.delegationsHeld.map((item) => (
                <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={item.delegationId}>
                  <span className="font-mono">{item.permissionKey}</span> · {item.status}
                  <br /><span className="font-mono text-[10px] text-slate-400">{item.delegationId}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-950">主控台授權紀錄</h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {authority.consoleAdmissions.length === 0 ? <li>無</li> : authority.consoleAdmissions.map((item) => (
                <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={item.consoleAdmissionGrantId}>
                  {item.status} (v{item.statusVersion})
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">目前帳號沒有 admin.management.permissions.read 權限，無法查看詳細授權清單。</p>
      )}

      <StaffAuthorityPanel
        authority={authority}
        initialStatus={detail.status}
        initialStatusVersion={detail.status_version}
        staffAccountId={detail.staff_account_id}
      />
    </article>
  );
}

export default createAdminManagementParamPage<{ staffAccountId: string }>(
  "management-staff-detail",
  (_context, params) => <StaffDetailView staffAccountId={params.staffAccountId} />
);
