import { DashboardShell } from "../../../../components/DashboardShell";
import { TransferLogPanel } from "../../../../components/staff/StaffPanels";

export default function StaffTransfersPage() {
  return (
    <DashboardShell title="調動紀錄" subtitle="查看調店、角色調整與操作者紀錄。">
      <TransferLogPanel />
    </DashboardShell>
  );
}
