import { DashboardShell } from "../../../../components/DashboardShell";
import { BranchAssignmentPanel } from "../../../../components/staff/StaffPanels";

export default function StaffBranchesPage() {
  return (
    <DashboardShell title="分店配置" subtitle="指派人員到分店並設定角色與生效日期。">
      <BranchAssignmentPanel />
    </DashboardShell>
  );
}
