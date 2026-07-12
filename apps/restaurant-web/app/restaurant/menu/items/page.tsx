import { DashboardShell } from "../../../../components/DashboardShell";
import { MenuListPanel } from "../../../../components/menu/MenuListPanel";

export default function MenuItemsPage() {
  return (
    <DashboardShell title="餐點管理" subtitle="第一階段以餐點清單與營養標誌提示為主。">
      <MenuListPanel />
    </DashboardShell>
  );
}
