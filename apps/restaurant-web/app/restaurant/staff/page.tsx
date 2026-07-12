import { DashboardShell } from "../../../components/DashboardShell";
import { StaffListPanel } from "../../../components/staff/StaffPanels";

export default function StaffPage() {
  return (
    <DashboardShell title="人員與權限" subtitle="輕量管理人員、角色、登入權限與生效日期；不做完整 HR 系統。">
      <StaffListPanel />
    </DashboardShell>
  );
}
