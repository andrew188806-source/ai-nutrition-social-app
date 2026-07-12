import { DashboardShell } from "../../../../components/DashboardShell";
import { PendingItemsPanel } from "../../../../components/menu/PendingItemsPanel";

export default function PendingMenuItemsPage() {
  return (
    <DashboardShell title="待確認餐點" subtitle="處理使用者輸入或辨識到、但尚未在正式菜單中的餐點名稱。">
      <PendingItemsPanel />
    </DashboardShell>
  );
}
