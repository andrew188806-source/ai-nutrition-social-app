import { createAdminManagementPage } from "../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../components/admin-shell/admin-ia-navigation";
import { createAdminSupabaseServerClient } from "../../../../auth/supabase-server";

type UseLogRow = Readonly<{
  use_id: string;
  actor_auth_user_id: string;
  actor_staff_account_id: string;
  target_auth_user_id: string | null;
  target_staff_account_id: string | null;
  operation_kind: string;
  permission_key: string | null;
  reason_code: string | null;
  request_id: string;
  step_up_method: string;
  used_at: string;
}>;

type OutboxRow = Readonly<{
  notification_id: string;
  actor_auth_user_id: string;
  target_auth_user_id: string | null;
  target_staff_account_id: string | null;
  event_type: string;
  priority: "critical" | "high" | string;
  permission_key: string | null;
  reason_code: string | null;
  request_id: string;
  created_at: string;
  dispatched_at: string | null;
}>;

function priorityBadge(priority: string) {
  const cls = priority === "critical"
    ? "border-rose-300 bg-rose-50 text-rose-900"
    : priority === "high"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{priority}</span>;
}

async function SecurityLogView() {
  const client = createAdminSupabaseServerClient();
  const [usesResult, outboxResult] = await Promise.all([
    client.rpc("staff_management_receipt_use_log_v1", { requested_limit: 50 }),
    client.rpc("staff_management_security_outbox_v1", { requested_limit: 50 })
  ]);
  const uses = (usesResult.error ? [] : (usesResult.data as UseLogRow[] | null)) ?? [];
  const outbox = (outboxResult.error ? [] : (outboxResult.data as OutboxRow[] | null)) ?? [];
  const forbidden = Boolean(usesResult.error) || Boolean(outboxResult.error);

  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="P3H 高權限 Step-Up 操作證據與安全通知事件的唯讀紀錄；不提供任何操作按鈕。"
        entry={getAdminRoute("management-security-log")}
      />
      {forbidden || (uses.length === 0 && outbox.length === 0) ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          目前帳號沒有 admin_audit.read 權限，或目前沒有任何紀錄。
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-bold text-slate-950">安全通知事件（Security Outbox）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-bold">時間</th>
                <th className="px-4 py-2 font-bold">事件類型</th>
                <th className="px-4 py-2 font-bold">優先等級</th>
                <th className="px-4 py-2 font-bold">行動者 Auth UUID</th>
                <th className="px-4 py-2 font-bold">目標</th>
                <th className="px-4 py-2 font-bold">權限鍵值</th>
                <th className="px-4 py-2 font-bold">原因代碼</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outbox.map((row) => (
                <tr key={row.notification_id}>
                  <td className="px-4 py-2 text-slate-500">{new Date(row.created_at).toLocaleString("zh-TW")}</td>
                  <td className="px-4 py-2 font-mono text-slate-800">{row.event_type}</td>
                  <td className="px-4 py-2">{priorityBadge(row.priority)}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{row.actor_auth_user_id}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{row.target_staff_account_id ?? row.target_auth_user_id ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{row.permission_key ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{row.reason_code ?? "—"}</td>
                </tr>
              ))}
              {outbox.length === 0 ? <tr><td className="px-4 py-4 text-center text-slate-500" colSpan={7}>無資料</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-bold text-slate-950">Step-Up 憑證使用紀錄（Receipt Use Log）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-bold">時間</th>
                <th className="px-4 py-2 font-bold">操作類型</th>
                <th className="px-4 py-2 font-bold">行動者人員帳號</th>
                <th className="px-4 py-2 font-bold">目標</th>
                <th className="px-4 py-2 font-bold">權限鍵值</th>
                <th className="px-4 py-2 font-bold">驗證方式</th>
                <th className="px-4 py-2 font-bold">原因代碼</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uses.map((row) => (
                <tr key={row.use_id}>
                  <td className="px-4 py-2 text-slate-500">{new Date(row.used_at).toLocaleString("zh-TW")}</td>
                  <td className="px-4 py-2 font-mono text-slate-800">{row.operation_kind}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{row.actor_staff_account_id}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{row.target_staff_account_id ?? row.target_auth_user_id ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{row.permission_key ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{row.step_up_method}</td>
                  <td className="px-4 py-2 text-slate-600">{row.reason_code ?? "—"}</td>
                </tr>
              ))}
              {uses.length === 0 ? <tr><td className="px-4 py-4 text-center text-slate-500" colSpan={7}>無資料</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}

export default createAdminManagementPage("management-security-log", () => <SecurityLogView />);
