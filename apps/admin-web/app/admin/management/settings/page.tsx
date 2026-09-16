import { createAdminManagementPage } from "../../../../components/admin-shell/AdminManagementPage";
import { AdminWorkspaceHeader } from "../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../components/admin-shell/admin-ia-navigation";
import { SecuritySettingsPanel } from "../../../../components/admin-shell/SecuritySettingsPanel";

function SettingsView() {
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader
        description="個人安全設定：Authenticator（TOTP）與 Step-Up 狀態。此頁不提供平台層級設定。"
        entry={getAdminRoute("management-settings")}
      />
      <SecuritySettingsPanel />
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <h2 className="text-sm font-bold">Authenticator 遺失時的救援順序</h2>
        <p className="mt-2">
          密碼單獨重設<strong>無法</strong>恢復任何高權限操作能力——這是刻意的安全邊界，不是尚未完成的功能。
          遺失 Authenticator 時，依序嘗試：
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>若有其他裝置已設定同一組 Authenticator 密鑰，直接使用該裝置繼續 Step-Up。</li>
          <li>請一位仍持有有效 Step-Up 能力的其他 Primary Permission Manager 協助處理（見「人員」頁）。</li>
          <li>若沒有任何其他 Primary 可用，才使用資料庫擁有者專用的 Break-glass 緊急控制平面。</li>
        </ol>
      </section>
    </article>
  );
}

export default createAdminManagementPage("management-settings", () => <SettingsView />);
