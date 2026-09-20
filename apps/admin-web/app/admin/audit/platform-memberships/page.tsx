import { createAdminManagementPage } from "../../../../components/admin-shell/AdminManagementPage";
import { AdminMembershipAudit } from "../../../../components/admin-shell/AdminMembershipAudit";
import { AdminWorkspaceHeader } from "../../../../components/admin-shell/AdminWorkspaceHeader";
import { getAdminRoute } from "../../../../components/admin-shell/admin-ia-navigation";

export default createAdminManagementPage("audit-platform-memberships", () => (
  <article className="space-y-5">
    <AdminWorkspaceHeader
      description="平台管理員授權與撤銷的唯讀生命週期稽核；僅顯示既有正式稽核資料。"
      entry={getAdminRoute("audit-platform-memberships")}
    />
    <AdminMembershipAudit />
  </article>
));
