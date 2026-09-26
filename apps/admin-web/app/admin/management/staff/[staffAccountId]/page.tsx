import { notFound } from "next/navigation";
import { createAdminManagementParamPage } from "../../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../../components/admin-shell/admin-ia-navigation";
import { createAdminSupabaseServerClient } from "../../../../../auth/supabase-server";
import { StaffAuthorityPanel, type StaffAuthority } from "../../../../../components/admin-shell/StaffAuthorityPanel";
import { PrimaryWizard } from "../../../../../components/admin-shell/PrimaryWizard";
import { ManagerPresetPanel } from "../../../../../components/admin-shell/ManagerPresetPanel";
import { resolvePrimaryWizardTargetRelation } from "../../../../../auth/admin-primary-wizard-target";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The exact management keys a daily Primary Permission Manager needs to operate the
// workspace end to end. This is a display-only derivation, not a database role: Primary
// stays defined purely by holding these exact permissions, nothing more.
const PRIMARY_READY_KEYS = [
  "admin_context.read",
  "admin.management.read",
  "admin.management.staff.read",
  "admin.management.permissions.read",
  "admin.management.staff.account.write",
  "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write",
  "admin.management.staff.permission.write"
] as const;

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

async function StaffDetailView({ staffAccountId, actorSubject, actorCanWrite, actorCanConsoleAdmission }: {
  staffAccountId: string;
  actorSubject: string;
  actorCanWrite: boolean;
  actorCanConsoleAdmission: boolean;
}) {
  if (!UUID.test(staffAccountId)) notFound();
  const client = createAdminSupabaseServerClient();
  const [detailResult, authorityResult] = await Promise.all([
    client.rpc("staff_management_staff_detail_v1", { p_staff_account_id: staffAccountId }),
    client.rpc("staff_management_staff_authority_v1", { p_staff_account_id: staffAccountId })
  ]);
  const rows = (detailResult.error ? [] : (detailResult.data as DetailRow[] | null)) ?? [];
  const detail = rows[0];
  const authority = (authorityResult.error ? null : (authorityResult.data as StaffAuthority)) ?? null;
  // Stable identity only: the verified actor subject vs the target's Auth user ID (unique per
  // staff account). Without a readable detail row the relation stays "unknown".
  const targetRelation = resolvePrimaryWizardTargetRelation({ actorSubject, targetAuthUserId: detail?.auth_user_id });

  // detail is null either because the account does not exist, or because the caller lacks
  // admin.management.staff.read. The two are indistinguishable from here by design (the read
  // RPC returns zero rows either way) -- but the action forms below do not depend on this read
  // succeeding: they only need the staffAccountId from the URL, and each mutation is
  // independently authorized (Step-Up + the target permission's own check) regardless of
  // whether the caller can also read the account's lifecycle detail. This matters for a
  // Break-glass-recovered actor, whose four emergency permissions do not include
  // admin.management.staff.read.

  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description={detail ? `人員帳號 ${detail.staff_account_id} 的生命週期與高權限管理。` : "此人員帳號不存在，或目前帳號沒有讀取權限；下方操作仍可執行，結果以實際回應為準。"}
        entry={getAdminRoute("management-staff-detail")}
      />
      {detail ? (
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div><p className="text-xs font-bold text-slate-500">Auth UUID</p><p className="mt-1 font-mono text-sm text-slate-800">{detail.auth_user_id}</p></div>
          <div><p className="text-xs font-bold text-slate-500">狀態</p><p className="mt-1 text-sm text-slate-800">{detail.status}（status_version {detail.status_version}）</p></div>
          <div><p className="text-xs font-bold text-slate-500">生效期間</p><p className="mt-1 text-sm text-slate-800">{new Date(detail.effective_from).toLocaleString("zh-TW")}{detail.effective_until ? ` – ${new Date(detail.effective_until).toLocaleString("zh-TW")}` : "（無期限）"}</p></div>
          <div><p className="text-xs font-bold text-slate-500">主控台存取</p><p className="mt-1 text-sm text-slate-800">{detail.console_admission_active ? "已授予" : "未授予"}</p></div>
        </section>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          目前帳號沒有 admin.management.staff.read 權限，無法查看此人員的生命週期資料。下方的精靈與操作表單仍可使用——例如 Break-glass 復原情境下，行動者通常只持有寫入權限，沒有讀取權限。
        </p>
      )}

      {authority ? (() => {
        const active = new Set(authority.entitlements.filter((item) => item.status === "active").map((item) => item.permissionKey));
        const missing = PRIMARY_READY_KEYS.filter((key) => !active.has(key));
        const ready = missing.length === 0;
        return (
          <section className={`rounded-xl border px-5 py-4 ${ready ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <p className={`text-sm font-bold ${ready ? "text-emerald-900" : "text-slate-800"}`}>
              {ready ? "PRIMARY READY — 已具備每日最高權限管理所需的完整權限組合" : `尚未 PRIMARY READY，缺少 ${missing.length} 項：`}
            </p>
            {!ready ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {missing.map((key) => (
                  <li className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[10px] text-amber-800" key={key}>{key}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-[11px] text-slate-500">此標示僅為畫面顯示的衍生狀態，非資料庫角色；實際權限一律以逐項 admin.management.* 授權為準。</p>
          </section>
        );
      })() : null}

      <PrimaryWizard staffAccountId={staffAccountId} targetRelation={targetRelation} />

      <ManagerPresetPanel
        actorCanWrite={actorCanWrite && Boolean(detail)}
        actorCanConsoleAdmission={actorCanConsoleAdmission}
        selfTarget={detail?.auth_user_id === actorSubject}
        staffAccountId={staffAccountId}
      />

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
        initialStatus={detail?.status ?? "active"}
        initialStatusVersion={detail?.status_version ?? 0}
        staffAccountId={staffAccountId}
      />
      {!detail ? (
        <p className="text-xs text-slate-500">
          注意：由於無法讀取此帳號目前的 status_version，「停用／恢復／撤銷此人員帳號」三項操作可能因版本不符而遭拒絕；
          授予主控台存取、授予高權限等不依賴 status_version 的操作不受影響。
        </p>
      ) : null}
    </article>
  );
}

export default createAdminManagementParamPage<{ staffAccountId: string }>(
  "management-staff-detail",
  (context, params) => <StaffDetailView
    actorCanConsoleAdmission={context.permissions.includes("admin.management.staff.console_admission.write")}
    actorCanWrite={context.permissions.includes("admin.management.staff.permission.write")}
    actorSubject={context.subject}
    staffAccountId={params.staffAccountId}
  />
);
