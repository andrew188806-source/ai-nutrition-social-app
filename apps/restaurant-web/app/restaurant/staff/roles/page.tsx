import { DashboardShell } from "../../../../components/DashboardShell";
import { RolePermissionPanel } from "../../../../components/staff/StaffPanels";

export default function StaffRolesPage() {
  return (
    <DashboardShell title="職位與權限" subtitle="維持後台角色的最小可用版本，不延伸排班、薪資或績效。">
      <RolePermissionPanel />
    </DashboardShell>
  );
}
