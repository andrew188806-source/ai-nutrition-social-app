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
    </article>
  );
}

export default createAdminManagementPage("management-settings", () => <SettingsView />);
